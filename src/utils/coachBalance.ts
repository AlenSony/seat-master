/**
 * coachBalance.ts
 * ──────────────────────────────────────────────────────────────────────────
 * Frontend mirror of the backend LWD (Lateral Weight Distribution) logic.
 * Used for real-time visual feedback in the CoachStabilityGauge component
 * BEFORE the server confirms the booking. This ensures the UI updates
 * instantly as the user clicks seats, without a round-trip to the backend.
 *
 * TypeScript Interfaces
 * ─────────────────────
 */

// ── Lateral side classification ────────────────────────────────────────────
export type LateralSide = "left" | "right";

/**
 * Extended seat info used for balance calculations.
 * The `columnIndex` maps directly to the DB `column_index` field.
 */
export interface SeatWithPosition {
  id: string;          // seat_id as string
  columnIndex: number; // 0-indexed within the row (0..2 = Left, 3..4 = Right)
}

/** Result returned by calculateFrontendCoachBalance */
export interface CoachBalanceResult {
  safe: boolean;
  totalSeats: number;
  occupiedLeft: number;
  occupiedRight: number;
  totalOccupied: number;
  imbalance: number;
  imbalanceLimit: number;
  belowThreshold: boolean;
  balanceFactor: number;  // 0 = balanced, 1 = fully imbalanced
  occupancyRatio: number; // 0..1
}

/** Payload received via the coach_balance_updated socket event */
export interface CoachBalanceSocketPayload {
  train_id: string | number;
  coach_id: string | number;
  date: string;
  balance: CoachBalanceResult;
}

// ── Constants (mirror backend thresholds) ─────────────────────────────────
const OCCUPANCY_THRESHOLD = 0.40;  // 40%
const IMBALANCE_LIMIT_PCT  = 0.15; // 15% of total seats

/**
 * Classify a seat as left or right based on its column_index.
 * Columns 0-2 → Left side of the coach
 * Columns 3-4 → Right side of the coach
 */
export const getLateralSide = (columnIndex: number): LateralSide =>
  columnIndex <= 2 ? "left" : "right";

/**
 * Front-end coach balance check.
 * Mirrors backend `calculateCoachBalance()` without a DB call.
 *
 * @param allSeatsInCoach   All seat objects in the selected coach (from backend data)
 * @param bookedSeatIds     Set of already-booked seat IDs (string)
 * @param pendingSelectedIds IDs the current user has clicked (to-be-booked)
 * @param totalCapacity     Coach capacity from coach.totalSeats
 */
export const calculateFrontendCoachBalance = (
  allSeatsInCoach: SeatWithPosition[],
  bookedSeatIds: Set<string>,
  pendingSelectedIds: string[],
  totalCapacity: number
): CoachBalanceResult => {
  const totalSeats = totalCapacity;

  // All occupied = existing bookings + current pending selections
  const allOccupiedIds = new Set<string>([
    ...bookedSeatIds,
    ...pendingSelectedIds,
  ]);
  const totalOccupied = allOccupiedIds.size;

  // Threshold check
  const occupancyRatio = totalSeats > 0 ? totalOccupied / totalSeats : 0;
  const belowThreshold = occupancyRatio <= OCCUPANCY_THRESHOLD;

  // Build a column_index lookup for fast classification
  const seatColumnMap = new Map<string, number>();
  for (const seat of allSeatsInCoach) {
    seatColumnMap.set(seat.id, seat.columnIndex);
  }

  // Count occupied per side
  let occupiedLeft = 0;
  let occupiedRight = 0;
  for (const seatId of allOccupiedIds) {
    const col = seatColumnMap.get(seatId);
    if (col === undefined) continue; // seat not in this coach
    if (getLateralSide(col) === "left") occupiedLeft++;
    else occupiedRight++;
  }

  const imbalance = Math.abs(occupiedLeft - occupiedRight);
  const imbalanceLimit = totalSeats * IMBALANCE_LIMIT_PCT;

  const safe = belowThreshold || imbalance <= imbalanceLimit;

  // Balance factor: 0 = perfect balance, 1 = all weight on one side
  const maxPossibleImbalance = Math.max(occupiedLeft + occupiedRight, 1);
  const balanceFactor =
    Math.round((imbalance / maxPossibleImbalance) * 100) / 100;

  return {
    safe,
    totalSeats,
    occupiedLeft,
    occupiedRight,
    totalOccupied,
    imbalance,
    imbalanceLimit: Math.round(imbalanceLimit * 10) / 10,
    belowThreshold,
    balanceFactor,
    occupancyRatio: Math.round(occupancyRatio * 100) / 100,
  };
};

/**
 * Returns a human-readable stability label and color token for a given balance factor.
 */
export const getStabilityLevel = (
  balanceFactor: number,
  belowThreshold: boolean
): { label: string; color: string; severity: "safe" | "warning" | "danger" } => {
  if (belowThreshold || balanceFactor <= 0.15) {
    return { label: "Balanced", color: "#22c55e", severity: "safe" };
  }
  if (balanceFactor <= 0.40) {
    return { label: "Slight Imbalance", color: "#f59e0b", severity: "warning" };
  }
  if (balanceFactor <= 0.65) {
    return { label: "Moderate Imbalance", color: "#f97316", severity: "warning" };
  }
  return { label: "Critical Imbalance", color: "#ef4444", severity: "danger" };
};
