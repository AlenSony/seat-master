/**
 * ImbalanceModal.tsx
 * ──────────────────────────────────────────────────────────────────────────
 * Educational modal shown when the backend returns ERR_IMBALANCE_LIMIT.
 * Explains the physics of train stability to help users understand WHY
 * certain seat combinations are blocked.
 */

import { motion, AnimatePresence } from "framer-motion";
import { X, AlertTriangle, Scale, Zap, Wrench } from "lucide-react";
import { CoachBalanceResult } from "@/utils/coachBalance";

interface ImbalanceModalProps {
  open: boolean;
  onClose: () => void;
  balance?: Partial<CoachBalanceResult>;
}

const ImbalanceModal = ({ open, onClose, balance }: ImbalanceModalProps) => {
  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.75)",
              backdropFilter: "blur(6px)",
              zIndex: 9998,
            }}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.88, y: 32 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              zIndex: 9999,
              width: "min(520px, 92vw)",
              background: "linear-gradient(145deg, #0f172a, #1e293b)",
              border: "1px solid rgba(239,68,68,0.35)",
              borderRadius: 20,
              boxShadow:
                "0 0 0 1px rgba(239,68,68,0.1), 0 24px 60px rgba(0,0,0,0.7)",
              overflow: "hidden",
            }}
          >
            {/* Header gradient bar */}
            <div
              style={{
                height: 4,
                background:
                  "linear-gradient(90deg, #ef4444, #f97316, #ef4444)",
                backgroundSize: "200%",
                animation: "shimmer 2s linear infinite",
              }}
            />

            <div style={{ padding: "28px 28px 24px" }}>
              {/* Title row */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: 20,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      background: "rgba(239,68,68,0.15)",
                      border: "1px solid rgba(239,68,68,0.3)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Scale style={{ width: 22, height: 22, color: "#ef4444" }} />
                  </div>
                  <div>
                    <h2
                      style={{
                        fontSize: 18,
                        fontWeight: 700,
                        color: "#f1f5f9",
                        margin: 0,
                        lineHeight: 1.2,
                      }}
                    >
                      Imbalance Limit Exceeded
                    </h2>
                    <p
                      style={{
                        fontSize: 12,
                        color: "#ef4444",
                        margin: "4px 0 0",
                        fontWeight: 600,
                      }}
                    >
                      ERR_IMBALANCE_LIMIT
                    </p>
                  </div>
                </div>

                <button
                  onClick={onClose}
                  aria-label="Close"
                  style={{
                    background: "rgba(100,116,139,0.12)",
                    border: "1px solid rgba(100,116,139,0.2)",
                    borderRadius: 8,
                    padding: 6,
                    cursor: "pointer",
                    color: "#94a3b8",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <X style={{ width: 16, height: 16 }} />
                </button>
              </div>

              {/* Balance figures */}
              {balance && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 10,
                    marginBottom: 20,
                  }}
                >
                  {[
                    { label: "Left side occupied", value: balance.occupiedLeft ?? "—" },
                    { label: "Right side occupied", value: balance.occupiedRight ?? "—" },
                    {
                      label: "Imbalance (seats)",
                      value: balance.imbalance ?? "—",
                      accent: "#ef4444",
                    },
                    {
                      label: "Safe limit",
                      value:
                        balance.imbalanceLimit !== undefined
                          ? `≤ ${balance.imbalanceLimit}`
                          : "—",
                      accent: "#22c55e",
                    },
                  ].map((item) => (
                    <div
                      key={item.label}
                      style={{
                        background: "rgba(100,116,139,0.08)",
                        border: "1px solid rgba(100,116,139,0.15)",
                        borderRadius: 10,
                        padding: "10px 14px",
                      }}
                    >
                      <div
                        style={{ fontSize: 10, color: "#64748b", marginBottom: 4 }}
                      >
                        {item.label}
                      </div>
                      <div
                        style={{
                          fontSize: 20,
                          fontWeight: 700,
                          color: item.accent || "#e2e8f0",
                        }}
                      >
                        {item.value}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Educational pillars */}
              <div
                style={{
                  background: "rgba(239,68,68,0.06)",
                  border: "1px solid rgba(239,68,68,0.18)",
                  borderRadius: 12,
                  padding: "16px 18px",
                  marginBottom: 20,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    marginBottom: 14,
                  }}
                >
                  <AlertTriangle
                    style={{ width: 14, height: 14, color: "#ef4444" }}
                  />
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#ef4444",
                      textTransform: "uppercase",
                      letterSpacing: "0.07em",
                    }}
                  >
                    Why does this matter?
                  </span>
                </div>

                {[
                  {
                    icon: <Zap style={{ width: 14, height: 14, color: "#f59e0b" }} />,
                    title: "Lateral Stability",
                    body: "Uneven passenger weight shifts the coach's Centre of Gravity sideways. In high-speed curves, this increases centrifugal force on the outer bogie wheels — a precursor to rail climb and derailment.",
                  },
                  {
                    icon: (
                      <Wrench style={{ width: 14, height: 14, color: "#818cf8" }} />
                    ),
                    title: "Suspension Wear",
                    body: "Persistent imbalance causes asymmetric loading on the primary suspension (springs & dampers) of one bogie side, increasing maintenance costs and reducing component lifespan.",
                  },
                ].map((item) => (
                  <div
                    key={item.title}
                    style={{
                      display: "flex",
                      gap: 10,
                      marginBottom: 10,
                    }}
                  >
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 7,
                        background: "rgba(100,116,139,0.15)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        marginTop: 1,
                      }}
                    >
                      {item.icon}
                    </div>
                    <div>
                      <p
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: "#e2e8f0",
                          margin: "0 0 3px",
                        }}
                      >
                        {item.title}
                      </p>
                      <p
                        style={{
                          fontSize: 11,
                          color: "#94a3b8",
                          margin: 0,
                          lineHeight: 1.6,
                        }}
                      >
                        {item.body}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* CTA */}
              <div
                style={{
                  background: "rgba(99,102,241,0.08)",
                  border: "1px solid rgba(99,102,241,0.2)",
                  borderRadius: 10,
                  padding: "12px 14px",
                  marginBottom: 20,
                  fontSize: 12,
                  color: "#a5b4fc",
                  lineHeight: 1.6,
                }}
              >
                💡 <strong style={{ color: "#c7d2fe" }}>Tip:</strong> Please
                select seats on the{" "}
                <strong style={{ color: "#c7d2fe" }}>
                  {(balance?.occupiedLeft ?? 0) > (balance?.occupiedRight ?? 0)
                    ? "Right"
                    : "Left"}
                </strong>{" "}
                side to restore balance. Highlighted sections on the seat map
                indicate recommended zones.
              </div>

              {/* Close button */}
              <button
                onClick={onClose}
                id="imbalance-modal-close-btn"
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: 12,
                  border: "none",
                  background:
                    "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                  letterSpacing: "0.02em",
                  boxShadow: "0 4px 16px rgba(99,102,241,0.35)",
                  transition: "opacity 0.2s, transform 0.2s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.opacity = "0.9";
                  (e.currentTarget as HTMLButtonElement).style.transform =
                    "scale(1.01)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.opacity = "1";
                  (e.currentTarget as HTMLButtonElement).style.transform =
                    "scale(1)";
                }}
              >
                Choose Different Seats
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default ImbalanceModal;
