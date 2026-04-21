/**
 * coachBalance.js
 * ──────────────────────────────────────────────────────────────────────────
 * Lateral Weight Distribution (LWD) Safety Utility
 *
 * Engineering Rationale
 * ─────────────────────
 * Uneven lateral weight distribution shifts the Centre of Gravity (CoG) of a
 * coach sideways. In high-speed curves this amplifies centrifugal force on the
 * outer bogie wheels, increasing the risk of rail-climb derailment. It also
 * causes asymmetric wear on the primary suspension (springs/dampers) on the
 * heavier side, raising long-term maintenance costs.
 *
 * Lateral Axis Definition
 * ───────────────────────
 * The classification is based on `column_index` stored per seat in the DB:
 *
 *   Coach type  |  Left side columns  |  Right side columns
 *   ───────────────────────────────────────────────────────
 *   Sleeper/AC  |  0, 1, 2  (berths 1-3 per compartment)  |  3, 4  (berths 4-6 per compartment)
 *   Chair Car   |  0, 1, 2  (A, B, C)                      |  3, 4  (D, E)
 *
 * This maps directly to the seat's `column_index` in the seats table.
 * Left = column_index 0..2 ; Right = column_index 3..4
 *
 * Threshold Rule
 * ──────────────
 *   - The check only activates when total occupancy (current + pending) > 40% of capacity.
 *   - If |OccupancyL − OccupancyR| > totalSeats × 0.15 → flagged as UNSAFE.
 *
 * @module coachBalance
 */

import { Seat, Passenger, Booking, sequelize } from "../models/index.js";
import { Op } from "sequelize";

/**
 * Classify a seat as "left" or "right" based on its column_index.
 * column_index 0, 1, 2  → Left side of coach (A-side / window-middle-aisle on left)
 * column_index 3, 4     → Right side of coach (D-side / aisle-window on right)
 *
 * @param {number} columnIndex
 * @returns {'left' | 'right'}
 */
export const getSeatLateralSide = (columnIndex) => {
  return columnIndex <= 2 ? "left" : "right";
};

/**
 * Calculate the lateral balance of a coach, considering:
 *  - Already confirmed/pending bookings for the given travel date
 *  - A set of new (pending) seat IDs the current user is trying to add
 *
 * @param {number|string} coachId        - DB coach_id
 * @param {number[]}      pendingSeatIds - seat_ids the user wants to book NOW
 * @param {string}        travelDate     - "YYYY-MM-DD"
 * @param {object}        [transaction]  - Optional Sequelize transaction
 *
 * @returns {Promise<{
 *   safe: boolean,
 *   totalSeats: number,
 *   occupiedLeft: number,
 *   occupiedRight: number,
 *   totalOccupied: number,
 *   imbalance: number,
 *   imbalanceLimit: number,
 *   belowThreshold: boolean,
 *   balanceFactor: number
 * }>}
 */
export const calculateCoachBalance = async (
  coachId,
  pendingSeatIds = [],
  travelDate,
  transaction = null
) => {
  // ── 1. Fetch ALL seats in this coach (to know total capacity & column_index) ──
  const allSeats = await Seat.findAll({
    where: { coach_id: coachId },
    attributes: ["seat_id", "column_index"],
    ...(transaction ? { transaction } : {}),
  });

  const totalSeats = allSeats.length;

  // ── 2. Build lateral classification map ────────────────────────────────────
  const seatSideMap = new Map(); // seat_id → 'left' | 'right'
  for (const seat of allSeats) {
    seatSideMap.set(seat.seat_id, getSeatLateralSide(seat.column_index));
  }

  // ── 3. Fetch currently booked seat_ids in this coach for the travel date ───
  const bookedPassengers = await Passenger.findAll({
    attributes: ["seat_id"],
    where: { seat_id: allSeats.map((s) => s.seat_id) },
    include: [
      {
        model: Booking,
        as: "booking",
        attributes: [],
        where: {
          travel_date: travelDate,
          booking_status: { [Op.in]: ["confirmed", "pending"] },
        },
        required: true,
      },
    ],
    ...(transaction ? { transaction } : {}),
  });

  const existingBookedIds = new Set(bookedPassengers.map((p) => p.seat_id));

  // ── 4. Combine existing bookings + pending selections ─────────────────────
  const allOccupiedIds = new Set([
    ...existingBookedIds,
    ...pendingSeatIds.map(Number),
  ]);
  const totalOccupied = allOccupiedIds.size;

  // ── 5. Threshold check: only run balance check if > 40% occupancy ─────────
  const OCCUPANCY_THRESHOLD = 0.40;
  const occupancyRatio = totalSeats > 0 ? totalOccupied / totalSeats : 0;
  const belowThreshold = occupancyRatio <= OCCUPANCY_THRESHOLD;

  // ── 6. Count Left / Right occupied seats ──────────────────────────────────
  let occupiedLeft = 0;
  let occupiedRight = 0;
  for (const seatId of allOccupiedIds) {
    const side = seatSideMap.get(Number(seatId));
    if (side === "left") occupiedLeft++;
    else if (side === "right") occupiedRight++;
  }

  // ── 7. Imbalance calculation ───────────────────────────────────────────────
  const imbalance = Math.abs(occupiedLeft - occupiedRight);
  const imbalanceLimit = totalSeats * 0.15; // 15% of total seats

  // ── 8. Safety verdict ─────────────────────────────────────────────────────
  //    Only UNSAFE if above threshold AND imbalance exceeds limit
  const safe = belowThreshold || imbalance <= imbalanceLimit;

  // ── 9. Balance factor (0 = perfectly balanced, 1 = maximum imbalance) ─────
  //    Used by the frontend gauge. Based on actual filled seats, not total.
  const maxPossibleImbalance = Math.max(occupiedLeft + occupiedRight, 1);
  const balanceFactor = imbalance / maxPossibleImbalance; // 0..1

  return {
    safe,
    totalSeats,
    occupiedLeft,
    occupiedRight,
    totalOccupied,
    imbalance,
    imbalanceLimit: Math.round(imbalanceLimit * 10) / 10,
    belowThreshold,
    balanceFactor: Math.round(balanceFactor * 100) / 100,
    occupancyRatio: Math.round(occupancyRatio * 100) / 100,
  };
};
