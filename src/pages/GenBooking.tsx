import Navbar from '@/components/Navbar';
import { StationSearchInput } from '@/components/StationSearchInput';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { API_BASE, getStoredUser } from '@/lib/api';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import {
    ArrowLeft,
    ArrowRight,
    CalendarDays,
    Clock,
    Info,
    Loader2,
    MapPin,
    Minus,
    Plus,
    Sparkles,
    Ticket,
    Train,
    Users,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

declare global {
    interface Window {
        Razorpay: new (o: Record<string, unknown>) => { open: () => void; on: (e: string, h: (r: Record<string, unknown>) => void) => void };
    }
}

interface PassengerCounts { adults: number; children: number; }

const GenBooking = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const preState = location.state || {};

    // ── Route + Date selection ──
    const [source, setSource] = useState<string>(preState.source || '');
    const [destination, setDestination] = useState<string>(preState.destination || '');
    const [travelDate, setTravelDate] = useState<Date | undefined>(
        preState.isoDate ? new Date(preState.isoDate) : undefined
    );

    // ── Booking phase state ──
    type Phase = 'route' | 'booking';
    const [phase, setPhase] = useState<Phase>(preState.trainId ? 'booking' : 'route');
    const [isSearching, setIsSearching] = useState(false);

    // Auto-resolved train
    const [trainId, setTrainId] = useState<number | null>(preState.trainId ? Number(preState.trainId) : null);
    const [trainName, setTrainName] = useState<string>(preState.trainName || '');
    const [trainNumber, setTrainNumber] = useState<string>(preState.trainNumber || '');
    const [distanceKm, setDistanceKm] = useState<number>(preState.distance || 0);

    const [counts, setCounts] = useState<PassengerCounts>({ adults: 1, children: 0 });
    const [trainCategory, setTrainCategory] = useState<'MAIL/EXP' | 'SUPERFAST' | 'ORDINARY'>('MAIL/EXP');
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [genInfo, setGenInfo] = useState<{
        totalCapacity: number;
        remaining: number;
        canBook: boolean;
        sentinelSeatId: number | null;
        genCoaches: { coach_number: string; sentinelSeatId: number | null }[];
    } | null>(null);

    const [farePerPax, setFarePerPax] = useState(0);
    const totalPassengers = counts.adults + counts.children;

    const isoDate = travelDate ? format(travelDate, 'yyyy-MM-dd') : '';
    const displayDate = travelDate ? format(travelDate, 'PPP') : '';

    const isRouteValid = source && destination && source !== destination && travelDate;

    // ── Auto-search and proceed when pre-state has trainId ──
    useEffect(() => {
        if (preState.trainId) {
            setPhase('booking');
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Find first train with GEN coach and proceed ──
    const handleProceed = async () => {
        if (!isRouteValid) return;
        setIsSearching(true);
        try {
            const query = new URLSearchParams({ source, destination, date: isoDate });
            const res = await fetch(`${API_BASE}/trains/search?${query.toString()}`);
            if (!res.ok) { toast.error('Failed to search trains.'); return; }
            const data = await res.json();

            // Find first train with GEN coach
            const genTrain = data.find((t: any) =>
                (t.coaches || []).some((c: any) => c.coach_type === 'GEN')
            );
            if (!genTrain) {
                toast.error('No trains with General coaches found on this route.');
                return;
            }

            setTrainId(genTrain.train_id);
            setTrainName(genTrain.train_name);
            setTrainNumber(genTrain.train_number);
            setDistanceKm(genTrain.distance_km || 0);
            setPhase('booking');
        } catch (err) {
            console.error(err);
            toast.error('Error searching for trains.');
        } finally {
            setIsSearching(false);
        }
    };

    // ── Fetch GEN availability + fare ──
    useEffect(() => {
        if (phase !== 'booking' || !trainId || !isoDate) return;

        const init = async () => {
            setIsLoading(true);
            try {
                const avRes = await fetch(`${API_BASE}/trains/${trainId}/gen-availability?date=${isoDate}&passengerCount=${totalPassengers}`);
                if (!avRes.ok) {
                    const e = await avRes.json();
                    toast.error(e.error || 'No General coaches available for this train.');
                    return;
                }
                const avData = await avRes.json();
                setGenInfo({
                    totalCapacity: avData.totalCapacity,
                    remaining: avData.remaining,
                    canBook: !!avData.canBook,
                    sentinelSeatId: avData.genCoaches?.[0]?.sentinelSeatId ?? null,
                    genCoaches: (avData.genCoaches ?? []).map((c: { coach_number: string; sentinelSeatId?: number | null }) => ({
                        coach_number: c.coach_number,
                        sentinelSeatId: c.sentinelSeatId ?? null,
                    })),
                });

                const backendTrainType = trainCategory === 'SUPERFAST' ? 'SUPERFAST' : trainCategory === 'MAIL/EXP' ? 'EXPRESS' : 'LOCAL';
                const fareRes = await fetch(`${API_BASE}/trains/fare`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        distance: distanceKm || 100,
                        trainType: backendTrainType,
                        coachType: 'GEN',
                        berthTypes: ['LB'],
                    }),
                });
                if (fareRes.ok) {
                    const fareData = await fareRes.json();
                    setFarePerPax(fareData['LB'] || fareData[Object.keys(fareData)[0]] || 50);
                } else {
                    setFarePerPax(50);
                }
            } catch (err) {
                console.error(err);
                toast.error('Failed to load General coach info.');
            } finally {
                setIsLoading(false);
            }
        };
        init();
    }, [phase, trainId, isoDate, distanceKm, trainCategory, totalPassengers]);

    const handleCountChange = (type: 'adults' | 'children', delta: number) => {
        setCounts(prev => {
            const nextVal = Math.max(type === 'adults' ? 1 : 0, prev[type] + delta);
            const totalNext = (type === 'adults' ? nextVal : prev.adults) + (type === 'children' ? nextVal : prev.children);
            if (totalNext > 4) { toast.error('Maximum 4 passengers allowed per ticket.'); return prev; }
            return { ...prev, [type]: nextVal };
        });
    };

    const totalFare = (farePerPax * counts.adults) + ((farePerPax / 2) * counts.children);

    const handlePay = async () => {
        const user = getStoredUser();
        if (!user) { toast.error('Please login first'); navigate('/login'); return; }
        if (!trainId) { toast.error('No train found.'); return; }
        if (!isoDate) { toast.error('No travel date selected.'); return; }
        const safeTotal = Math.max(totalFare, 1);

        setIsSubmitting(true);
        try {
            const orderRes = await fetch(`${API_BASE}/payments/create-gen-order`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ totalAmount: safeTotal, trainId, travelDate: isoDate, passengerCount: totalPassengers, validityHours: 3 }),
            });
            if (!orderRes.ok) { const e = await orderRes.json(); throw new Error(e.error || 'Failed to create payment order.'); }
            const order = await orderRes.json();
            setIsSubmitting(false);

            if (!window.Razorpay) {
                await new Promise<void>((res, rej) => {
                    const s = document.createElement('script');
                    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
                    s.onload = () => res();
                    s.onerror = () => rej(new Error('Failed to load Razorpay'));
                    document.body.appendChild(s);
                });
            }

            const rzp = new window.Razorpay({
                key: order.key_id,
                amount: order.amount,
                currency: order.currency || 'INR',
                name: 'RailSeat',
                description: `Unreserved Journey – ${trainCategory}`,
                ...(window.location.hostname !== 'localhost' && { image: `${window.location.origin}/logo%20(2).png` }),
                order_id: order.order_id,
                prefill: { name: user.username || 'Passenger', email: user.email || '' },
                theme: { color: '#059669' },
                handler: async (response: Record<string, string>) => {
                    setIsSubmitting(true);
                    try {
                        const verifyRes = await fetch(`${API_BASE}/payments/verify-gen-payment`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                razorpay_order_id: response.razorpay_order_id,
                                razorpay_payment_id: response.razorpay_payment_id,
                                razorpay_signature: response.razorpay_signature,
                                contactName: user.username || 'Unreserved Passenger',
                                email: user.email,
                                userId: user.user_id,
                                trainId,
                                sourceStation: source,
                                destinationStation: destination,
                                travelDate: isoDate,
                                passengers: Array.from({ length: totalPassengers }).map((_, i) => ({
                                    name: i < counts.adults ? 'Adult' : 'Child',
                                    gender: 'other'
                                })),
                                totalAmount: safeTotal,
                                sentinelSeatId: genInfo?.sentinelSeatId,
                            }),
                        });
                        const data = await verifyRes.json();
                        if (!verifyRes.ok || !data.verified) throw new Error(data.error || 'Payment verification failed.');
                        toast.success('🎉 Booking Confirmed!', {
                            description: (
                                <div className="flex flex-col gap-1">
                                    <span className="font-semibold">PNR: {data.booking.booking_number}</span>
                                    <span>Amount Paid: ₹{totalFare}</span>
                                    <span className="text-xs text-muted-foreground">General (Unreserved) Coach • Valid 3 hrs</span>
                                </div>
                            ),
                            duration: 8000,
                        });
                        navigate('/profile');
                    } catch (err: unknown) {
                        toast.error(`Verification failed: ${err instanceof Error ? err.message : "Unknown error"}`);
                    } finally { setIsSubmitting(false); }
                },
            });
            rzp.on('payment.failed', () => { toast.error('Payment failed. Please try again.'); setIsSubmitting(false); });
            rzp.open();
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "An error occurred");
            setIsSubmitting(false);
        }
    };

    const distance = distanceKm || 100;
    const MIN_FARES: Record<'MAIL/EXP' | 'SUPERFAST' | 'ORDINARY', number> = {
        'ORDINARY':  Math.round(50 + (distance - 50) * 0.30),
        'MAIL/EXP':  Math.round(50 + (distance - 50) * 0.35),
        'SUPERFAST': Math.round(50 + (distance - 50) * 0.40 + 10),
    };

    // ═══════════════════════════ RENDER ═══════════════════════════

    return (
        <div className="min-h-screen bg-slate-50">
            <Navbar
                extraNav={
                    <Button variant="ghost" onClick={() => navigate(phase === 'booking' && !preState.trainId ? undefined as any : -1 as any)} className="text-muted-foreground hover:text-foreground">
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Back
                    </Button>
                }
            />

            {/* ═══════════════ HERO HEADER ═══════════════ */}
            <div className="relative overflow-hidden bg-gradient-to-r from-emerald-800 via-emerald-700 to-teal-700" style={{ color: '#fff' }}>
                <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.3) 1px, transparent 1px)', backgroundSize: '20px 20px' }} />

                {/* Floating Orbs */}
                <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-teal-400/20 blur-3xl animate-pulse" />
                <div className="absolute -bottom-16 -left-16 w-56 h-56 rounded-full bg-emerald-300/15 blur-3xl animate-pulse" style={{ animationDelay: '1.5s' }} />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-white/5 blur-3xl" />

                <div className="container mx-auto px-6 py-8 relative z-10">
                    <div className="flex flex-wrap items-center justify-between gap-6">
                        <div className="flex flex-col gap-3">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 rounded-2xl backdrop-blur-sm shadow-lg" style={{ backgroundColor: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.1)' }}>
                                    <Ticket className="w-6 h-6" style={{ color: '#fff' }} />
                                </div>
                                <div>
                                    <h1 className="text-2xl font-bold tracking-tight leading-none" style={{ color: '#fff' }}>
                                        Unreserved Ticket
                                    </h1>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold backdrop-blur-sm" style={{ backgroundColor: 'rgba(255,255,255,0.15)', color: '#d1fae5', border: '1px solid rgba(255,255,255,0.2)' }}>
                                            GEN · General Coach
                                        </span>
                                        <span className="text-xs flex items-center gap-1" style={{ color: 'rgba(167,243,208,0.7)' }}>
                                            <Clock className="w-3 h-3" /> Valid 3 hours
                                        </span>
                                    </div>
                                </div>
                            </div>
                            {displayDate && (
                                <div className="flex items-center gap-2 ml-1">
                                    <CalendarDays className="w-3.5 h-3.5" style={{ color: '#6ee7b7' }} />
                                    <span className="text-sm font-medium" style={{ color: '#d1fae5' }}>{displayDate}</span>
                                </div>
                            )}
                        </div>

                        {/* Route Pill (when route selected) */}
                        {source && destination && (
                            <div className="flex items-center gap-4 px-6 py-4 rounded-2xl backdrop-blur-md shadow-inner" style={{ backgroundColor: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)' }}>
                                <div className="flex flex-col items-center">
                                    <MapPin className="w-4 h-4 mb-1" style={{ color: '#6ee7b7' }} />
                                    <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: '#6ee7b7' }}>From</span>
                                    <span className="font-bold text-lg mt-0.5" style={{ color: '#fff' }}>{source}</span>
                                </div>
                                <div className="flex flex-col items-center gap-1 px-2">
                                    <div className="flex items-center gap-1">
                                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.6)' }} />
                                        <div className="w-10 h-0.5" style={{ background: 'linear-gradient(to right, rgba(255,255,255,0.3), rgba(255,255,255,0.7), rgba(255,255,255,0.3))' }} />
                                        <ArrowRight className="w-4 h-4" style={{ color: '#fff' }} />
                                        <div className="w-10 h-0.5" style={{ background: 'linear-gradient(to right, rgba(255,255,255,0.3), rgba(255,255,255,0.7), rgba(255,255,255,0.3))' }} />
                                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.6)' }} />
                                    </div>
                                    <span className="text-[9px] uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.4)' }}>Journey</span>
                                </div>
                                <div className="flex flex-col items-center">
                                    <MapPin className="w-4 h-4 mb-1" style={{ color: '#5eead4' }} />
                                    <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: '#6ee7b7' }}>To</span>
                                    <span className="font-bold text-lg mt-0.5" style={{ color: '#fff' }}>{destination}</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <main className="container mx-auto px-4 py-8 max-w-5xl">

                {/* ═══════════════ PHASE 1: Route Selection ═══════════════ */}
                {phase === 'route' && (
                    <div className="max-w-2xl mx-auto space-y-8">
                        {/* Intro Badge */}
                        <div className="text-center space-y-3">
                            <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-100 border border-emerald-200 text-emerald-700 rounded-full text-sm font-semibold">
                                <Sparkles className="w-4 h-4" />
                                Quick Unreserved Booking
                            </div>
                            <p className="text-muted-foreground text-base max-w-md mx-auto">
                                Select your route and travel date to instantly book a General (GEN) coach ticket.
                            </p>
                        </div>

                        {/* Route Selection Card */}
                        <div className="relative bg-white rounded-3xl shadow-2xl shadow-emerald-900/5 border border-slate-200 p-8 overflow-hidden">
                            {/* Corner Accent */}
                            <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-bl from-emerald-100/50 to-transparent rounded-bl-[100px] -mr-10 -mt-10" />

                            <div className="relative z-10 space-y-6">
                                {/* Station Inputs */}
                                <div className="grid md:grid-cols-2 gap-6">
                                    {/* Source */}
                                    <div className="space-y-1">
                                        <StationSearchInput
                                            label="From Station"
                                            value={source}
                                            onChange={setSource}
                                            placeholder="Departing Station"
                                            iconColorClass="text-emerald-600"
                                        />
                                    </div>

                                    {/* Destination */}
                                    <div className="space-y-1">
                                        <StationSearchInput
                                            label="To Station"
                                            value={destination}
                                            onChange={setDestination}
                                            placeholder="Arrival Station"
                                            iconColorClass="text-teal-600"
                                        />
                                        {source && destination && source === destination && (
                                            <span className="text-xs text-red-500 font-medium pl-1">Source and destination cannot be the same</span>
                                        )}
                                    </div>
                                </div>

                                {/* Connector Strip */}
                                <div className="flex items-center gap-3 px-4">
                                    <div className="flex-1 h-px bg-gradient-to-r from-emerald-200 via-emerald-300 to-teal-200" />
                                    <div className="p-1.5 bg-emerald-50 rounded-full border border-emerald-200 text-emerald-500">
                                        <CalendarDays className="w-3.5 h-3.5" />
                                    </div>
                                    <div className="flex-1 h-px bg-gradient-to-r from-teal-200 via-emerald-300 to-emerald-200" />
                                </div>

                                {/* Date Picker */}
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider pl-1">Travel Date</label>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant="outline"
                                                className={cn(
                                                    "w-full h-16 justify-start text-left font-normal text-base rounded-2xl border-slate-200 transition-all shadow-sm",
                                                    travelDate
                                                        ? "ring-2 ring-emerald-500/15 border-emerald-400/60 hover:border-emerald-500"
                                                        : "text-slate-400 hover:border-emerald-300 hover:bg-emerald-50/50"
                                                )}
                                            >
                                                <div className="flex items-center gap-4 px-1">
                                                    <div className={cn("p-2 rounded-lg transition-colors", travelDate ? "bg-emerald-50" : "bg-slate-50")}>
                                                        <CalendarDays className={cn("w-5 h-5", travelDate ? "text-emerald-600" : "text-slate-400")} />
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className={cn(travelDate ? "text-foreground font-medium" : "text-slate-400")}>
                                                            {travelDate ? format(travelDate, "MMMM d, yyyy") : "Select a date"}
                                                        </span>
                                                        {travelDate && <span className="text-xs text-slate-500 leading-none">{format(travelDate, "EEEE")}</span>}
                                                    </div>
                                                </div>
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0 rounded-2xl shadow-xl border-slate-100" align="start">
                                            <Calendar
                                                mode="single"
                                                selected={travelDate}
                                                onSelect={setTravelDate}
                                                disabled={(d) => d < new Date(new Date().setHours(0,0,0,0))}
                                                initialFocus
                                                className="p-4"
                                            />
                                        </PopoverContent>
                                    </Popover>
                                </div>

                                {/* Proceed Button */}
                                <Button
                                    onClick={handleProceed}
                                    disabled={!isRouteValid || isSearching}
                                    className={cn(
                                        "w-full h-16 text-lg font-bold rounded-2xl transition-all duration-300 relative overflow-hidden group",
                                        isRouteValid
                                            ? "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-xl shadow-emerald-500/25 hover:shadow-emerald-500/40"
                                            : "bg-slate-100 text-slate-400"
                                    )}
                                >
                                    {isSearching ? (
                                        <span className="relative z-10 flex items-center justify-center gap-2">
                                            <Loader2 className="w-5 h-5 animate-spin" />
                                            Finding available trains…
                                        </span>
                                    ) : (
                                        <span className="relative z-10 flex items-center justify-center gap-2">
                                            <Ticket className="w-5 h-5" />
                                            Get Unreserved Ticket
                                            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                                        </span>
                                    )}
                                    {isRouteValid && (
                                        <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                                    )}
                                </Button>
                            </div>
                        </div>

                        {/* Info Cards */}
                        <div className="grid sm:grid-cols-3 gap-4">
                            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
                                <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center mb-3">
                                    <Ticket className="w-5 h-5 text-emerald-600" />
                                </div>
                                <p className="font-bold text-slate-900 text-sm">Digital-Only</p>
                                <p className="text-xs text-slate-500 mt-0.5">No paper ticket. QR-based verification.</p>
                            </div>
                            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
                                <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center mb-3">
                                    <Clock className="w-5 h-5 text-teal-600" />
                                </div>
                                <p className="font-bold text-slate-900 text-sm">3-Hour Validity</p>
                                <p className="text-xs text-slate-500 mt-0.5">Valid from the moment of purchase.</p>
                            </div>
                            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
                                <div className="w-10 h-10 rounded-xl bg-cyan-50 flex items-center justify-center mb-3">
                                    <Users className="w-5 h-5 text-cyan-600" />
                                </div>
                                <p className="font-bold text-slate-900 text-sm">Up to 4 Passengers</p>
                                <p className="text-xs text-slate-500 mt-0.5">Adults and children on one ticket.</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* ═══════════════ PHASE 2: Booking ═══════════════ */}
                {phase === 'booking' && (
                    <>
                        {/* Back to route selection */}
                        <div className="mb-6">
                            <Button
                                variant="ghost"
                                onClick={() => { setPhase('route'); setGenInfo(null); setTrainId(null); }}
                                className="text-muted-foreground hover:text-foreground pl-0 hover:pl-2 transition-all"
                            >
                                <ArrowLeft className="w-4 h-4 mr-2" /> Change Route
                            </Button>
                        </div>

                        {isLoading ? (
                            <div className="flex flex-col items-center justify-center py-20 gap-4">
                                <div className="relative">
                                    <div className="w-16 h-16 border-4 border-emerald-100 rounded-full" />
                                    <div className="absolute inset-0 w-16 h-16 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                                </div>
                                <p className="text-muted-foreground font-medium animate-pulse">Loading fare & availability…</p>
                            </div>
                        ) : (
                            <div className="grid lg:grid-cols-3 gap-8">
                                {/* ── Left: Config ── */}
                                <div className="lg:col-span-2 space-y-5">
                                    {/* Train info mini-card */}
                                    {trainName && (
                                        <div className="bg-white rounded-2xl shadow-sm p-4 flex items-center gap-4" style={{ border: '1px solid #a7f3d0' }}>
                                            <div className="w-12 h-12 rounded-xl flex items-center justify-center shadow-inner" style={{ backgroundColor: '#ecfdf5', color: '#059669' }}>
                                                <Train className="w-6 h-6" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-bold" style={{ color: '#1e293b' }}>{trainName}</p>
                                                <p className="text-sm" style={{ color: '#64748b' }}>#{trainNumber} {distanceKm > 0 && `· ${distanceKm} km`}</p>
                                            </div>
                                            <span className="px-3 py-1 rounded-full text-xs font-bold" style={{ backgroundColor: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0' }}>
                                                GEN
                                            </span>
                                        </div>
                                    )}

                                    {/* Train Type selector */}
                                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                                        <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#64748b' }}>Train Type</p>
                                        <div className="grid grid-cols-3 gap-2">
                                            {(['ORDINARY', 'MAIL/EXP', 'SUPERFAST'] as const).map(type => (
                                                <button
                                                    key={type}
                                                    onClick={() => setTrainCategory(type)}
                                                    className={cn(
                                                        "py-3 px-3 rounded-xl text-sm font-semibold border transition-all flex flex-col items-center gap-0.5",
                                                        trainCategory === type
                                                            ? "bg-gradient-to-br from-emerald-600 to-teal-600 border-emerald-600 shadow-md shadow-emerald-500/20"
                                                            : "bg-white border-slate-200 hover:border-emerald-300 hover:bg-emerald-50"
                                                    )}
                                                    style={trainCategory === type ? { color: '#fff' } : { color: '#64748b' }}
                                                >
                                                    <span>{type}</span>
                                                    <span className="text-xs font-normal" style={{ color: trainCategory === type ? 'rgba(255,255,255,0.7)' : 'rgba(100,116,139,0.7)' }}>
                                                        from ₹{MIN_FARES[type]}
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Passenger count */}
                                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                                        <p className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: '#64748b' }}>Passengers</p>
                                        <div className="space-y-4">
                                            {/* Adults */}
                                            <div className="flex items-center justify-between py-1">
                                                <div>
                                                    <p className="font-semibold" style={{ color: '#1e293b' }}>Adult</p>
                                                    <p className="text-xs" style={{ color: '#64748b' }}>Full fare · ₹{farePerPax.toFixed(0)} per pax</p>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <button onClick={() => handleCountChange('adults', -1)} disabled={counts.adults <= 1}
                                                        className="w-9 h-9 rounded-full border flex items-center justify-center transition-colors"
                                                        style={{ borderColor: '#e2e8f0', color: counts.adults <= 1 ? '#cbd5e1' : '#059669' }}>
                                                        <Minus className="w-4 h-4" strokeWidth={2.5} />
                                                    </button>
                                                    <span className="w-8 text-center text-lg font-bold tabular-nums" style={{ color: '#1e293b' }}>{counts.adults}</span>
                                                    <button onClick={() => handleCountChange('adults', 1)} disabled={totalPassengers >= 4}
                                                        className="w-9 h-9 rounded-full border flex items-center justify-center transition-colors"
                                                        style={{ borderColor: '#e2e8f0', color: totalPassengers >= 4 ? '#cbd5e1' : '#059669' }}>
                                                        <Plus className="w-4 h-4" strokeWidth={2.5} />
                                                    </button>
                                                </div>
                                            </div>
                                            <div style={{ borderTop: '1px solid #f1f5f9' }} />
                                            {/* Children */}
                                            <div className="flex items-center justify-between py-1">
                                                <div>
                                                    <p className="font-semibold" style={{ color: '#1e293b' }}>Child</p>
                                                    <p className="text-xs" style={{ color: '#64748b' }}>Half fare · ages 5–12 · ₹{(farePerPax / 2).toFixed(0)} per pax</p>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <button onClick={() => handleCountChange('children', -1)} disabled={counts.children <= 0}
                                                        className="w-9 h-9 rounded-full border flex items-center justify-center transition-colors"
                                                        style={{ borderColor: '#e2e8f0', color: counts.children <= 0 ? '#cbd5e1' : '#059669' }}>
                                                        <Minus className="w-4 h-4" strokeWidth={2.5} />
                                                    </button>
                                                    <span className="w-8 text-center text-lg font-bold tabular-nums" style={{ color: '#1e293b' }}>{counts.children}</span>
                                                    <button onClick={() => handleCountChange('children', 1)} disabled={totalPassengers >= 4}
                                                        className="w-9 h-9 rounded-full border flex items-center justify-center transition-colors"
                                                        style={{ borderColor: '#e2e8f0', color: totalPassengers >= 4 ? '#cbd5e1' : '#059669' }}>
                                                        <Plus className="w-4 h-4" strokeWidth={2.5} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Count + Digital notice */}
                                    <p className="text-xs px-1" style={{ color: '#64748b' }}>
                                        <span className="font-semibold" style={{ color: '#1e293b' }}>{totalPassengers}/4</span> passengers selected · max 4 per ticket
                                    </p>
                                    <div className="flex items-start gap-3 p-4 rounded-xl" style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a' }}>
                                        <Info className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#d97706' }} />
                                        <p className="text-sm font-medium leading-relaxed" style={{ color: '#92400e' }}>
                                            This is a <span className="font-bold">digital-only</span> unreserved ticket valid for <span className="font-bold">3 hours</span> from the time of purchase. PDF download is not available for GEN tickets.
                                        </p>
                                    </div>
                                </div>

                                {/* ── Right: Fare Summary ── */}
                                <div className="lg:col-span-1">
                                    <div className="sticky top-24 bg-white rounded-2xl shadow-lg overflow-hidden" style={{ border: '1px solid #e2e8f0' }}>
                                        {/* Header */}
                                        <div className="p-5" style={{ background: 'linear-gradient(to right, #059669, #0d9488)', color: '#fff' }}>
                                            <p className="text-xs font-semibold uppercase tracking-wider mb-0.5" style={{ color: '#a7f3d0' }}>Booking Summary</p>
                                            <p className="font-bold text-lg" style={{ color: '#fff' }}>General (Unreserved)</p>
                                        </div>

                                        {/* Breakdown */}
                                        <div className="p-5 space-y-3">
                                            <div className="flex justify-between text-sm">
                                                <span style={{ color: '#64748b' }}>Route</span>
                                                <span className="font-medium text-right" style={{ color: '#1e293b' }}>{source} → {destination}</span>
                                            </div>
                                            <div className="flex justify-between text-sm">
                                                <span style={{ color: '#64748b' }}>Date</span>
                                                <span className="font-medium" style={{ color: '#1e293b' }}>{displayDate}</span>
                                            </div>
                                            <div style={{ borderTop: '1px solid #f1f5f9', margin: '4px 0' }} />
                                            <div className="flex justify-between text-sm">
                                                <span className="flex items-center gap-1.5" style={{ color: '#64748b' }}>
                                                    <Users className="w-3.5 h-3.5" />
                                                    {counts.adults} Adult{counts.adults !== 1 ? 's' : ''}
                                                </span>
                                                <span className="font-medium" style={{ color: '#1e293b' }}>₹{(farePerPax * counts.adults).toFixed(0)}</span>
                                            </div>
                                            {counts.children > 0 && (
                                                <div className="flex justify-between text-sm">
                                                    <span className="flex items-center gap-1.5" style={{ color: '#64748b' }}>
                                                        <Users className="w-3.5 h-3.5" />
                                                        {counts.children} Child{counts.children !== 1 ? 'ren' : ''}
                                                    </span>
                                                    <span className="font-medium" style={{ color: '#1e293b' }}>₹{((farePerPax / 2) * counts.children).toFixed(0)}</span>
                                                </div>
                                            )}
                                            <div className="flex justify-between text-sm">
                                                <span style={{ color: '#64748b' }}>Class</span>
                                                <span className="font-medium" style={{ color: '#1e293b' }}>GEN · Second</span>
                                            </div>
                                            <div className="flex justify-between text-sm">
                                                <span style={{ color: '#64748b' }}>Validity</span>
                                                <span className="font-medium" style={{ color: '#1e293b' }}>3 hours</span>
                                            </div>

                                            <div className="pt-3 mt-3 flex justify-between items-center" style={{ borderTop: '1px solid #f1f5f9' }}>
                                                <span className="font-bold" style={{ color: '#1e293b' }}>Total Fare</span>
                                                <span className="text-2xl font-bold" style={{ color: '#059669' }}>₹{totalFare.toFixed(0)}</span>
                                            </div>
                                        </div>

                                        {/* Pay button */}
                                        <div className="px-5 pb-5">
                                            <Button
                                                id="gen-book-btn"
                                                onClick={handlePay}
                                                disabled={isSubmitting || !genInfo?.canBook}
                                                className="w-full font-bold text-base py-6 rounded-xl shadow-lg transition-all"
                                                style={{ background: 'linear-gradient(to right, #059669, #0d9488)', color: '#fff' }}
                                            >
                                                {isSubmitting
                                                    ? 'Processing…'
                                                    : genInfo?.canBook
                                                        ? 'Proceed to Payment'
                                                        : 'No Seats Available'}
                                            </Button>
                                            {genInfo && !genInfo.canBook && (
                                                <p className="text-center text-xs mt-2" style={{ color: '#64748b' }}>
                                                    This train's General coaches are full for the selected date.
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </main>
        </div>
    );
};

export default GenBooking;
