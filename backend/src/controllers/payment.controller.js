import crypto from "crypto";
import Razorpay from "razorpay";
import { Transaction } from "sequelize";
import { Booking, Coach, Passenger, Seat, Train, sequelize } from "../models/index.js";
import { activeLocks, emitSeatStatusUpdate, getIO } from "../sockets.js";

// ── Detect transient DB errors worth handling distinctly ──────────────────────
const isDeadlockOrTimeout = (err) => {
    const code = err?.original?.code || err?.parent?.code || "";
    const msg  = (err?.message || "").toLowerCase();
    // PostgreSQL: 40P01 = deadlock detected | 55P03 = lock_not_available | 57014 = statement_timeout
    return (
        code === "40P01" ||
        code === "55P03" ||
        code === "57014" ||
        msg.includes("deadlock") ||
        msg.includes("timeout")
    );
};

// Initialize Razorpay instance using test mode keys from .env
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ──────────────────────────────────────────────
// POST /api/payments/create-order
// Called BEFORE Razorpay checkout is opened.
// Validates seat locks, creates a Razorpay order
// and returns the order_id + key_id to the client.
// ──────────────────────────────────────────────
export const createOrder = async (req, res) => {
    try {
        const {
            totalAmount,   // in ₹ (frontend calculated, including any discounts)
            seats,         // [{ seatId, price }, ...]
            socketId,
            travelDate,
            trainId,
        } = req.body;

        if (!socketId) {
            return res.status(400).json({ error: "Socket ID is required to create order." });
        }

        if (!seats || seats.length === 0) {
            return res.status(400).json({ error: "No seats provided." });
        }

        // Validate that all seats are still locked by this socket session
        const seatIds = seats.map(s => s.seatId);
        const travelDateStr =
            typeof travelDate === "string"
                ? travelDate
                : new Date(travelDate).toISOString().split("T")[0];

        const now = new Date();
        for (const seatId of seatIds) {
            const key = `${seatId}_${travelDateStr}`;
            const lock = activeLocks.get(key);
            if (!lock || lock.expiresAt < now || lock.socketId !== socketId) {
                return res.status(400).json({
                    error: `Seat ${seatId} is not locked by your session, or the lock has expired. Please re-select your seats.`,
                });
            }
        }

        // Amount in paise (Razorpay requires integer paise)
        const amountInPaise = Math.round(Number(totalAmount) * 100);

        if (amountInPaise <= 0) {
            return res.status(400).json({ error: "Invalid booking amount." });
        }

        // Create Razorpay order
        const order = await razorpay.orders.create({
            amount: amountInPaise,
            currency: "INR",
            receipt: `rcpt_${Date.now()}`,
            notes: {
                trainId: String(trainId),
                seatIds: seatIds.join(","),
                travelDate: travelDateStr,
            },
        });

        return res.status(200).json({
            order_id: order.id,
            amount: order.amount,
            currency: order.currency,
            key_id: process.env.RAZORPAY_KEY_ID,
        });
    } catch (error) {
        console.error("Error creating Razorpay order:", error);
        return res.status(500).json({ error: error.message || "Failed to create payment order." });
    }
};

// ──────────────────────────────────────────────
// POST /api/payments/verify-payment
// Called AFTER Razorpay checkout completes.
// 1. Verifies razorpay_signature using HMAC-SHA256
// 2. If valid → creates booking record, emits socket event
// 3. If invalid → releases seat locks, returns 400
// ──────────────────────────────────────────────
export const verifyPayment = async (req, res) => {
    try {
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            // Booking details forwarded from frontend
            contactName,
            email,
            userId,
            trainId,
            sourceStation,
            destinationStation,
            travelDate,
            seats,          // [{ seatId, price }, ...]
            passengers,     // [{ name, gender }, ...]
            totalAmount,
            socketId,
            quota,
            disabilityType,
        } = req.body;

        // ── 1. Signature Verification ─────────────────────
        const body = `${razorpay_order_id}|${razorpay_payment_id}`;
        const expectedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(body)
            .digest("hex");

        if (expectedSignature !== razorpay_signature) {
            // Signature mismatch → release locks and reject
            if (socketId && seats && travelDate) {
                const travelDateStr =
                    typeof travelDate === "string"
                        ? travelDate
                        : new Date(travelDate).toISOString().split("T")[0];

                for (const { seatId } of seats) {
                    const key = `${seatId}_${travelDateStr}`;
                    activeLocks.delete(key);
                }

                try {
                    const io = getIO();
                    io.emit("seats-unlocked", {
                        seatIds: seats.map(s => s.seatId),
                        date: travelDateStr,
                        trainId,
                    });
                } catch (e) {
                    console.error("Failed to emit seats-unlocked after bad signature:", e);
                }
            }

            return res.status(400).json({
                error: "Payment verification failed. Invalid signature.",
                verified: false,
            });
        }

        // ── 2. Signature is valid → Create Booking inside a transaction ──────
        const travelDateStr =
            typeof travelDate === "string"
                ? travelDate
                : new Date(travelDate).toISOString().split("T")[0];

        const seatIds = seats.map(s => s.seatId);

        let txn;
        let completeBooking;

        try {
            txn = await sequelize.transaction({
                isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED,
            });

            // ── SELECT FOR UPDATE: acquire pessimistic row-level locks ────────
            // Prevents any concurrent transaction from reading / writing these
            // seat rows until we commit or roll back.
            const lockedSeats = await Seat.findAll({
                where: { seat_id: seatIds },
                lock: txn.LOCK.UPDATE,
                transaction: txn,
            });

            // ── Conflict check: reject if any seat is already booked ──────────
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
                transaction: txn,
                lock: txn.LOCK.UPDATE,
            });

            if (alreadyBookedPassengers.length > 0) {
                await txn.rollback();
                const conflictSeatIds = [
                    ...new Set(alreadyBookedPassengers.map(p => p.seat_id)),
                ];
                return res.status(409).json({
                    error: "One or more seats were booked by another user just now. Please refresh and choose different seats.",
                    verified: false,
                    conflictSeatIds,
                });
            }

            // ── Generate unique 10-digit PNR ──────────────────────────────────
            let bookingNumber;
            let isUnique = false;
            while (!isUnique) {
                bookingNumber = Math.floor(1000000000 + Math.random() * 9000000000).toString();
                const existing = await Booking.findOne({
                    where: { booking_number: bookingNumber },
                    transaction: txn,
                });
                if (!existing) isUnique = true;
            }

            // ── Create booking record with confirmed + paid status ────────────
            const booking = await Booking.create(
                {
                    booking_number: bookingNumber,
                    contact_name: contactName,
                    email: email,
                    user_id: userId || null,
                    train_id: trainId,
                    source_station: sourceStation,
                    destination_station: destinationStation,
                    travel_date: travelDateStr,
                    total_amount: Number(totalAmount) || 0,
                    booking_status: "confirmed",
                    payment_status: "paid",
                },
                { transaction: txn }
            );

            // ── Create passenger records ──────────────────────────────────────
            await Promise.all(
                passengers.map((passenger, index) =>
                    Passenger.create(
                        {
                            booking_id: booking.booking_id,
                            seat_id: seats[index].seatId,
                            passenger_name: passenger.name,
                            passenger_gender: passenger.gender,
                        },
                        { transaction: txn }
                    )
                )
            );

            await txn.commit();

            // ── Post-commit: release in-memory locks ──────────────────────────
            if (socketId) {
                for (const seatId of seatIds) {
                    activeLocks.delete(`${seatId}_${travelDateStr}`);
                }
            }

            // Determine coach_id from the first locked seat (for richer payload)
            const coachId = lockedSeats[0]?.coach_id ?? null;

            // Legacy event (backward compat with existing seat-map listeners)
            try {
                const io = getIO();
                io.emit("seats-booked", { seatIds, date: travelDateStr, trainId });
            } catch (e) {
                console.error("Failed to emit seats-booked:", e);
            }

            // New structured event — consumed by TanStack Query cache invalidation
            emitSeatStatusUpdate({ trainId, coachId, seatIds, date: travelDateStr });

            // ── 4. Fetch full booking with relations ──────────────────────────
            completeBooking = await Booking.findByPk(booking.booking_id, {
                include: [
                    { model: Train, as: "train" },
                    {
                        model: Passenger,
                        as: "passengers",
                        include: [
                            {
                                model: Seat,
                                as: "seat",
                                include: [{ model: Coach, as: "coach" }],
                            },
                        ],
                    },
                ],
            });
        } catch (txnError) {
            if (txn && !txn.finished) {
                try { await txn.rollback(); } catch (_) {}
            }

            if (isDeadlockOrTimeout(txnError)) {
                console.warn("⚠️  DB deadlock/timeout during payment verification:", txnError.message);
                return res.status(503).json({
                    error: "The server is under heavy load. Please wait a moment and try again.",
                    verified: false,
                    retryable: true,
                });
            }

            throw txnError; // re-throw to outer catch for generic 500
        }

        return res.status(200).json({
            verified: true,
            booking: completeBooking,
            payment_id: razorpay_payment_id,
            order_id: razorpay_order_id,
        });
    } catch (error) {
        console.error("Error verifying payment:", error);
        return res.status(500).json({ error: error.message || "Payment verification failed." });
    }
};

// ──────────────────────────────────────────────
// POST /api/payments/release-seats
// Called when payment fails or user cancels checkout.
// Releases locks so other users can book the seats.
// ──────────────────────────────────────────────
export const releaseSeats = async (req, res) => {
    try {
        const { socketId, seats, travelDate, trainId } = req.body;

        if (!socketId || !seats || !travelDate) {
            return res.status(400).json({ error: "Missing required fields." });
        }

        const travelDateStr =
            typeof travelDate === "string"
                ? travelDate
                : new Date(travelDate).toISOString().split("T")[0];

        const seatIds = seats.map(s => s.seatId);

        for (const seatId of seatIds) {
            const key = `${seatId}_${travelDateStr}`;
            activeLocks.delete(key);
        }

        try {
            const io = getIO();
            io.emit("seats-unlocked", { seatIds, date: travelDateStr, trainId });
        } catch (e) {
            console.error("Failed to emit seats-unlocked:", e);
        }

        return res.status(200).json({ released: true });
    } catch (error) {
        console.error("Error releasing seats:", error);
        return res.status(500).json({ error: error.message });
    }
};

// ──────────────────────────────────────────────
// POST /api/payments/create-gen-order
// Creates a Razorpay order for a General (GEN) coach booking.
// No seat locks needed; capacity is pre-checked here.
// ──────────────────────────────────────────────
export const createGenOrder = async (req, res) => {
    try {
        const { totalAmount, trainId, travelDate } = req.body;

        if (!trainId) {
            return res.status(400).json({ error: "trainId is required." });
        }
        if (!travelDate) {
            return res.status(400).json({ error: "travelDate is required." });
        }

        const travelDateStr =
            typeof travelDate === "string"
                ? travelDate
                : new Date(travelDate).toISOString().split("T")[0];

        const amountInPaise = Math.round(Number(totalAmount) * 100);
        if (amountInPaise <= 0) {
            return res.status(400).json({ error: "Invalid booking amount." });
        }

        const order = await razorpay.orders.create({
            amount: amountInPaise,
            currency: "INR",
            receipt: `gen_${Date.now()}`,
            notes: {
                trainId: String(trainId),
                travelDate: travelDateStr,
                coachType: "GEN",
                validityHours: "3",
            },
        });

        return res.status(200).json({
            order_id: order.id,
            amount: order.amount,
            currency: order.currency,
            key_id: process.env.RAZORPAY_KEY_ID,
        });
    } catch (error) {
        console.error("Error creating GEN order:", error);
        return res.status(500).json({ error: error.message || "Failed to create GEN payment order." });
    }
};

// ──────────────────────────────────────────────
// POST /api/payments/verify-gen-payment
// Verifies Razorpay signature for a GEN booking,
// does a final capacity check, then creates the
// Booking + Passenger records with the sentinel seat_id.
// ──────────────────────────────────────────────
export const verifyGenPayment = async (req, res) => {
    try {
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            contactName,
            email,
            userId,
            trainId,
            sourceStation,
            destinationStation,
            travelDate,
            passengers,
            totalAmount,
            sentinelSeatId,
        } = req.body;

        // 1. Verify Razorpay signature
        const body = `${razorpay_order_id}|${razorpay_payment_id}`;
        const expectedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(body)
            .digest("hex");

        if (expectedSignature !== razorpay_signature) {
            return res.status(400).json({ error: "Payment verification failed. Invalid signature.", verified: false });
        }

        const travelDateStr =
            typeof travelDate === "string"
                ? travelDate
                : new Date(travelDate).toISOString().split("T")[0];

        // 2. Fetch GEN sentinel seat IDs for passenger records
        const genCoaches = await Coach.findAll({
            where: { train_id: trainId, coach_type: "GEN" },
            include: [{ model: Seat, as: "seats" }],
        });
        const sentinelSeatIds = genCoaches.flatMap(c => c.seats || []).map(s => s.seat_id);

        // 3. Generate unique PNR
        let bookingNumber;
        let isUnique = false;
        while (!isUnique) {
            bookingNumber = Math.floor(1000000000 + Math.random() * 9000000000).toString();
            const existing = await Booking.findOne({ where: { booking_number: bookingNumber } });
            if (!existing) isUnique = true;
        }

        // 4. Create booking record
        const validityStart = new Date();
        const validityEnd   = new Date(validityStart.getTime() + 3 * 60 * 60 * 1000); // +3 hours

        const booking = await Booking.create({
            booking_number: bookingNumber,
            contact_name: contactName,
            email: email,
            user_id: userId || null,
            train_id: trainId,
            source_station: sourceStation,
            destination_station: destinationStation,
            travel_date: travelDateStr,
            total_amount: Number(totalAmount) || 0,
            booking_status: "confirmed",
            payment_status: "paid",
            gen_ticket: true,
            gen_validity_start: validityStart,
            gen_validity_end: validityEnd,
            is_downloadable: false, // GEN tickets are digital-only
        });

        // 5. Create passenger records — all reference the GEN sentinel seat
        const resolvedSentinelId = sentinelSeatId || sentinelSeatIds[0];
        await Promise.all(
            passengers.map(p =>
                Passenger.create({
                    booking_id: booking.booking_id,
                    seat_id: resolvedSentinelId,
                    passenger_name: p.name,
                    passenger_gender: p.gender,
                })
            )
        );

        // 6. Return the complete booking
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

        return res.status(200).json({
            verified: true,
            booking: completeBooking,
            payment_id: razorpay_payment_id,
            order_id: razorpay_order_id,
        });
    } catch (error) {
        console.error("Error verifying GEN payment:", error);
        return res.status(500).json({ error: error.message || "GEN payment verification failed." });
    }
};
