import { Server } from 'socket.io';

let io;

// In-memory locks: key: `${seatId}_${date}` (NO socketId in key)
// This ensures only ONE user can hold a lock per seat per date at a time.
// value: { socketId, expiresAt, seatId, date, trainId, source, destination }
export const activeLocks = new Map();

/**
 * Check if a seat is currently locked by someone OTHER than the given socketId.
 * Returns the lock entry if conflicted, or null if the seat is free/self-locked.
 */
const getConflictingLock = (seatId, date, socketId) => {
    const key = `${seatId}_${date}`;
    const lock = activeLocks.get(key);
    if (!lock) return null;                          // not locked at all
    if (lock.expiresAt < new Date()) {               // lock expired — treat as free
        activeLocks.delete(key);
        return null;
    }
    if (lock.socketId === socketId) return null;     // locked by this very socket (re-lock)
    return lock;                                     // locked by someone else ← conflict
};

export const initSockets = (server) => {
    io = new Server(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        }
    });

    io.on("connection", (socket) => {
        console.log(`Socket connected: ${socket.id}`);

        // ── lock-seats ───────────────────────────────────────────────────────────
        socket.on("lock-seats", (data, callback) => {
            console.log(`lock-seats from ${socket.id}:`, data);
            const { seatIds, date, trainId, source, destination } = data;

            if (!seatIds || seatIds.length === 0 || !date || !trainId) {
                if (callback) callback({ success: false, message: "Missing required lock data." });
                return;
            }

            // ── ATOMIC conflict check BEFORE writing any lock ─────────────────
            // If even ONE seat is taken by another user, reject the whole batch.
            for (const seatId of seatIds) {
                const conflict = getConflictingLock(seatId, date, socket.id);
                if (conflict) {
                    console.log(`Seat ${seatId} conflict: held by socket ${conflict.socketId}`);
                    if (callback) callback({
                        success: false,
                        message: `Seat ${seatId} is already selected by another user. Please choose a different seat.`,
                        conflictingSeatId: seatId
                    });
                    return; // reject — don't lock anything
                }
            }

            // ── All seats free — acquire locks ────────────────────────────────
            const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

            for (const seatId of seatIds) {
                const key = `${seatId}_${date}`;
                activeLocks.set(key, {
                    seatId,
                    socketId: socket.id,
                    expiresAt,
                    date,
                    trainId,
                    source,
                    destination
                });
            }

            if (callback) callback({ success: true, message: "Seats locked successfully." });

            // Broadcast to all OTHER clients so their UI updates immediately
            socket.broadcast.emit("seats-locked", { seatIds, date, trainId, source, destination });
        });

        // ── disconnect: release all locks held by this socket ────────────────
        socket.on("disconnect", () => {
            console.log(`Socket disconnected: ${socket.id}, releasing locks...`);
            releaseSeatsBySocket(socket.id);
        });

        // ── cancel-booking: explicit release without disconnect ───────────────
        socket.on("cancel-booking", () => {
            releaseSeatsBySocket(socket.id);
        });
    });

    // ── Background auto-unlock (expired locks) ────────────────────────────────
    setInterval(() => {
        try {
            const now = new Date();
            // Group expired locks by trainId+date for batched broadcast
            const expiredByTrainDate = new Map();

            for (const [key, lock] of activeLocks.entries()) {
                if (lock.expiresAt < now) {
                    activeLocks.delete(key);

                    const groupKey = `${lock.trainId}_${lock.date}`;
                    if (!expiredByTrainDate.has(groupKey)) {
                        expiredByTrainDate.set(groupKey, { trainId: lock.trainId, date: lock.date, seatIds: [] });
                    }
                    expiredByTrainDate.get(groupKey).seatIds.push(lock.seatId);
                }
            }

            for (const group of expiredByTrainDate.values()) {
                console.log(`Auto-unlocking expired seats:`, group.seatIds);
                io.emit("seats-unlocked", {
                    seatIds: group.seatIds,
                    date: group.date,
                    trainId: group.trainId
                });
            }
        } catch (error) {
            console.error("Error in auto-unlock interval:", error);
        }
    }, 30 * 1000);
};

/**
 * Release all locks held by a given socketId and notify other clients.
 */
function releaseSeatsBySocket(socketId) {
    try {
        // Group released locks by trainId+date for batched broadcast
        const releasedByTrainDate = new Map();

        for (const [key, lock] of activeLocks.entries()) {
            if (lock.socketId === socketId) {
                activeLocks.delete(key);

                const groupKey = `${lock.trainId}_${lock.date}`;
                if (!releasedByTrainDate.has(groupKey)) {
                    releasedByTrainDate.set(groupKey, { trainId: lock.trainId, date: lock.date, seatIds: [] });
                }
                releasedByTrainDate.get(groupKey).seatIds.push(lock.seatId);
            }
        }

        if (releasedByTrainDate.size > 0 && io) {
            for (const group of releasedByTrainDate.values()) {
                io.emit("seats-unlocked", {
                    seatIds: group.seatIds,
                    date: group.date,
                    trainId: group.trainId
                });
            }
        }
    } catch (error) {
        console.error("Error releasing seats for socket:", socketId, error);
    }
}

/**
 * Broadcast a structured seat_status_updated event to all connected clients.
 * This is the canonical event that React components listen to for TanStack Query
 * cache invalidation — it carries enough context to invalidate the exact query.
 *
 * @param {object} payload
 * @param {string|number} payload.trainId
 * @param {string|number|null} payload.coachId
 * @param {number[]} payload.seatIds
 * @param {string} payload.date  - ISO date string "YYYY-MM-DD"
 */
export const emitSeatStatusUpdate = ({ trainId, coachId, seatIds, date }) => {
    if (!io) {
        console.warn("emitSeatStatusUpdate called before Socket.io was initialized");
        return;
    }
    try {
        io.emit("seat_status_updated", {
            train_id: trainId,
            coach_id: coachId,
            seat_ids: seatIds,
            date,
        });
        console.log(`[socket] seat_status_updated emitted — train=${trainId} coach=${coachId} seats=${seatIds}`);
    } catch (e) {
        console.error("Failed to emit seat_status_updated:", e);
    }
};

/**
 * Broadcast a coach_balance_updated event to all clients so their
 * CoachStabilityGauge components can re-render with the latest balance data.
 *
 * @param {object} payload
 * @param {string|number} payload.trainId
 * @param {string|number} payload.coachId
 * @param {string}        payload.date
 * @param {object}        payload.balance  - calculateCoachBalance() result
 */
export const emitCoachBalanceUpdate = ({ trainId, coachId, date, balance }) => {
    if (!io) {
        console.warn("emitCoachBalanceUpdate called before Socket.io was initialized");
        return;
    }
    try {
        io.emit("coach_balance_updated", {
            train_id: trainId,
            coach_id: coachId,
            date,
            balance,
        });
        console.log(
            `[socket] coach_balance_updated — train=${trainId} coach=${coachId} ` +
            `L=${balance.occupiedLeft} R=${balance.occupiedRight} safe=${balance.safe}`
        );
    } catch (e) {
        console.error("Failed to emit coach_balance_updated:", e);
    }
};

export const getIO = () => {
    if (!io) throw new Error("Socket.io not initialized");
    return io;
};
