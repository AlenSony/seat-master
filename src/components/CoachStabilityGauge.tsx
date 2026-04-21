/**
 * CoachStabilityGauge.tsx
 * ──────────────────────────────────────────────────────────────────────────
 * Real-time "Coach Stability" UI component.
 *
 * Renders a horizontal balance scale that tilts left or right to visualise
 * the lateral weight distribution of the selected coach. Updates in real-time:
 *   • As the USER clicks seats (via the frontend balance utility)
 *   • When OTHER users book seats (via the `coach_balance_updated` Socket.io event)
 *
 * Engineering Pillars (Viva Defence)
 * ───────────────────────────────────
 * 1. Lateral Stability  — uneven weight shifts CoG; in curves it increases
 *    centrifugal force on outer bogie wheels → derailment risk.
 * 2. Preventative Maintenance — asymmetric loads cause one-sided suspension
 *    wear, raising railway maintenance costs.
 * 3. Safety-First UX — the UI acts as an expert system, not just a data form.
 */

import { motion, AnimatePresence } from "framer-motion";
import { Scale, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { CoachBalanceResult, getStabilityLevel } from "@/utils/coachBalance";

interface CoachStabilityGaugeProps {
  balance: CoachBalanceResult | null;
  /** Show a compact version in the sidebar summary */
  compact?: boolean;
}

const CoachStabilityGauge = ({
  balance,
  compact = false,
}: CoachStabilityGaugeProps) => {
  // No data yet — show idle state
  if (!balance) {
    return (
      <div
        style={{
          borderRadius: "16px",
          border: "1px solid rgba(148,163,184,0.2)",
          background: "rgba(15,23,42,0.6)",
          backdropFilter: "blur(12px)",
          padding: compact ? "12px 16px" : "16px 20px",
          display: "flex",
          alignItems: "center",
          gap: "10px",
        }}
      >
        <Scale
          style={{ width: 18, height: 18, color: "#64748b", flexShrink: 0 }}
        />
        <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 500 }}>
          Select seats to see stability
        </span>
      </div>
    );
  }

  const { label, color, severity } = getStabilityLevel(
    balance.balanceFactor,
    balance.belowThreshold
  );

  // ── Tilt angle for the scale arm: max ±18° ────────────────────────────────
  const tiltAngle =
    balance.occupiedLeft === balance.occupiedRight
      ? 0
      : balance.occupiedLeft > balance.occupiedRight
      ? Math.min(18, balance.balanceFactor * 22)
      : -Math.min(18, balance.balanceFactor * 22);

  // ── Bar fill widths ───────────────────────────────────────────────────────
  const total = Math.max(balance.occupiedLeft + balance.occupiedRight, 1);
  const leftPct = Math.round((balance.occupiedLeft / total) * 100);
  const rightPct = 100 - leftPct;

  // ── Background based on severity ─────────────────────────────────────────
  const bgMap: Record<string, string> = {
    safe: "rgba(34,197,94,0.06)",
    warning: "rgba(249,115,22,0.08)",
    danger: "rgba(239,68,68,0.10)",
  };
  const borderMap: Record<string, string> = {
    safe: "rgba(34,197,94,0.25)",
    warning: "rgba(249,115,22,0.35)",
    danger: "rgba(239,68,68,0.40)",
  };

  if (compact) {
    return (
      <div
        style={{
          borderRadius: "12px",
          border: `1px solid ${borderMap[severity]}`,
          background: bgMap[severity],
          padding: "10px 14px",
          display: "flex",
          alignItems: "center",
          gap: "10px",
        }}
      >
        {/* Animated scale icon */}
        <motion.div
          animate={{ rotate: tiltAngle }}
          transition={{ type: "spring", stiffness: 180, damping: 18 }}
          style={{ flexShrink: 0 }}
        >
          <Scale style={{ width: 16, height: 16, color }} />
        </motion.div>

        {/* Labels */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 4,
            }}
          >
            <span
              style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 600, letterSpacing: "0.04em" }}
            >
              STABILITY
            </span>
            <span style={{ fontSize: "11px", color, fontWeight: 700 }}>
              {label}
            </span>
          </div>

          {/* Balance bar */}
          <div
            style={{
              height: 5,
              borderRadius: 999,
              background: "rgba(100,116,139,0.2)",
              overflow: "hidden",
              display: "flex",
            }}
          >
            <motion.div
              animate={{ width: `${leftPct}%` }}
              transition={{ type: "spring", stiffness: 200, damping: 25 }}
              style={{
                height: "100%",
                background:
                  severity === "safe"
                    ? "linear-gradient(90deg, #22c55e, #4ade80)"
                    : severity === "warning"
                    ? "linear-gradient(90deg, #f59e0b, #fb923c)"
                    : "linear-gradient(90deg, #ef4444, #f87171)",
                borderRadius: "999px 0 0 999px",
              }}
            />
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: 3,
            }}
          >
            <span style={{ fontSize: "10px", color: "#475569" }}>
              L: {balance.occupiedLeft}
            </span>
            <span style={{ fontSize: "10px", color: "#475569" }}>
              R: {balance.occupiedRight}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // ── Full-size gauge ────────────────────────────────────────────────────────
  return (
    <div
      style={{
        borderRadius: "16px",
        border: `1px solid ${borderMap[severity]}`,
        background: bgMap[severity],
        backdropFilter: "blur(12px)",
        padding: "16px 20px",
        transition: "border-color 0.4s, background 0.4s",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {severity === "safe" ? (
            <CheckCircle2 style={{ width: 15, height: 15, color: "#22c55e" }} />
          ) : (
            <AlertTriangle
              style={{
                width: 15,
                height: 15,
                color: severity === "danger" ? "#ef4444" : "#f59e0b",
              }}
            />
          )}
          <span
            style={{
              fontSize: "11px",
              fontWeight: 700,
              color: "#94a3b8",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Coach Stability
          </span>
        </div>

        <AnimatePresence mode="wait">
          <motion.span
            key={label}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.2 }}
            style={{
              fontSize: "11px",
              fontWeight: 700,
              color,
              padding: "2px 8px",
              borderRadius: 999,
              background: `${color}20`,
              border: `1px solid ${color}40`,
            }}
          >
            {label}
          </motion.span>
        </AnimatePresence>
      </div>

      {/* Animated Scale icon */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
        <motion.div
          animate={{ rotate: tiltAngle }}
          transition={{ type: "spring", stiffness: 160, damping: 16 }}
          style={{ position: "relative" }}
        >
          <Scale
            style={{
              width: 40,
              height: 40,
              color,
              filter: severity !== "safe" ? `drop-shadow(0 0 6px ${color}88)` : "none",
              transition: "filter 0.4s",
            }}
          />
        </motion.div>
      </div>

      {/* Left / Right bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 6,
        }}
      >
        <span
          style={{ fontSize: "10px", color: "#94a3b8", width: 12, textAlign: "right" }}
        >
          L
        </span>
        <div
          style={{
            flex: 1,
            height: 8,
            borderRadius: 999,
            background: "rgba(100,116,139,0.2)",
            overflow: "hidden",
            display: "flex",
          }}
        >
          <motion.div
            animate={{ width: `${leftPct}%` }}
            transition={{ type: "spring", stiffness: 200, damping: 25 }}
            style={{
              height: "100%",
              background:
                severity === "safe"
                  ? "linear-gradient(90deg, #22c55e, #4ade80)"
                  : severity === "warning"
                  ? "linear-gradient(90deg, #f59e0b, #fb923c)"
                  : "linear-gradient(90deg, #ef4444, #f87171)",
              borderRadius: "999px 0 0 999px",
            }}
          />
        </div>
        <span style={{ fontSize: "10px", color: "#94a3b8", width: 12 }}>R</span>
      </div>

      {/* Seat counts */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <span style={{ fontSize: "11px", color: "#64748b" }}>
          Left: <strong style={{ color: "#e2e8f0" }}>{balance.occupiedLeft}</strong>
        </span>
        <span style={{ fontSize: "11px", color: "#64748b" }}>
          Right: <strong style={{ color: "#e2e8f0" }}>{balance.occupiedRight}</strong>
        </span>
      </div>

      {/* Occupancy threshold notice */}
      {balance.belowThreshold && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 10px",
            borderRadius: 8,
            background: "rgba(100,116,139,0.1)",
            border: "1px solid rgba(100,116,139,0.2)",
          }}
        >
          <Info style={{ width: 12, height: 12, color: "#64748b", flexShrink: 0 }} />
          <span style={{ fontSize: "10px", color: "#64748b" }}>
            Stability check activates above 40% occupancy
          </span>
        </div>
      )}
    </div>
  );
};

export default CoachStabilityGauge;
