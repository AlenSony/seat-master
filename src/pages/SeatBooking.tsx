import { BookingSummary } from '@/components/BookingSummary';
import { CoachSelector } from '@/components/CoachSelector';
import ImbalanceModal from '@/components/ImbalanceModal';
import Navbar from '@/components/Navbar';
import { PassengerDetails, PassengerForm } from '@/components/PassengerForm';
import { SeatMap } from '@/components/SeatMap';
import { Button } from '@/components/ui/button';
import { SeatType as BerthType, CoachLayout, CoachRow, Seat as SeatType } from '@/data/coachLayouts';
import { API_BASE, getStoredUser } from '@/lib/api';
import {
  calculateFrontendCoachBalance,
  CoachBalanceResult,
  CoachBalanceSocketPayload,
  SeatWithPosition,
} from '@/utils/coachBalance';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, ArrowLeft, ArrowRight, CalendarDays, MapPin, Train } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import { toast } from 'sonner';

// ─── Razorpay global type declaration ─────────────────────────────────────────
declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, handler: (response: Record<string, unknown>) => void) => void;
    };
  }
}

const SeatBooking = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { trainId, source, destination, date, isoDate, distance, quota } = location.state || {}; // distance comes from TrainResults

  // TanStack Query client — used to invalidate seat-availability cache on real-time updates
  const queryClient = useQueryClient();

  const [train, setTrain] = useState<any>(null);
  const [coachLayouts, setCoachLayouts] = useState<Record<string, CoachLayout>>({});
  const [selectedCoach, setSelectedCoach] = useState<string>('');
  const [rawCoaches, setRawCoaches] = useState<any[]>([]); 
  const [selectedSeats, setSelectedSeats] = useState<SeatType[]>([]);
  const [showError, setShowError] = useState(false);
  const [showPassengerForm, setShowPassengerForm] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [journeyDistance, setJourneyDistance] = useState<number>(distance || 0);
  const [bookedSeatIds, setBookedSeatIds] = useState<Set<string>>(new Set());
  const [lockedAPISeatIds, setLockedAPISeatIds] = useState<Set<string>>(new Set());
  const [disabilityType, setDisabilityType] = useState<string>('');
  const [socket, setSocket] = useState<Socket | null>(null);

  // ── Lateral Weight Distribution state ─────────────────────────────────────
  const [coachBalance, setCoachBalance] = useState<CoachBalanceResult | null>(null);
  const [showImbalanceModal, setShowImbalanceModal] = useState(false);
  const [imbalanceModalData, setImbalanceModalData] = useState<Partial<CoachBalanceResult>>({});

  // Map DB berth_type codes → frontend BerthType string union
  const mapBerthType = (berth: string): BerthType => {
    const map: Record<string, BerthType> = {
      LB: 'lower', MB: 'middle', UB: 'upper',
      SL: 'side-lower', SU: 'side-upper',
      WS: 'window', MS: 'middle-seat', AS: 'aisle',
    };
    return (map[berth] ?? 'lower') as BerthType;
  };

  // Map DB coach_type codes → SeatMap layout discriminator
  const mapCoachType = (ct: string): 'sleeper' | 'ac' | 'chair' => {
    if (ct === 'SL' || ct === '3E' || ct === '2S') return 'sleeper';
    if (['1A', '2A', '3A', 'AC', 'EC', 'EA', 'EV'].includes(ct)) return 'ac';
    return 'chair'; // CC, 2S, GEN, etc.
  };

  // Transform backend coach data to frontend CoachLayout
  const transformCoachToLayout = (backendCoach: any): CoachLayout => {
    const rowMap = new Map<number, SeatType[]>();

    // Sort seats by seat_number (stored as integer in DB)
    const sortedSeats = [...backendCoach.seats].sort((a, b) => {
      const numA = parseInt(String(a.seat_number).replace(/\D/g, '')) || 0;
      const numB = parseInt(String(b.seat_number).replace(/\D/g, '')) || 0;
      return numA - numB;
    });

    sortedSeats.forEach((s: any) => {
      const rowNum = s.row_number ?? 1;
      if (!rowMap.has(rowNum)) rowMap.set(rowNum, []);

      // Seat initial status is available, to be overridden by API states
      let initialStatus = 'available';

      rowMap.get(rowNum)!.push({
        id: s.seat_id.toString(),
        number: String(s.seat_number),
        type: mapBerthType(s.berth_type),
        status: initialStatus as 'available' | 'locked' | 'booked',
        price: 0,
      });
    });

    const layoutType = mapCoachType(backendCoach.coach_type);
    const sortedRowNumbers = Array.from(rowMap.keys()).sort((a, b) => a - b);
    let finalRows: CoachRow[] = [];

    if (layoutType === 'sleeper' || layoutType === 'ac') {
      // Interleave main rows and side-berth rows (pairs)
      sortedRowNumbers.forEach(rowNum => {
        const seats = rowMap.get(rowNum) || [];
        const mainSeats = seats.filter(s => !s.type.startsWith('side-'));
        const sideSeats = seats.filter(s => s.type.startsWith('side-'));
        finalRows.push({ rowNumber: rowNum, seats: mainSeats });
        finalRows.push({ rowNumber: rowNum, seats: sideSeats });
      });
    } else {
      sortedRowNumbers.forEach(rowNum => {
        finalRows.push({ rowNumber: rowNum, seats: rowMap.get(rowNum) || [] });
      });
    }

    return {
      id: backendCoach.coach_number,
      name: backendCoach.coach_number,
      type: layoutType,                        // ← was raw DB code like 'SL', now 'sleeper'
      totalSeats: backendCoach.capacity ?? sortedSeats.length,
      rows: finalRows,
    };
  };

  const updateSeatStatus = (seatIds: (string | number)[], status: 'available' | 'booked' | 'locked') => {
      const stringIds = seatIds.map(String);
      setCoachLayouts(prev => {
          const newLayouts = { ...prev };
          Object.keys(newLayouts).forEach(coachId => {
              newLayouts[coachId] = {
                  ...newLayouts[coachId],
                  rows: newLayouts[coachId].rows.map(row => ({
                      ...row,
                      seats: row.seats.map(seat => {
                          if (stringIds.includes(seat.id)) {
                              return { ...seat, status: status as any };
                          }
                          return seat;
                      })
                  }))
              };
          });
          return newLayouts;
      });
  };

  useEffect(() => {
    const backendUrl = API_BASE.replace(/\/api$/, '');
    const newSocket = io(backendUrl || 'http://localhost:5001');
    setSocket(newSocket);

    newSocket.on("seats-locked", (payload: any) => {
        if (payload.trainId !== trainId || payload.date !== isoDate) return;
        // Basic direction check: if both are searching same direction, lock it.
        // For a full overlap check, we rely on the backend getTrainAvailability on load.
        // Here we just avoid applying A->B lock to B->A.
        if (payload.source === destination && payload.destination === source) return; 
        updateSeatStatus(payload.seatIds, 'locked');
    });

    newSocket.on("seats-unlocked", (payload: any) => {
        if (payload.trainId && payload.trainId !== trainId) return;
        if (payload.date && payload.date !== isoDate) return;
        updateSeatStatus(payload.seatIds, 'available');
    });

    newSocket.on("seats-booked", (payload: any) => {
        if (payload.trainId !== trainId || payload.date !== isoDate) return;
        updateSeatStatus(payload.seatIds, 'booked');
    });

    /**
     * seat_status_updated — emitted by the server after every successful booking commit.
     * Payload: { train_id, coach_id, seat_ids, date }
     *
     * We use TanStack Query's invalidateQueries to trigger a background refetch of the
     * availability data so the seat map reflects the true DB state instantly, without
     * requiring a full page reload or manual user action.
     */
    newSocket.on("seat_status_updated", (payload: {
      train_id: string | number;
      coach_id: string | number | null;
      seat_ids: number[];
      date: string;
    }) => {
      // Only act on events that affect the current journey
      if (String(payload.train_id) !== String(trainId)) return;
      if (payload.date && payload.date !== isoDate) return;

      // Optimistically mark the affected seats as booked in the local seat map
      updateSeatStatus(payload.seat_ids, 'booked');

      // Invalidate the server-side availability cache so the next render gets
      // fresh data from the DB (handles edge cases where optimistic update diverges)
      queryClient.invalidateQueries({ queryKey: ['seatAvailability', trainId, isoDate] });
    });

    // ── coach_balance_updated: refresh Stability Gauge for all clients ───────
    newSocket.on('coach_balance_updated', (payload: CoachBalanceSocketPayload) => {
      if (String(payload.train_id) !== String(trainId)) return;
      if (payload.date && payload.date !== isoDate) return;
      // Update the balance display (if user has no pending selections, show live state)
      setCoachBalance(payload.balance);
    });

    return () => {
        newSocket.disconnect();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const user = getStoredUser();
    if (!user) {
      toast.error("Please login to select seats");
      navigate('/login');
      return;
    }

    if (!trainId) {
      navigate('/');
      return;
    }

    const fetchTrainDetails = async () => {
      try {
        const response = await fetch(`${API_BASE}/trains/${trainId}`);
        if (!response.ok) throw new Error('Failed to fetch train details');
        
        const data = await response.json();

        // Filter out non-passenger coaches
        const NON_PASSENGER = ['ENG', 'PCL', 'GEN'];
        const bookableCoaches = (data.coaches || []).filter(
          (c: any) => !NON_PASSENGER.includes(String(c.coach_type).toUpperCase())
        );

        const trainData = {
            id: data.train_id.toString(),
            number: data.train_number,
            name: data.train_name,
            trainType: data.train_type,
            coaches: bookableCoaches.map((c: any) => c.coach_number)
        };

        const layouts: Record<string, CoachLayout> = {};
        bookableCoaches.forEach((c: any) => {
            layouts[c.coach_number] = transformCoachToLayout(c);
        });

        setTrain(trainData);
        setRawCoaches(bookableCoaches);
        setCoachLayouts(layouts);

        if (bookableCoaches.length > 0) {
            setSelectedCoach(bookableCoaches[0].coach_number);
        }

        // ONE-TIME FALLBACK: If distance is missing, fetch it via search API
        if (!journeyDistance && source && destination) {
            console.log("Fetching fallback distance for", source, destination);
            const searchRes = await fetch(`${API_BASE}/trains/search?source=${source}&destination=${destination}&date=${isoDate || ''}`);
            if (searchRes.ok) {
                const searchData = await searchRes.json();
                const matchedTrain = searchData.find((t: any) => t.train_id.toString() === trainId);
                if (matchedTrain && matchedTrain.distance_km) {
                    console.log("Found distance:", matchedTrain.distance_km);
                    setJourneyDistance(matchedTrain.distance_km);
                }
            }
        }

      } catch (error) {
        console.error("Error fetching train details:", error);
        toast.error("Failed to load train details");
      } finally {
        setIsLoading(false);
      }
    };

    fetchTrainDetails();
  }, [trainId, navigate, source, destination, isoDate]);

  useEffect(() => {
    setSelectedSeats([]);
  }, [selectedCoach]);

  // ── Seat Availability Query (TanStack Query) ────────────────────────────────
  // Keyed by ['seatAvailability', trainId, isoDate] so the socket handler's
  // queryClient.invalidateQueries call triggers an automatic background refetch.
  const { data: availData } = useQuery({
    queryKey: ['seatAvailability', trainId, isoDate],
    queryFn: async () => {
      if (!trainId || !isoDate || !source || !destination) return null;
      const res = await fetch(
        `${API_BASE}/trains/${trainId}/availability?date=${isoDate}&source=${source}&destination=${destination}`
      );
      if (!res.ok) throw new Error('Availability fetch failed');
      return res.json() as Promise<{ bookedSeatIds: string[]; lockedSeatIds: string[] }>;
    },
    enabled: Boolean(trainId && isoDate && source && destination),
    staleTime: 30_000, // treat data as fresh for 30s; socket events force earlier invalidation
    refetchOnWindowFocus: false,
  });

  // Sync query result into local state whenever it changes
  useEffect(() => {
    if (!availData) return;
    setBookedSeatIds(new Set((availData.bookedSeatIds || []).map(String)));
    setLockedAPISeatIds(new Set((availData.lockedSeatIds || []).map(String)));
  }, [availData]);


  // Fetch fares and update seat status when selectedCoach OR availability changes
  useEffect(() => {
    if (!selectedCoach || !train || !journeyDistance || rawCoaches.length === 0) return;

    const fetchFares = async () => {
      try {
        const coachData = rawCoaches.find(c => c.coach_number === selectedCoach);
        if (!coachData) return;

        const currentLayout = coachLayouts[selectedCoach];
        if (!currentLayout) return;

        const uniqueBerthTypes = Array.from(new Set(
          (coachData.seats || []).map((s: any) => s.berth_type)
        ));

        let fareMap: Record<string, number> = {};
        if (uniqueBerthTypes.length > 0) {
            const response = await fetch(`${API_BASE}/trains/fare`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    distance: journeyDistance,
                    trainType: train.trainType,
                    coachType: coachData.coach_type,
                    berthTypes: uniqueBerthTypes
                })
            });

            if (response.ok) {
                fareMap = await response.json();
            } else {
                console.warn("Fare fetch failed, using fallback");
            }
        }

        // Update coachLayouts with prices AND booked status
        setCoachLayouts(prev => {
            const layout = { ...prev[selectedCoach] };
            layout.rows = layout.rows.map(row => ({
                ...row,
                seats: row.seats.map(seat => {
                    const originalSeat = coachData.seats.find((s:any) => s.seat_id.toString() === seat.id);
                    const berthCode = originalSeat ? originalSeat.berth_type : '';
                    const price = fareMap[berthCode] || 500; 
                    const isBooked = bookedSeatIds.has(seat.id);
                    const isLocked = lockedAPISeatIds.has(seat.id);
                    
                    return { 
                        ...seat, 
                        price, 
                        status: isBooked ? 'booked' : (isLocked ? 'locked' : seat.status) // Preserve websocket updates if any
                    };
                })
            }));
            return { ...prev, [selectedCoach]: layout };
        });

      } catch (err) {
        console.error("Failed to fetch fares/status", err);
      }
    };

    fetchFares();
  }, [selectedCoach, train?.id, journeyDistance, rawCoaches.length, bookedSeatIds, lockedAPISeatIds]);

  // ── Derived guidance sets (computed from balance, not stored as state) ──────
  // These drive the per-seat highlighting without requiring an extra render cycle.
  const { recommendedSeatIds, blockedSeatIds } = useMemo(() => {
    if (!coachBalance || coachBalance.belowThreshold) {
      return { recommendedSeatIds: undefined, blockedSeatIds: undefined };
    }

    const coachData = rawCoaches.find(c => c.coach_number === selectedCoach);
    if (!coachData) return { recommendedSeatIds: undefined, blockedSeatIds: undefined };

    // Determine which side is heavier
    const leftHeavier = coachBalance.occupiedLeft > coachBalance.occupiedRight;

    const recommended = new Set<string>();
    const blocked     = new Set<string>();

    for (const s of (coachData.seats || [])) {
      const id  = String(s.seat_id);
      const col = s.column_index ?? 0;
      const isLeft = col <= 2;

      // Only tag available seats (no point highlighting booked/locked)
      if (bookedSeatIds.has(id) || lockedAPISeatIds.has(id)) continue;

      if (leftHeavier) {
        // Add to right side (col 3-4) → recommended; left → potentially worsening
        if (!isLeft) recommended.add(id);
        else if (coachBalance.balanceFactor >= 0.35) blocked.add(id);
      } else {
        if (isLeft)  recommended.add(id);
        else if (coachBalance.balanceFactor >= 0.35) blocked.add(id);
      }
    }

    return { recommendedSeatIds: recommended, blockedSeatIds: blocked };
  }, [coachBalance, rawCoaches, selectedCoach, bookedSeatIds, lockedAPISeatIds]);

  const handleSeatSelect = (seat: SeatType) => {
    // Senior Citizen Quota (SS) Validation
    if (quota === "SS" && !["lower", "side-lower"].includes(seat.type)) {
      toast.error("Senior Citizen quota allows only Lower or Side Lower berths");
      return;
    }

    // PWD Quota (WD) Validation
    if (quota === "WD") {
       if (!["lower", "side-lower"].includes(seat.type)) {
         toast.error("Person with Disability quota allows only Lower or Side Lower berths");
         return;
       }
    }

    const isSelected = selectedSeats.some(s => s.id === seat.id);
    const newSelectedSeats = isSelected
      ? selectedSeats.filter(s => s.id !== seat.id)
      : [...selectedSeats, seat];

    if (!isSelected && selectedSeats.length >= 6) {
      setShowError(true);
      toast.error('Maximum 6 seats can be selected at once');
      setTimeout(() => setShowError(false), 3000);
      return;
    }

    // ── Hard balance block: reject if this seat tips the coach into critical imbalance ──
    if (!isSelected && coachBalance && !coachBalance.belowThreshold) {
      const coachData = rawCoaches.find(c => c.coach_number === selectedCoach);
      if (coachData && coachLayouts[selectedCoach]) {
        const allSeatsInCoach: SeatWithPosition[] = (coachData.seats || []).map((s: any) => ({
          id: String(s.seat_id),
          columnIndex: s.column_index ?? 0,
        }));
        const testResult = calculateFrontendCoachBalance(
          allSeatsInCoach,
          bookedSeatIds,
          [...selectedSeats.map(s => s.id), seat.id],
          coachLayouts[selectedCoach].totalSeats
        );
        if (!testResult.safe) {
          toast.warning(
            `⚠️ Seat ${seat.number} would cause coach imbalance. Please select a seat on the highlighted (green) side.`,
            { duration: 4000, id: 'balance-block' }
          );
          return; // block the selection
        }
      }
    }

    setSelectedSeats(newSelectedSeats);
    if (isSelected) {
      toast.info(`Seat ${seat.number} removed`);
    } else {
      toast.success(`Seat ${seat.number} selected`);
    }

    // ── Recalculate balance after successful selection ───────────────────────
    const coachData = rawCoaches.find(c => c.coach_number === selectedCoach);
    if (coachData && coachLayouts[selectedCoach]) {
      const allSeatsInCoach: SeatWithPosition[] = (coachData.seats || []).map((s: any) => ({
        id: String(s.seat_id),
        columnIndex: s.column_index ?? 0,
      }));
      const result = calculateFrontendCoachBalance(
        allSeatsInCoach,
        bookedSeatIds,
        newSelectedSeats.map(s => s.id),
        coachLayouts[selectedCoach].totalSeats
      );
      setCoachBalance(result);
    }
  };

  const handleRemoveSeat = (seat: SeatType) => {
    const newSeats = selectedSeats.filter(s => s.id !== seat.id);
    setSelectedSeats(newSeats);
    toast.info(`Seat ${seat.number} removed`);

    // Recalculate balance when a seat is removed
    const coachData = rawCoaches.find(c => c.coach_number === selectedCoach);
    if (coachData && coachLayouts[selectedCoach]) {
      const allSeatsInCoach: SeatWithPosition[] = (coachData.seats || []).map((s: any) => ({
        id: String(s.seat_id),
        columnIndex: s.column_index ?? 0,
      }));
      const result = calculateFrontendCoachBalance(
        allSeatsInCoach,
        bookedSeatIds,
        newSeats.map(s => s.id),
        coachLayouts[selectedCoach].totalSeats
      );
      setCoachBalance(result);
    }
  };

  const handleConfirm = () => {
    if (selectedSeats.length === 0) {
      toast.error('Please select at least one seat');
      return;
    }

    if (socket) {
        socket.emit("lock-seats", { 
            seatIds: selectedSeats.map(s => parseInt(s.id)),
            date: isoDate || new Date().toISOString().split('T')[0],
            trainId: train.id,
            source: source,
            destination: destination
        }, (response: any) => {
            if (response.success) {
                setShowPassengerForm(true);
            } else {
                // Map the conflicting DB seat_id back to the display seat number
                // so the toast matches what the user sees on the seat button
                if (response.conflictingSeatId !== undefined) {
                    const conflictSeat = selectedSeats.find(
                        s => parseInt(s.id) === response.conflictingSeatId
                    );
                    const displayNumber = conflictSeat ? conflictSeat.number : response.conflictingSeatId;
                    toast.error(`Seat ${displayNumber} is already selected by another user. Please choose a different seat.`);
                } else {
                    toast.error(response.message || "Failed to lock seats");
                }
            }
        });
    } else {
       setShowPassengerForm(true);
    }
  };

  // ── Razorpay checkout handler ──────────────────────────────────────────────
  const handlePassengerConfirm = async (passengers: PassengerDetails[]) => {
    setIsLoading(true);
    try {
      const user = getStoredUser();
      const travelDateStr = isoDate || new Date().toISOString().split('T')[0];

      // ── Step 1: Calculate final amount (with PWD concession if applicable) ──
      let finalTotalAmount = selectedSeats.reduce((sum, s) => sum + (s.price || 0), 0);

      if (quota === 'WD' && disabilityType) {
        const discounts: Record<string, number> = {
          BLIND: 0.75,
          ORTHOPEDIC: 0.75,
          DEAF_DUMB: 0.50,
          MENTAL: 0.75,
          CANCER: 0.50,
          PATIENT: 0.50,
        };
        const discountPct = discounts[disabilityType] || 0;
        finalTotalAmount -= Math.round(finalTotalAmount * discountPct);
      }

      const seatsPayload = selectedSeats.map(s => ({ seatId: parseInt(s.id), price: s.price }));

      // ── Step 2: Create Razorpay order on backend ─────────────────────────────
      const orderRes = await fetch(`${API_BASE}/payments/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          totalAmount: finalTotalAmount,
          seats: seatsPayload,
          socketId: socket?.id,
          travelDate: travelDateStr,
          trainId: train.id,
        }),
      });

      if (!orderRes.ok) {
        const errData = await orderRes.json();
        throw new Error(errData.error || 'Failed to create payment order.');
      }

      const order = await orderRes.json();
      setIsLoading(false); // Allow Razorpay modal to render

      // ── Step 3: Ensure Razorpay script is loaded ─────────────────────────────
      if (!window.Razorpay) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://checkout.razorpay.com/v1/checkout.js';
          script.onload = () => resolve();
          script.onerror = () => reject(new Error('Failed to load Razorpay SDK'));
          document.body.appendChild(script);
        });
      }

      // ── Step 4: Build booking payload (passed along to verify endpoint) ──────
      const bookingPayload = {
        contactName: passengers[0].name,
        email: user?.email ?? passengers[0].name + '@guest.local',
        userId: user?.user_id ?? undefined,
        trainId: train.id,
        sourceStation: source,
        destinationStation: destination,
        travelDate: travelDateStr,
        seats: seatsPayload,
        totalAmount: finalTotalAmount,
        passengers: passengers.map(p => ({ name: p.name, gender: p.gender })),
        socketId: socket?.id,
        quota: quota,
        disabilityType: disabilityType,
      };

      // ── Step 5: Open Razorpay checkout ───────────────────────────────────────
      const rzp = new window.Razorpay({
        key: order.key_id,
        amount: order.amount,
        currency: order.currency || 'INR',
        name: 'RailSeat',
        description: `Train Booking – ${train.name}`,
        ...(window.location.hostname !== 'localhost' && { image: `${window.location.origin}/logo%20(2).png` }),
        order_id: order.order_id,
        prefill: {
          name: passengers[0].name,
          email: user?.email || '',
        },
        theme: { color: '#4F46E5' },

        // ── Payment success handler ─────────────────────────────────────────
        handler: async (response: Record<string, string>) => {
          setIsLoading(true);
          try {
            const verifyRes = await fetch(`${API_BASE}/payments/verify-payment`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                ...bookingPayload,
              }),
            });

            const verifyData = await verifyRes.json();

            if (!verifyRes.ok || !verifyData.verified) {
              // Detect imbalance error from backend booking step
              if (verifyData.errorCode === 'ERR_IMBALANCE_LIMIT') {
                const err: any = new Error('ERR_IMBALANCE_LIMIT');
                err.errorCode = 'ERR_IMBALANCE_LIMIT';
                err.balance = verifyData.balance;
                throw err;
              }
              throw new Error(verifyData.error || 'Payment verification failed.');
            }

            // ── Booking confirmed ───────────────────────────────────────────
            toast.success('🎉 Booking Confirmed!', {
              description: (
                <div className="flex flex-col gap-1">
                  <span className="font-semibold">PNR: {verifyData.booking.booking_number}</span>
                  <span>Amount Paid: ₹{finalTotalAmount}</span>
                  <span className="text-xs text-muted-foreground">Payment ID: {response.razorpay_payment_id}</span>
                </div>
              ),
              duration: 8000,
            });

            navigate('/book');
          } catch (err: any) {
            console.error('Verification error:', err);
            toast.error(`Payment Verification Failed: ${err.message}`);
          } finally {
            setIsLoading(false);
          }
        },
      });

      // ── Payment failure / dismissal handler ──────────────────────────────
      rzp.on('payment.failed', async (resp: Record<string, unknown>) => {
        console.error('Razorpay payment failed:', resp);
        toast.error('Payment failed. Your seats have been released.');

        // Release locks
        try {
          await fetch(`${API_BASE}/payments/release-seats`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              socketId: socket?.id,
              seats: seatsPayload,
              travelDate: travelDateStr,
              trainId: train.id,
            }),
          });
        } catch (e) {
          console.error('Failed to release seats after payment failure:', e);
        }
      });

      rzp.open();

    } catch (error: any) {
      console.error('Booking Error:', error);
      // ── Handle ERR_IMBALANCE_LIMIT from backend ──────────────────────────
      if (error?.errorCode === 'ERR_IMBALANCE_LIMIT' || error?.message?.includes('ERR_IMBALANCE_LIMIT')) {
        setImbalanceModalData(error.balance || {});
        setShowImbalanceModal(true);
      } else {
        toast.error(`Booking Failed: ${error.message}`);
      }
      setIsLoading(false);
    }
  };

  const handleBackToSeats = () => {
    if (socket) {
        socket.emit("cancel-booking");
    }
    setShowPassengerForm(false);
    setCoachBalance(null); // reset gauge on back
  };

  const handleChangeCoach = () => {
    if (socket && selectedSeats.length > 0) {
        socket.emit("cancel-booking");
    }
    setSelectedSeats([]);
    setShowPassengerForm(false);
    setCoachBalance(null);
    setBalanceWarningSent(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!train) return null;

  const currentCoach = coachLayouts[selectedCoach];

  return (
    <div className="min-h-screen bg-background">
      <Navbar
        extraNav={
          <Button variant="ghost" onClick={() => navigate('/book')} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Change Train
          </Button>
        }
      />

      {/* Journey Info Bar */}
      <div className="bg-gradient-to-r from-slate-900 via-primary to-blue-800 text-white shadow-2xl relative overflow-hidden">
        {/* Decorative background elements */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 left-1/4 w-64 h-64 rounded-full bg-white blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-48 h-48 rounded-full bg-blue-300 blur-3xl" />
        </div>
        {/* Subtle grid pattern */}
        <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px)', backgroundSize: '24px 24px' }} />

        <div className="container mx-auto px-6 py-5 relative z-10">
          <div className="flex flex-wrap items-center justify-between gap-6">
            {/* Train info */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/10 rounded-xl backdrop-blur-sm border border-white/10">
                  <Train className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold tracking-tight text-white leading-none">{train.name}</h1>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-blue-200 font-medium">#{train.number}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 ml-1">
                <CalendarDays className="w-3.5 h-3.5 text-blue-300" />
                <span className="text-sm text-blue-100 font-medium">{date}</span>
              </div>
            </div>

            {/* Route display */}
            <div className="flex items-center gap-4 bg-white/10 px-6 py-4 rounded-2xl backdrop-blur-sm border border-white/15 shadow-inner">
              <div className="flex flex-col items-center">
                <MapPin className="w-4 h-4 text-blue-300 mb-1" />
                <span className="text-[10px] text-blue-300 uppercase tracking-widest font-semibold">From</span>
                <span className="font-bold text-lg text-white mt-0.5">{source}</span>
              </div>

              <div className="flex flex-col items-center gap-1 px-2">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-white/60" />
                  <div className="w-12 h-0.5 bg-gradient-to-r from-white/40 via-white/80 to-white/40" />
                  <ArrowRight className="w-4 h-4 text-white" />
                  <div className="w-12 h-0.5 bg-gradient-to-r from-white/40 via-white/80 to-white/40" />
                  <div className="w-2 h-2 rounded-full bg-white/60" />
                </div>
                <span className="text-[9px] text-white/40 uppercase tracking-widest">Journey</span>
              </div>

              <div className="flex flex-col items-center">
                <MapPin className="w-4 h-4 text-emerald-300 mb-1" />
                <span className="text-[10px] text-blue-300 uppercase tracking-widest font-semibold">To</span>
                <span className="font-bold text-lg text-white mt-0.5">{destination}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {showError && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 animate-fade-in shadow-2xl">
          <div className="bg-red-500 text-white px-6 py-3 rounded-full flex items-center gap-3 border border-red-400/50 backdrop-blur-md">
            <AlertCircle className="w-5 h-5 text-white animate-pulse" />
            <span className="font-medium">Maximum 6 seats allowed per booking</span>
          </div>
        </div>
      )}

      <main className="container mx-auto px-4 py-8">
        <AnimatePresence mode="wait">
          {showPassengerForm ? (
            <motion.div
              key="passenger-form"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            >
              <PassengerForm
                selectedSeats={selectedSeats}
                onBack={handleBackToSeats}
                onConfirm={handlePassengerConfirm}
                trainName={train.name}
                coachNumber={selectedCoach}
                quota={quota}
                disabilityType={disabilityType}
              />
            </motion.div>
          ) : (
            <motion.div
              key="seat-selection"
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 50 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="grid lg:grid-cols-3 gap-8"
            >
              {/* Left Panel - Coach Selection & Seat Map */}
              <div className="lg:col-span-2 space-y-5">
                {/* Coach Selector */}
                <div className="bg-card rounded-2xl border border-border shadow-sm p-5">
                  <CoachSelector
                    coaches={train.coaches}
                    selectedCoach={selectedCoach}
                    onSelect={setSelectedCoach}
                  />
                </div>

                {/* Seat Map */}
                {currentCoach && (
                  <div className="space-y-3">
                    {/* Coach header */}
                    <div className="flex items-center justify-between px-1">
                      <div className="flex items-center gap-2">
                        <div className="w-1 h-6 rounded-full bg-gradient-to-b from-primary to-blue-600" />
                        <h2 className="font-bold text-lg text-foreground">
                          Coach {selectedCoach}
                        </h2>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/15">
                          {currentCoach.type === 'sleeper' ? 'Sleeper' : currentCoach.type === 'ac' ? 'AC Tier' : 'Chair Car'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted rounded-full">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-xs font-medium text-muted-foreground">{currentCoach.totalSeats} seats</span>
                      </div>
                    </div>
                    <SeatMap
                      coach={currentCoach}
                      selectedSeats={selectedSeats}
                      onSeatSelect={handleSeatSelect}
                      recommendedSeatIds={recommendedSeatIds}
                      blockedSeatIds={blockedSeatIds}
                    />
                  </div>
                )}
              </div>

              {/* Right Panel - Booking Summary */}
              <div className="lg:col-span-1">
                <BookingSummary
                  trainName={train.name}
                  trainNumber={train.number}
                  selectedCoach={selectedCoach}
                  selectedSeats={selectedSeats}
                  onRemoveSeat={handleRemoveSeat}
                  onConfirm={handleConfirm}
                  onChangeCoach={handleChangeCoach}
                  quota={quota}
                  disabilityType={disabilityType}
                  onDisabilityChange={setDisabilityType}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Imbalance Education Modal */}
      <ImbalanceModal
        open={showImbalanceModal}
        onClose={() => setShowImbalanceModal(false)}
        balance={imbalanceModalData}
      />
    </div>
  );
};

export default SeatBooking;
