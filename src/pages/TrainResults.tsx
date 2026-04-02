import Navbar from '@/components/Navbar';
import TrainInlineTracker from '@/components/TrainInlineTracker';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Skeleton } from "@/components/ui/skeleton";
import { API_BASE } from '@/lib/api';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ArrowLeft, ArrowRight, BanIcon, Clock, Filter, MapPin, Radio, Train as TrainIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

interface CoachSummary {
    coach_type: string;
    count: number;
    total_seats: number;
}

interface TrainData {
    run_id?: number;
    train_id: number;
    train_number: string;
    train_name: string;
    departure_time: string;
    arrival_time: string;
    duration: string;
    distance_km: number;
    coaches: {
        coach_id: number;
        coach_number: string;
        coach_type: string;
        capacity: number;
        seats: any[];
    }[];
    coach_summary: CoachSummary[];
    isExpired?: boolean;
}

// Color map for coach types
const COACH_TYPE_COLORS: Record<string, { bg: string; border: string; text: string; dot: string }> = {
    '1A': { bg: 'bg-amber-50',   border: 'border-amber-200', text: 'text-amber-700', dot: 'bg-amber-400' },
    '2A': { bg: 'bg-blue-50',    border: 'border-blue-200',  text: 'text-blue-700',  dot: 'bg-blue-400'  },
    '3A': { bg: 'bg-indigo-50',  border: 'border-indigo-200',text: 'text-indigo-700',dot: 'bg-indigo-400'},
    'SL': { bg: 'bg-green-50',   border: 'border-green-200', text: 'text-green-700', dot: 'bg-green-400' },
    'CC': { bg: 'bg-purple-50',  border: 'border-purple-200',text: 'text-purple-700',dot: 'bg-purple-400'},
    '2S': { bg: 'bg-rose-50',    border: 'border-rose-200',  text: 'text-rose-700',  dot: 'bg-rose-400'  },
    'GEN':{ bg: 'bg-slate-50',   border: 'border-slate-200', text: 'text-slate-600', dot: 'bg-slate-400' },
};

const getCoachColors = (type: string) =>
    COACH_TYPE_COLORS[type] ?? COACH_TYPE_COLORS['GEN'];

const TrainResults = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [trains, setTrains] = useState<TrainData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sortBy, setSortBy] = useState("departure");
  // Which card has the inline tracker expanded (keyed by run_id or train_id as string)
  const [expandedTrackerId, setExpandedTrackerId] = useState<string | null>(null);

  const source = searchParams.get('source');
  const destination = searchParams.get('destination');
  const dateStr = searchParams.get('date');
  const travelClass = searchParams.get('class');
  const quota = searchParams.get('quota');

  useEffect(() => {
    const fetchTrains = async () => {
      setIsLoading(true);
      try {
        const query = new URLSearchParams({
            source: source || '',
            destination: destination || '',
            date: dateStr || ''
        });
        console.log('Search query:', query.toString());
        const response = await fetch(`${API_BASE}/trains/search?${query.toString()}`);
        console.log('Response status:', response.status, response.statusText);
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          console.error('API Error:', errorData);
          throw new Error(errorData.error || 'Failed to fetch trains');
        }
        const data = await response.json();
        console.log('Received trains:', data);
        setTrains(data);
      } catch (error) {
        console.error('Failed to fetch trains:', error);
      } finally {
        setIsLoading(false);
      }
    };

    if (source && destination) {
        fetchTrains();
    }
  }, [source, destination, dateStr]);

  const sortedTrains = [...trains].sort((a, b) => {
      if (sortBy === "departure") return a.departure_time.localeCompare(b.departure_time);
      if (sortBy === "arrival") return a.arrival_time.localeCompare(b.arrival_time);
      if (sortBy === "duration") return a.duration.localeCompare(b.duration);
      return 0;
  });

  const handleBook = (train: TrainData, forceGen = false) => {
     // If the train has GEN coaches AND caller requests GEN, go to /gen-booking
     const genCoach = forceGen ? train.coaches?.find((c: any) => c.coach_type === 'GEN') : null;
     if (forceGen && genCoach) {
       navigate('/gen-booking', {
         state: {
           trainId: train.train_id.toString(),
           trainName: train.train_name,
           trainNumber: train.train_number,
           source,
           destination,
           date: dateStr ? format(new Date(dateStr), 'PPP') : '',
           isoDate: dateStr,
           distance: train.distance_km,
         },
       });
       return;
     }
     // Otherwise normal reserved-seat flow
     navigate('/seats', { 
        state: { 
          source, 
          destination, 
          date: dateStr ? format(new Date(dateStr), 'PPP') : '',
          isoDate: dateStr,
          trainId: train.train_id.toString(),
          class: travelClass,
          distance: train.distance_km,
          quota
        } 
      });
  };

  return (
    <div className="min-h-screen bg-slate-50 relative">
       {/* Background Decor */}
       <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 left-0 w-full h-[300px] bg-gradient-to-b from-blue-600/5 to-slate-50 opacity-10"></div>
      </div>

      <Navbar />

      <main className="container mx-auto px-4 py-8 max-w-6xl relative z-10">
        <div className="flex items-center justify-between mb-8">
            <div>
                <Button variant="ghost" className="mb-2 pl-0 hover:pl-2 transition-all" onClick={() => navigate(-1)}>
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back
                </Button>
                <h1 className="font-display text-3xl font-bold text-slate-900">
                    Trains from <span className="text-blue-600">{source}</span> to <span className="text-blue-600">{destination}</span>
                </h1>
                <p className="text-slate-500 mt-1">
                    {dateStr ? format(new Date(dateStr), 'EEEE, MMMM d, yyyy') : 'Date not selected'} • {trains.length} result{trains.length !== 1 ? 's' : ''}
                </p>
            </div>
            
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-slate-400" />
                    <span className="text-sm font-medium text-slate-600">Sort by:</span>
                </div>
                <Select value={sortBy} onValueChange={setSortBy}>
                    <SelectTrigger className="w-[180px] bg-white">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="departure">Departure Time</SelectItem>
                        <SelectItem value="arrival">Arrival Time</SelectItem>
                        <SelectItem value="duration">Duration</SelectItem>
                    </SelectContent>
                </Select>
            </div>
        </div>

        {isLoading ? (
            <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex gap-6">
                        <Skeleton className="w-16 h-16 rounded-2xl" />
                        <div className="flex-1 space-y-4">
                            <Skeleton className="h-6 w-1/3" />
                            <Skeleton className="h-4 w-1/4" />
                            <Skeleton className="h-12 w-full rounded-xl" />
                        </div>
                    </div>
                ))}
            </div>
        ) : trains.length === 0 ? (
            <div className="text-center py-20 bg-white border border-dashed border-slate-300 rounded-3xl">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
                    <TrainIcon className="w-8 h-8 opacity-50" />
                </div>
                <h3 className="text-lg font-bold text-slate-600 mb-1">No trains found</h3>
                <p className="text-slate-400">Try changing your search parameters or date.</p>
                <Button variant="outline" className="mt-6" onClick={() => navigate(-1)}>
                    Back to Search
                </Button>
            </div>
        ) : (
            <div className="space-y-5">
                {sortedTrains.map((train) => {
                    // Build coach summary — fall back to deriving from coaches array if coach_summary is missing
                    const summary: CoachSummary[] = train.coach_summary?.length
                        ? train.coach_summary
                        : Object.values(
                            (train.coaches || []).reduce<Record<string, CoachSummary>>((acc, c) => {
                                const t = c.coach_type || 'GEN';
                                if (!acc[t]) acc[t] = { coach_type: t, count: 0, total_seats: 0 };
                                acc[t].count += 1;
                                acc[t].total_seats += c.capacity || c.seats?.length || 0;
                                return acc;
                            }, {})
                        );

                    // Filter out GEN coaches from summary for display
                    const reservedSummary = summary.filter(c => c.coach_type !== 'GEN');
                    const totalSeats = reservedSummary.reduce((s, c) => s + c.total_seats, 0);
                    const trackId = String(train.run_id ?? train.train_id);
                    const isTracking = expandedTrackerId === trackId;

                    return (
                        <div 
                            key={train.train_id}
                            className={cn(
                                "group bg-white rounded-3xl p-6 border transition-all duration-300",
                                train.isExpired
                                    ? "border-slate-200 shadow-sm opacity-60 grayscale-[50%] pointer-events-auto"
                                    : "border-slate-100 shadow-lg shadow-slate-200/50 hover:shadow-xl hover:shadow-slate-300/40 hover:border-blue-200"
                            )}
                            style={train.isExpired ? { filter: 'grayscale(50%)' } : undefined}
                        >
                            <div className="flex flex-col md:flex-row md:items-center gap-6 md:gap-8">
                                 {/* Train Info */}
                                 <div className="flex items-center gap-4 md:w-1/4">
                                    <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center shadow-inner">
                                        <TrainIcon className="w-7 h-7" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-lg text-slate-900">{train.train_name}</h3>
                                        <span className="text-xs font-medium bg-slate-100 text-slate-500 px-2 py-0.5 rounded">
                                            #{train.train_number}
                                        </span>
                                    </div>
                                 </div>

                                 {/* Time & Distance Info */}
                                 <div className="flex-1 flex items-center justify-between gap-8 px-4 border-l border-r border-slate-100 border-dashed md:border-solid mx-4 md:mx-0 py-4 md:py-0">
                                    <div className="text-center">
                                        <p className="text-2xl font-bold text-slate-900 font-mono tracking-tight">{train.departure_time.substring(0, 5)}</p>
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{source}</p>
                                    </div>
                                    <div className="flex flex-col items-center gap-1">
                                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400">
                                            <Clock className="w-3 h-3" /> {train.duration}
                                        </div>
                                        <div className="w-24 h-0.5 bg-slate-200 rounded-full relative">
                                            <div className="absolute top-1/2 left-0 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-slate-300"></div>
                                            <div className="absolute top-1/2 right-0 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-slate-300"></div>
                                        </div>
                                        {train.distance_km > 0 && (
                                            <div className="flex items-center gap-1 text-xs text-slate-400 font-medium">
                                                <MapPin className="w-3 h-3" />
                                                {train.distance_km} km
                                            </div>
                                        )}
                                    </div>
                                    <div className="text-center">
                                        <p className="text-2xl font-bold text-slate-900 font-mono tracking-tight">{train.arrival_time.substring(0, 5)}</p>
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{destination}</p>
                                    </div>
                                 </div>

                                 {/* Action column */}
                                 <div className="flex flex-col items-center gap-3 md:w-1/5">
                                    {train.isExpired ? (
                                        <p className="text-xs text-red-500 font-semibold flex items-center gap-1">
                                            <BanIcon className="w-3 h-3" /> Boarding Closed
                                        </p>
                                    ) : (
                                        <p className="text-xs text-green-600 font-semibold">
                                            {totalSeats} Seats Available
                                        </p>
                                    )}
                                    <Button 
                                        onClick={() => !train.isExpired && handleBook(train, false)}
                                        disabled={!!train.isExpired}
                                        className={cn(
                                            "w-full font-bold rounded-xl shadow-lg transition-all",
                                            train.isExpired
                                                ? "bg-slate-300 text-slate-500 cursor-not-allowed shadow-none"
                                                : "bg-blue-600 hover:bg-blue-700 shadow-blue-500/20"
                                        )}
                                    >
                                        {train.isExpired ? (
                                            <>
                                                <BanIcon className="w-4 h-4 mr-2" />
                                                Departed
                                            </>
                                        ) : (
                                            <>
                                                View Seats
                                                <ArrowRight className="w-4 h-4 ml-2" />
                                            </>
                                        )}
                                    </Button>
                                    {/* Track Live — always active, even for expired trains */}
                                    <button
                                        onClick={() => setExpandedTrackerId(prev => prev === trackId ? null : trackId)}
                                        className={cn(
                                          "w-full flex items-center justify-center gap-1.5 text-xs font-semibold border rounded-xl py-2 transition-all",
                                          isTracking
                                            ? "bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/20"
                                            : "text-blue-600 border-blue-200 bg-blue-50 hover:bg-blue-100"
                                        )}
                                    >
                                        <Radio className="w-3 h-3 animate-pulse" />
                                        {isTracking ? 'Hide Tracker' : 'Track Live'}
                                    </button>
                                 </div>
                            </div>

                            {/* Coach Availability */}
                            <div className="mt-5 pt-4 border-t border-slate-100">
                                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                                    Available Coaches
                                </p>
                                {reservedSummary.length === 0 ? (
                                    <p className="text-xs text-slate-400 italic">No coach information available</p>
                                ) : (
                                    <div className="flex flex-wrap gap-2">
                                        {reservedSummary.map((c) => {
                                            const colors = getCoachColors(c.coach_type);
                                            const isSelected = travelClass === c.coach_type;
                                            return (
                                                <div
                                                    key={c.coach_type}
                                                    className={cn(
                                                        "flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-all",
                                                        isSelected
                                                            ? `${colors.bg} ${colors.border} ${colors.text} ring-2 ring-offset-1 ring-current`
                                                            : `${colors.bg} ${colors.border} ${colors.text}`
                                                    )}
                                                >
                                                    <span className={cn("w-2 h-2 rounded-full", colors.dot)}></span>
                                                    <span className="font-bold">{c.coach_type}</span>
                                                    <span className="opacity-60 text-xs">
                                                        {c.count} coach{c.count !== 1 ? 'es' : ''} · {c.total_seats} seats
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Inline horizontal live tracker — expands inside the card */}
                            <TrainInlineTracker
                              runId={trackId}
                              trainId={train.train_id}
                              isOpen={isTracking}
                              onToggle={() => setExpandedTrackerId(prev => prev === trackId ? null : trackId)}
                            />
                        </div>
                    );
                })}
            </div>
        )}
      </main>
    </div>
  );
};

export default TrainResults;