import { Transaction } from "sequelize";
import { Booking, Coach, Passenger, Seat, Train, sequelize } from "../models/index.js";
import { activeLocks, emitSeatStatusUpdate, getIO } from "../sockets.js";

// ── Detect transient DB errors worth logging distinctly ───────────────────────
const isDeadlockOrTimeout = (err) => {
  const code = err?.original?.code || err?.parent?.code || "";
  const msg  = (err?.message || "").toLowerCase();
  // PostgreSQL deadlock detected: 40P01 | lock timeout: 55P03 | statement timeout: 57014
  return (
    code === "40P01" ||
    code === "55P03" ||
    code === "57014" ||
    msg.includes("deadlock") ||
    msg.includes("timeout")
  );
};

// Generate unique 10-digit booking number
const generateBookingNumber = async (t) => {
  let pnr;
  let isUnique = false;
  while (!isUnique) {
    pnr = Math.floor(1000000000 + Math.random() * 9000000000).toString();
    const existing = await Booking.findOne({
      where: { booking_number: pnr },
      transaction: t,
    });
    if (!existing) isUnique = true;
  }
  return pnr;
};

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/bookings
// Creates a booking inside a READ_COMMITTED transaction with SELECT FOR UPDATE
// on the target seats to prevent double-booking race conditions.
// ──────────────────────────────────────────────────────────────────────────────
export const createBooking = async (req, res) => {
  const {
    contactName,
    email,
    trainId,
    sourceStation,
    destinationStation,
    travelDate,
    passengers,
    seats, // Expects [{ seatId, price }, ...]
    userId,
    socketId, // For seat locking validation
    totalAmount: requestTotalAmount,
  } = req.body;

  // ── Pre-flight: calculate total amount ──────────────────────────────────────
  let totalAmount = requestTotalAmount ? Number(requestTotalAmount) : 0;
  if (!totalAmount && seats && seats.length > 0) {
    for (const seatData of seats) {
      if (seatData.price) totalAmount += Number(seatData.price);
    }
  }

  if (!socketId) {
    return res
      .status(400)
      .json({ error: "Socket ID is required to confirm booking." });
  }

  const seatIds = seats.map((s) => s.seatId);
  const travelDateStr =
    typeof travelDate === "string"
      ? travelDate
      : new Date(travelDate).toISOString().split("T")[0];

  // ── Pre-flight: verify in-memory socket locks ────────────────────────────────
  if (seatIds.length > 0) {
    const now = new Date();
    for (const seatId of seatIds) {
      const key = `${seatId}_${travelDateStr}`;
      const lock = activeLocks.get(key);
      if (!lock || lock.expiresAt < now || lock.socketId !== socketId) {
        return res.status(400).json({
          error:
            "One or more seats are not locked by your session, or your lock has expired.",
        });
      }
    }
  }

  // ── Main transactional block ─────────────────────────────────────────────────
  let t;
  try {
    t = await sequelize.transaction({
      isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED,
    });

    // ── SELECT FOR UPDATE: lock seat rows at DB level ────────────────────────
    // This prevents any concurrent transaction from reading or modifying these
    // rows until we commit or rollback.
    const lockedSeats = await Seat.findAll({
      where: { seat_id: seatIds },
      lock: t.LOCK.UPDATE,
      transaction: t,
    });

    // ── Conflict check: look for existing confirmed bookings for these seats ──
    // We join Passengers → Bookings for the same travel date (non-cancelled).
    const alreadyBookedPassengers = await Passenger.findAll({
      where: { seat_id: seatIds },
      include: [
        {
          model: Booking,
          as: "booking",
          where: {
            travel_date: travelDateStr,
            booking_status: ["confirmed", "pending"],
          },
          required: true,
        },
      ],
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (alreadyBookedPassengers.length > 0) {
      await t.rollback();
      const conflictSeatIds = [
        ...new Set(alreadyBookedPassengers.map((p) => p.seat_id)),
      ];
      return res.status(409).json({
        error:
          "One or more seats are already booked. Please refresh and choose different seats.",
        conflictSeatIds,
      });
    }

    // ── All clear — create the booking ──────────────────────────────────────
    const bookingNumber = await generateBookingNumber(t);

    const booking = await Booking.create(
      {
        booking_number: bookingNumber,
        contact_name: contactName,
        email: email,
        user_id: userId || null,
        train_id: trainId,
        source_station: sourceStation,
        destination_station: destinationStation,
        travel_date: travelDate,
        total_amount: totalAmount || 0,
        booking_status: "pending",
        payment_status: "pending",
      },
      { transaction: t }
    );

    // ── Create passenger records ─────────────────────────────────────────────
    await Promise.all(
      passengers.map((passenger, index) =>
        Passenger.create(
          {
            booking_id: booking.booking_id,
            seat_id: seats[index].seatId,
            passenger_name: passenger.name,
            passenger_gender: passenger.gender,
          },
          { transaction: t }
        )
      )
    );

    // ── Commit ───────────────────────────────────────────────────────────────
    await t.commit();

    // ── Post-commit: release in-memory locks & broadcast ────────────────────
    for (const seatId of seatIds) {
      activeLocks.delete(`${seatId}_${travelDateStr}`);
    }

    // Determine coach_id from the first locked seat record
    const coachId = lockedSeats[0]?.coach_id ?? null;

    // Emit legacy event (backward compat with older listeners)
    try {
      const io = getIO();
      io.emit("seats-booked", {
        seatIds,
        date: travelDateStr,
        trainId: trainId,
      });
    } catch (e) {
      console.error("Failed to emit seats-booked:", e);
    }

    // Emit new seat_status_updated event consumed by React + TanStack Query
    emitSeatStatusUpdate({ trainId, coachId, seatIds, date: travelDateStr });

    // ── Return full booking ──────────────────────────────────────────────────
    const completeBooking = await Booking.findByPk(booking.booking_id, {
      include: [
        { model: Train, as: "train" },
        {
          model: Passenger,
          as: "passengers",
          include: [{ model: Seat, as: "seat", include: [{ model: Coach, as: "coach" }] }],
        },
      ],
    });

    return res.status(201).json(completeBooking);
  } catch (error) {
    // Attempt rollback only if the transaction was opened
    if (t && !t.finished) {
      try {
        await t.rollback();
      } catch (rbErr) {
        console.error("Rollback failed:", rbErr.message);
      }
    }

    if (isDeadlockOrTimeout(error)) {
      console.warn("⚠️  DB deadlock/timeout during booking creation:", error.message);
      return res.status(503).json({
        error:
          "The server is under heavy load. Please wait a moment and try again.",
        retryable: true,
      });
    }

    console.error("Error creating booking:", error);
    return res.status(500).json({ error: error.message });
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/bookings/:id
// ──────────────────────────────────────────────────────────────────────────────
export const getBookingById = async (req, res) => {
  try {
    const { id } = req.params;
    const booking = await Booking.findByPk(id, {
      include: [
        { model: Train, as: "train" },
        {
          model: Passenger,
          as: "passengers",
          include: [{ model: Seat, as: "seat", include: [{ model: Coach, as: "coach" }] }],
        },
      ],
    });

    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    return res.json(booking);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/bookings?email=...
// ──────────────────────────────────────────────────────────────────────────────
export const getBookingsByEmail = async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) {
      return res.status(400).json({ error: "Email required" });
    }

    const bookings = await Booking.findAll({
      where: { email: email },
      include: [
        { model: Train, as: "train" },
        {
          model: Passenger,
          as: "passengers",
          include: [{ model: Seat, as: "seat", include: [{ model: Coach, as: "coach" }] }],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    return res.json(bookings);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// PATCH /api/bookings/:id/status
// ──────────────────────────────────────────────────────────────────────────────
export const updateBookingStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { bookingStatus, paymentStatus } = req.body;

    const booking = await Booking.findByPk(id);
    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    if (bookingStatus) booking.booking_status = bookingStatus;
    if (paymentStatus) booking.payment_status = paymentStatus;

    await booking.save();

    // IMPORTANT: Do NOT update seat status here.
    // Seat availability is date-based and checked dynamically.
    // Cancelled bookings are automatically excluded from availability checks.

    return res.json(booking);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/bookings/:id/cancel
// ──────────────────────────────────────────────────────────────────────────────
export const cancelBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const booking = await Booking.findByPk(id);

    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    booking.booking_status = "cancelled";
    await booking.save();

    // IMPORTANT: Do NOT update seat status when cancelling.
    // Seat availability is date-based and checked dynamically via getAvailableSeats().
    // Cancelled bookings are automatically excluded from availability checks.

    return res.json({ message: "Booking cancelled successfully", booking });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
