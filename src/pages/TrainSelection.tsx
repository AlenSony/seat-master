import Navbar from '@/components/Navbar';
import TrainInlineTracker from '@/components/TrainInlineTracker';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { API_BASE, getStoredUser } from '@/lib/api';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, ArrowRightLeft, BanIcon, CalendarDays, Check, Clock, Edit2, MapPin, MapPinOff, Radio, Train as TrainIcon, UtensilsCrossed, Wifi, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface TrainData {
  id: string;          // run_id (used as the React list key + tracker ID)
  runId: string;       // always the run_id for the tracker
  trainDbId: string;   // ← the actual train_id from the DB (used for bookings/coaches)
  number: string;
  name: string;
  coaches: string[];
  coachTypes: string[];
  departureTime: string;
  arrivalTime: string;
  duration: string;
  sourceStation: string;
  destinationStation: string;
  isExpired?: boolean;
  distance?: number;
}

interface TrainStop {
  stop_id: number;
  train_id: number;
  station_id: number;
  stop_order: number;
  arrival_time: string | null;
  departure_time: string | null;
  station: {
    station_name: string;
    station_code: string;
  };
}

const TrainSelection = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [source, setSource] = useState<string>('');
  const [destination, setDestination] = useState<string>('');
  const [date, setDate] = useState<Date>();
  const [selectedTrain, setSelectedTrain] = useState<string>('');
  const [expandedTrackerId, setExpandedTrackerId] = useState<string | null>(null);
  
  const [trains, setTrains] = useState<TrainData[]>([]);
  const [stations, setStations] = useState<string[]>([]);
  const [allStations, setAllStations] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modify search inline panel state
  const [isSearchEditing, setIsSearchEditing] = useState(false);
  const [tempSource, setTempSource] = useState<string>('');
  const [tempDest, setTempDest] = useState<string>('');
  const [tempDate, setTempDate] = useState<Date | undefined>(undefined);

  // New state for intermediate stops
  const [trainStops, setTrainStops] = useState<TrainStop[]>([]);
  const [boardingStop, setBoardingStop] = useState<string>('');
  const [droppingStop, setDroppingStop] = useState<string>('');
  const [stopsLoading, setStopsLoading] = useState(false);

  // Fetch all stations once for the modify-search dropdowns
  useEffect(() => {
    const fetchAllStations = async () => {
      try {
        const res = await fetch(`${API_BASE}/trains`);
        const data = await res.json();
        const names: string[] = Array.from(
          new Set(
            data.flatMap((t: any) => [
              t.source_station,
              t.destination_station,
            ]).filter(Boolean)
          )
        ) as string[];
        setAllStations(names.sort());
      } catch (e) {
        console.error('Failed to fetch all stations for modify search:', e);
      }
    };
    fetchAllStations();
  }, []);

  useEffect(() => {
    const fetchTrains = async () => {
      setIsLoading(true);
      try {
        let response;
        let data;
        
        // If source and destination are selected, use search endpoint
        if (source && destination) {
          console.log(`Searching trains from ${source} to ${destination}`);
          response = await fetch(`${API_BASE}/trains/search?source=${encodeURIComponent(source)}&destination=${encodeURIComponent(destination)}`);
          data = await response.json();
          
          console.log('Search results:', data);
          
          // Map search results to TrainData format
          const mappedTrains: TrainData[] = data.map((result: any) => ({
            id: result.run_id.toString(),
            runId: result.run_id.toString(),
            trainDbId: result.train_id.toString(),   // ← real train_id
            number: result.train_number,
            name: result.train_name,
            coaches: result.coaches ? result.coaches.map((c: any) => c.coach_number) : [],
            coachTypes: result.coaches ? result.coaches.map((c: any) => c.coach_type) : [],
            departureTime: result.departure_time ? result.departure_time.substring(0, 5) : '--:--',
            arrivalTime: result.arrival_time ? result.arrival_time.substring(0, 5) : '--:--',
            duration: result.duration || 'N/A',
            sourceStation: result.source || source,
            destinationStation: result.destination || destination,
            isExpired: result.isExpired ?? false,
            distance: result.distance_km ?? 0,
          }));
          
          setTrains(mappedTrains);
          
          // Extract unique stations from search results
          const uniqueStations = Array.from(new Set(mappedTrains.flatMap(t => [t.sourceStation, t.destinationStation])));
          setStations(uniqueStations);
        } else {
          // Otherwise, fetch all trains
          console.log('Fetching all trains');
          response = await fetch(`${API_BASE}/trains`);
          data = await response.json();
          
          const mappedTrains: TrainData[] = data.map((t: any) => ({
            id: t.train_id.toString(),
            runId: t.runs?.[0]?.run_id?.toString() || t.train_id.toString(),
            trainDbId: t.train_id.toString(),       // ← real train_id (same as id here)
            number: t.train_number,
            name: t.train_name,
            coaches: t.coaches ? t.coaches.map((c: any) => c.coach_number) : [],
            coachTypes: t.coaches ? t.coaches.map((c: any) => c.coach_type) : [],
            departureTime: t.departure_time ? t.departure_time.substring(0, 5) : '--:--',
            arrivalTime: t.arrival_time ? t.arrival_time.substring(0, 5) : '--:--',
            duration: t.duration || 'N/A',
            sourceStation: t.source_station,
            destinationStation: t.destination_station,
            distance: 0,
          }));

          setTrains(mappedTrains);

          // Extract unique stations
          const uniqueStations = Array.from(new Set(mappedTrains.flatMap(t => [t.sourceStation, t.destinationStation])));
          setStations(uniqueStations);
        }
      } catch (error) {
        console.error('Failed to fetch trains:', error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to load trains. Please try again.",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchTrains();
  }, [source, destination]); // Re-fetch when source or destination changes

  useEffect(() => {
    const fetchStops = async () => {
      if (!selectedTrain) {
        setTrainStops([]);
        setBoardingStop('');
        setDroppingStop('');
        return;
      }

      setStopsLoading(true);
      try {
        const response = await fetch(`${API_BASE}/trains/${selectedTrain}/stops`);
        const data = await response.json();
        setTrainStops(data);
        
        // Default selection logic: 
        // Try to match current source/dest if they exist in stops, else picking first and last
        const selectedTrainObj = trains.find(t => t.id === selectedTrain);
        if (selectedTrainObj) {
            // Find connection to global source/dest if possible, else default to train source/dest
             const startStop = data.find((s: TrainStop) => s.station.station_name === source) || data[0];
             const endStop = data.find((s: TrainStop) => s.station.station_name === destination) || data[data.length - 1];
             
             if(startStop) setBoardingStop(startStop.station.station_name);
             if(endStop) setDroppingStop(endStop.station.station_name);
        }

      } catch (error) {
        console.error('Failed to fetch stops:', error);
      } finally {
        setStopsLoading(false);
      }
    };

    fetchStops();
  }, [selectedTrain]); // Removed source/dest dependency to avoid resetting when user customizes



  const handleSearch = () => {
    const user = getStoredUser();
    
    if (!user) {
      toast({
        variant: "destructive",
        title: "Authentication Required",
        description: "Please login to proceed with booking.",
      });
      navigate('/login');
      return;
    }

    const finalSource = boardingStop || source;
    const finalDest = droppingStop || destination;

    if (finalSource && finalDest && date && selectedTrain) {
      const trainData = trains.find(t => t.id === selectedTrain);
      const realTrainId = trainData?.trainDbId ?? selectedTrain; // ← always the DB train_id
      // If the train ONLY has GEN coaches (no reserved coaches), go directly to /gen-booking
      const allCoachTypes: string[] = trainData?.coachTypes ?? [];
      const hasReserved = allCoachTypes.some(t => !['GEN','ENG','PCL'].includes(t));
      if (!hasReserved && allCoachTypes.some(t => t === 'GEN')) {
        navigate('/gen-booking', {
          state: {
            trainId: realTrainId,
            trainName: trainData?.name,
            trainNumber: trainData?.number,
            source: finalSource,
            destination: finalDest,
            date: format(date, 'PPP'),
            isoDate: format(date, 'yyyy-MM-dd'),
            distance: trainData?.distance ?? 0,
          },
        });
        return;
      }
      navigate('/seats', {
        state: {
          source: finalSource,
          destination: finalDest,
          date: format(date, 'PPP'),
          isoDate: format(date, 'yyyy-MM-dd'),
          trainId: realTrainId,
        },
      });
    }
  };

  const selectedTrainData = trains.find(t => t.id === selectedTrain);
  
  // Validation Logic
  const getStopOrder = (stationName: string) => trainStops.find(s => s.station.station_name === stationName)?.stop_order || -1;
  const boardingOrder = getStopOrder(boardingStop);
  const droppingOrder = getStopOrder(droppingStop);
  const isValidRoute = boardingStop && droppingStop && boardingOrder < droppingOrder;
  
  const isFormComplete = selectedTrain 
    ? (isValidRoute && !!date && !selectedTrainData?.isExpired) 
    : (source && destination && date && selectedTrain);

  // Display all trains returned from the API (already filtered by search if source/dest selected)
  const displayTrains = trains;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 relative selection:bg-blue-100 selection:text-blue-900">
      {/* Background Decor */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 left-0 w-full h-[500px] bg-gradient-to-b from-blue-600 to-slate-50 opacity-10"></div>
          <div className="absolute -top-[20%] -right-[10%] w-[50%] h-[50%] rounded-full bg-blue-400/20 blur-3xl"></div>
          <div className="absolute top-[20%] -left-[10%] w-[40%] h-[40%] rounded-full bg-indigo-400/20 blur-3xl"></div>
      </div>

      <Navbar
        extraNav={
          <Button variant="ghost" onClick={() => navigate('/')} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
        }
      />

      <main className="container mx-auto px-4 py-8 max-w-7xl relative z-10">
        {/* Page Header */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <h1 className="font-display text-4xl md:text-5xl font-bold text-slate-900 mb-4 tracking-tight">
            Begin your <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">journey</span>
          </h1>
          <p className="text-slate-500 text-lg max-w-2xl mx-auto">
            Select a train and customize your boarding points to get started
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-12 gap-8">
          {/* Left - Search Form (Sticky) */}
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="lg:col-span-4 lg:sticky lg:top-28 h-fit"
          >
            <div className="bg-white/70 backdrop-blur-xl rounded-3xl shadow-xl shadow-slate-200/40 border border-white/50 p-6 md:p-8 hover:shadow-2xl hover:shadow-blue-900/5 transition-shadow duration-300">
              <AnimatePresence mode="wait">
              {selectedTrain && trainStops.length > 0 ? (
                 <motion.div
                    key="route-selector"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="space-y-6"
                 >
                    <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                        <h2 className="font-display font-bold text-xl text-slate-800">
                            Your Route
                        </h2>
                        <Button variant="ghost" size="sm" onClick={() => setSelectedTrain('')} className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:bg-blue-50">
                           Change
                        </Button>
                    </div>
                    
                    <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50/50 rounded-2xl border border-blue-100/50">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="font-bold text-slate-900 text-lg">{selectedTrainData?.name}</p>
                                <p className="text-sm text-slate-500 font-medium">#{selectedTrainData?.number}</p>
                            </div>
                            <TrainIcon className="w-10 h-10 text-blue-200 opacity-50" />
                        </div>
                    </div>

                    <div className="space-y-4">
                        {/* Boarding Point */}
                        <div className="space-y-2 group">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2 px-1">
                                <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
                                Boarding At
                            </label>
                            <Select value={boardingStop} onValueChange={setBoardingStop}>
                                <SelectTrigger className="h-14 bg-white border-slate-200 rounded-xl hover:border-blue-300 focus:ring-4 focus:ring-blue-100 transition-all shadow-sm">
                                     <SelectValue placeholder="Select boarding point" />
                                </SelectTrigger>
                                <SelectContent className="max-h-[300px]">
                                    {trainStops.map((stop) => (
                                        <SelectItem 
                                            key={stop.stop_id} 
                                            value={stop.station.station_name}
                                            disabled={stop.stop_order >= (droppingOrder > -1 ? droppingOrder : 999)}
                                            className="focus:bg-blue-50 p-3"
                                        >
                                            <div className="flex justify-between w-full gap-8 items-center">
                                                <span className="font-medium">{stop.station.station_name}</span>
                                                <span className="text-slate-400 text-xs font-mono bg-slate-100 px-2 py-1 rounded">{stop.departure_time?.substring(0,5)}</span>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        
                        <div className="flex pl-6 my-1">
                            <div className="h-8 w-0.5 bg-gradient-to-b from-emerald-500/50 to-rose-500/50" />
                        </div>

                         {/* Dropping Point */}
                         <div className="space-y-2 group">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2 px-1">
                                <div className="w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]" />
                                Dropping At
                            </label>
                            <Select value={droppingStop} onValueChange={setDroppingStop}>
                                <SelectTrigger className="h-14 bg-white border-slate-200 rounded-xl hover:border-blue-300 focus:ring-4 focus:ring-blue-100 transition-all shadow-sm">
                                     <SelectValue placeholder="Select destination" />
                                </SelectTrigger>
                                <SelectContent className="max-h-[300px]">
                                    {trainStops.map((stop) => (
                                        <SelectItem 
                                            key={stop.stop_id} 
                                            value={stop.station.station_name}
                                            disabled={stop.stop_order <= boardingOrder}
                                            className="focus:bg-blue-50 p-3"
                                        >
                                             <div className="flex justify-between w-full gap-8 items-center">
                                                <span className="font-medium">{stop.station.station_name}</span>
                                                <span className="text-slate-400 text-xs font-mono bg-slate-100 px-2 py-1 rounded">{stop.arrival_time?.substring(0,5)}</span>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {isValidRoute && (
                       <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between shadow-inner">
                          <div className="text-center">
                             <p className="text-slate-400 text-[10px] uppercase font-bold tracking-widest mb-1">Depart</p>
                             <p className="font-bold text-xl text-slate-800 font-mono">
                                {trainStops.find(s => s.station.station_name === boardingStop)?.departure_time?.substring(0,5)}
                             </p>
                          </div>
                          <div className="flex flex-col items-center px-4 flex-1">
                              <p className="text-xs text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded-full mb-2">
                                {(() => {
                                   const start = trainStops.find(s => s.station.station_name === boardingStop)?.departure_time;
                                   const end = trainStops.find(s => s.station.station_name === droppingStop)?.arrival_time;
                                   if (!start || !end) return "--";
                                   const [sh, sm] = start.split(':').map(Number);
                                   const [eh, em] = end.split(':').map(Number);
                                   let mins = (eh * 60 + em) - (sh * 60 + sm);
                                   if (mins < 0) mins += 24 * 60; 
                                   const h = Math.floor(mins / 60);
                                   const m = mins % 60;
                                   return `${h}h ${m}m`;
                                })()}
                              </p>
                              <div className="w-full h-0.5 bg-slate-200 rounded-full relative">
                                  <div className="absolute top-1/2 left-0 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-slate-300"></div>
                                  <div className="absolute top-1/2 right-0 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-slate-300"></div>
                              </div>
                          </div>
                          <div className="text-center">
                             <p className="text-slate-400 text-[10px] uppercase font-bold tracking-widest mb-1">Arrive</p>
                             <p className="font-bold text-xl text-slate-800 font-mono">
                                {trainStops.find(s => s.station.station_name === droppingStop)?.arrival_time?.substring(0,5)}
                             </p>
                          </div>
                       </div>
                    )}

                    {!isValidRoute && (
                         <div className="p-4 bg-red-50/50 border border-red-100 text-red-600 text-sm font-medium rounded-xl flex gap-3 items-center">
                             <div className="p-1 bg-red-100 rounded-full">
                                <MapPinOff className="w-4 h-4" />
                             </div>
                             Invalid route selected
                         </div>
                    )}
                    
                     {/* Date Selection for Booking */}
                     <div className="space-y-2 pt-2">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2 px-1">
                            <CalendarDays className="w-4 h-4" />
                            Travel Date
                        </label>
                        <Popover>
                        <PopoverTrigger asChild>
                            <Button
                            variant="outline"
                            className={cn(
                                "w-full h-14 justify-start text-left font-normal bg-white border-slate-200 text-base rounded-xl transition-all shadow-sm hover:border-blue-300",
                                !date && "text-slate-400",
                                date && "ring-2 ring-blue-500/10 border-blue-500/50"
                            )}
                            >
                            <CalendarDays className={cn("mr-3 h-5 w-5", date ? "text-blue-600" : "text-slate-300")} />
                            {date ? format(date, "EEEE, MMMM d, yyyy") : "Select travel date"}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 rounded-xl shadow-xl border-slate-100" align="start">
                            <Calendar
                            mode="single"
                            selected={date}
                            onSelect={setDate}
                            disabled={(date) => date < new Date()}
                            initialFocus
                            className="p-3"
                            />
                        </PopoverContent>
                        </Popover>
                    </div>

                    {/* Timeline Visualization */}
                    <div className="mt-8 pt-6 border-t border-slate-100">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-6 px-1">Route Stops</h3>
                        <div className="relative pl-4 space-y-0 before:absolute before:left-[19px] before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-100">
                            {trainStops.map((stop, i) => {
                                const isBoarding = stop.station.station_name === boardingStop;
                                const isDropping = stop.station.station_name === droppingStop;
                                const isInRange = stop.stop_order >= boardingOrder && stop.stop_order <= droppingOrder;
                                
                                return (
                                <div key={stop.stop_id} className="relative z-10 flex items-start group pb-6 last:pb-0">
                                    <div className={cn(
                                        "w-2.5 h-2.5 rounded-full border-2 transition-all duration-300 flex-shrink-0 mt-1.5 bg-white",
                                        isBoarding ? "border-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.2)] scale-110" :
                                        isDropping ? "border-rose-500 shadow-[0_0_0_4px_rgba(244,63,94,0.2)] scale-110" :
                                        isInRange ? "border-blue-400" : "border-slate-200"
                                    )} />
                                    <div className={cn("ml-4 text-sm transition-colors duration-300 -mt-0.5", isInRange ? "text-slate-800 font-medium" : "text-slate-400")}>
                                        {stop.station.station_name}
                                    </div>
                                </div>
                                )
                            })}
                        </div>
                    </div>
                 </motion.div>
              ) : (
                <motion.div
                  key="search-form"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <h2 className="font-display font-bold text-2xl text-slate-800 mb-6 tracking-tight">
                    Find Trains
                  </h2>

                  <div className="space-y-6">
                    {/* From */}
                    <div className="space-y-2 group">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2 px-1">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
                        From Station
                      </label>
                      <Select value={source} onValueChange={setSource}>
                        <SelectTrigger className={cn(
                          "h-16 bg-white border-slate-200 text-base rounded-2xl transition-all shadow-sm hover:border-emerald-300 hover:shadow-emerald-500/5",
                          source && "ring-2 ring-emerald-500/10 border-emerald-500/50"
                        )}>
                          <div className="flex items-center gap-4 px-1">
                            <div className={cn("p-2 rounded-lg transition-colors", source ? "bg-emerald-50" : "bg-slate-50")}>
                                <MapPin className={cn("w-5 h-5", source ? "text-emerald-600" : "text-slate-400")} />
                            </div>
                            <SelectValue placeholder="Departing from" />
                          </div>
                        </SelectTrigger>
                        <SelectContent className="max-h-[300px]">
                          {stations.map((station) => (
                            <SelectItem key={station} value={station} disabled={station === destination} className="py-3 cursor-pointer focus:bg-emerald-50">
                              {station}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Connector */}
                    <div className="flex justify-center -my-2 relative z-10">
                         <div className="bg-white p-1.5 rounded-full border border-slate-100 shadow-sm text-slate-400">
                             <div className="bg-slate-50 w-6 h-6 rounded-full flex items-center justify-center">
                                 <div className="w-1 h-1 bg-slate-300 rounded-full mt-0.5"></div>
                                 <div className="w-1 h-1 bg-slate-300 rounded-full mb-0.5 -ml-1"></div>
                             </div>
                         </div>
                    </div>

                    {/* To */}
                    <div className="space-y-2 group">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2 px-1">
                        <div className="w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]" />
                        To Station
                      </label>
                      <Select value={destination} onValueChange={setDestination}>
                        <SelectTrigger className={cn(
                          "h-16 bg-white border-slate-200 text-base rounded-2xl transition-all shadow-sm hover:border-rose-300 hover:shadow-rose-500/5",
                          destination && "ring-2 ring-rose-500/10 border-rose-500/50"
                        )}>
                          <div className="flex items-center gap-4 px-1">
                             <div className={cn("p-2 rounded-lg transition-colors", destination ? "bg-rose-50" : "bg-slate-50")}>
                                <MapPin className={cn("w-5 h-5", destination ? "text-rose-600" : "text-slate-400")} />
                             </div>
                            <SelectValue placeholder="Going to" />
                          </div>
                        </SelectTrigger>
                        <SelectContent className="max-h-[300px]">
                          {stations.map((station) => (
                            <SelectItem key={station} value={station} disabled={station === source} className="py-3 cursor-pointer focus:bg-rose-50">
                              {station}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Date */}
                    <div className="space-y-2 pt-2">
                       <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2 px-1">
                        <CalendarDays className="w-4 h-4" />
                        Travel Date
                      </label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full h-16 justify-start text-left font-normal bg-white border-slate-200 text-base rounded-2xl transition-all shadow-sm hover:border-blue-300",
                              !date && "text-slate-400",
                              date && "ring-2 ring-blue-500/10 border-blue-500/50"
                            )}
                          >
                            <div className="flex items-center gap-4 px-1">
                                <div className={cn("p-2 rounded-lg transition-colors", date ? "bg-blue-50" : "bg-slate-50")}>
                                    <CalendarDays className={cn("w-5 h-5", date ? "text-blue-600" : "text-slate-400")} />
                                </div>
                                <div className="flex flex-col">
                                    <span className={cn(date ? "text-slate-900 font-medium" : "text-slate-400")}>
                                        {date ? format(date, "MMMM d, yyyy") : "Select a date"}
                                    </span>
                                    {date && <span className="text-xs text-slate-500 leading-none">{format(date, "EEEE")}</span>}
                                </div>
                            </div>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 rounded-2xl shadow-xl border-slate-100" align="start">
                          <Calendar
                            mode="single"
                            selected={date}
                            onSelect={setDate}
                            disabled={(date) => date < new Date()}
                            initialFocus
                            className="p-4"
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                </motion.div>
              )}
              </AnimatePresence>

              {/* Search/Proceed Button */}
              <motion.div 
                className="mt-8 space-y-3"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Button
                  onClick={handleSearch}
                  disabled={!isFormComplete}
                  size="lg"
                  className={cn(
                    "w-full h-16 text-lg font-bold rounded-2xl transition-all duration-300 relative overflow-hidden group",
                    isFormComplete 
                      ? "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-xl shadow-blue-500/25" 
                      : "bg-slate-100 text-slate-400"
                  )}
                >
                  <span className="relative z-10 flex items-center justify-center gap-2">
                      {selectedTrain ? "Proceed to Seats" : "Show Available Trains"}
                      <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </span>
                  {isFormComplete && (
                      <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                  )}
                </Button>


              </motion.div>
            </div>
          </motion.div>

          {/* Right - Train Cards (Scrollable) */}
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="lg:col-span-8 space-y-6 pb-20"
          >
            {/* ── Modify Search Panel ── */}
            <AnimatePresence mode="wait">
            {isSearchEditing ? (
              <motion.div
                key="edit-mode"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="bg-white/90 backdrop-blur-xl border border-blue-200 rounded-2xl shadow-lg shadow-blue-900/5 p-4"
              >
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-bold text-slate-700 flex items-center gap-2">
                    <Edit2 className="w-4 h-4 text-blue-600" />
                    Modify Search
                  </p>
                  <button
                    onClick={() => setIsSearchEditing(false)}
                    className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-lg hover:bg-slate-100"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid sm:grid-cols-3 gap-3">
                  {/* From */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 px-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      From
                    </label>
                    <Select value={tempSource} onValueChange={setTempSource}>
                      <SelectTrigger className={cn(
                        "h-11 bg-white border-slate-200 rounded-xl text-sm transition-all hover:border-emerald-300",
                        tempSource && "border-emerald-400/60 ring-2 ring-emerald-500/10"
                      )}>
                        <div className="flex items-center gap-2 px-0.5">
                          <MapPin className={cn("w-4 h-4 flex-shrink-0", tempSource ? "text-emerald-600" : "text-slate-300")} />
                          <SelectValue placeholder="Departing from" />
                        </div>
                      </SelectTrigger>
                      <SelectContent className="max-h-[260px]">
                        {allStations.map((s) => (
                          <SelectItem key={s} value={s} disabled={s === tempDest} className="py-2.5 focus:bg-emerald-50">
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* To */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 px-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                      To
                    </label>
                    <Select value={tempDest} onValueChange={setTempDest}>
                      <SelectTrigger className={cn(
                        "h-11 bg-white border-slate-200 rounded-xl text-sm transition-all hover:border-rose-300",
                        tempDest && "border-rose-400/60 ring-2 ring-rose-500/10"
                      )}>
                        <div className="flex items-center gap-2 px-0.5">
                          <MapPin className={cn("w-4 h-4 flex-shrink-0", tempDest ? "text-rose-600" : "text-slate-300")} />
                          <SelectValue placeholder="Going to" />
                        </div>
                      </SelectTrigger>
                      <SelectContent className="max-h-[260px]">
                        {allStations.map((s) => (
                          <SelectItem key={s} value={s} disabled={s === tempSource} className="py-2.5 focus:bg-rose-50">
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Date */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 px-1">
                      <CalendarDays className="w-3.5 h-3.5" />
                      Date
                    </label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full h-11 justify-start text-left font-normal bg-white border-slate-200 text-sm rounded-xl transition-all hover:border-blue-300",
                            !tempDate && "text-slate-400",
                            tempDate && "border-blue-400/60 ring-2 ring-blue-500/10"
                          )}
                        >
                          <CalendarDays className={cn("mr-2 h-4 w-4", tempDate ? "text-blue-600" : "text-slate-300")} />
                          {tempDate ? format(tempDate, "MMM d, yyyy") : "Pick a date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 rounded-xl shadow-xl border-slate-100" align="start">
                        <Calendar
                          mode="single"
                          selected={tempDate}
                          onSelect={setTempDate}
                          disabled={(d) => d < new Date()}
                          initialFocus
                          className="p-3"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                {/* Apply Button */}
                <div className="mt-3 flex justify-end">
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => {
                      if (tempSource) setSource(tempSource);
                      if (tempDest) setDestination(tempDest);
                      if (tempDate) setDate(tempDate);
                      // Reset train selection since route changed
                      setSelectedTrain('');
                      setTrainStops([]);
                      setBoardingStop('');
                      setDroppingStop('');
                      setIsSearchEditing(false);
                    }}
                    disabled={!tempSource || !tempDest || tempSource === tempDest}
                    className={cn(
                      "flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all",
                      tempSource && tempDest && tempSource !== tempDest
                        ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20 hover:shadow-lg hover:shadow-blue-500/30"
                        : "bg-slate-100 text-slate-400 cursor-not-allowed"
                    )}
                  >
                    <Check className="w-4 h-4" />
                    Apply Changes
                  </motion.button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="view-mode"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="bg-white/80 backdrop-blur-xl border border-slate-100 rounded-2xl shadow-sm p-3.5 flex flex-wrap items-center gap-3"
              >
                {/* Route pills */}
                <div className="flex items-center gap-2 flex-1 flex-wrap">
                  {source ? (
                    <span className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-100 text-emerald-700 text-sm font-semibold px-3 py-1.5 rounded-full">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      {source}
                    </span>
                  ) : (
                    <span className="text-sm text-slate-400 italic">All origins</span>
                  )}
                  <ArrowRightLeft className="w-4 h-4 text-slate-300 flex-shrink-0" />
                  {destination ? (
                    <span className="flex items-center gap-1.5 bg-rose-50 border border-rose-100 text-rose-700 text-sm font-semibold px-3 py-1.5 rounded-full">
                      <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                      {destination}
                    </span>
                  ) : (
                    <span className="text-sm text-slate-400 italic">All destinations</span>
                  )}
                  {date && (
                    <>
                      <span className="text-slate-200 hidden sm:block">•</span>
                      <span className="flex items-center gap-1.5 bg-blue-50 border border-blue-100 text-blue-700 text-sm font-semibold px-3 py-1.5 rounded-full">
                        <CalendarDays className="w-3.5 h-3.5" />
                        {format(date, "MMM d, yyyy")}
                      </span>
                    </>
                  )}
                </div>
                {/* Edit Button */}
                <button
                  onClick={() => {
                    setTempSource(source);
                    setTempDest(destination);
                    setTempDate(date);
                    setIsSearchEditing(true);
                  }}
                  className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-100 hover:border-blue-200 px-3 py-2 rounded-xl transition-all flex-shrink-0"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  Modify
                </button>
              </motion.div>
            )}
            </AnimatePresence>

            <div className="flex items-center justify-between -mt-2">
                <h2 className="font-display font-bold text-2xl text-slate-900 tracking-tight">
                {source && destination ? (
                    <span className="flex items-center gap-2">
                        Trains to <span className="text-blue-600">{destination}</span>
                    </span>
                ) : 'Available Trains'}
                </h2>
                <span className="text-sm font-medium text-slate-500 bg-white px-3 py-1 rounded-full shadow-sm border border-slate-100">
                    {displayTrains.length} results
                </span>
            </div>

            <div className="grid gap-5">
              {displayTrains.map((train, index) => (
                <motion.div
                  key={train.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 * index }}
                  whileHover={expandedTrackerId === train.id ? {} : { y: -4 }}
                  onClick={() => !train.isExpired && setSelectedTrain(train.id)}
                  className={cn(
                    "group bg-white rounded-3xl p-6 transition-all duration-300 relative overflow-hidden",
                    train.isExpired
                      ? "border border-slate-200 shadow-sm opacity-60 cursor-not-allowed"
                      : selectedTrain === train.id 
                        ? "ring-2 ring-blue-500 shadow-2xl shadow-blue-900/10 cursor-pointer" 
                        : "border border-slate-100 shadow-lg shadow-slate-200/50 hover:shadow-xl hover:shadow-slate-300/40 hover:border-blue-200 cursor-pointer"
                  )}
                  style={train.isExpired ? { filter: 'grayscale(50%)' } : undefined}
                >
                  {/* Selection Indicator */}
                  {selectedTrain === train.id && (
                     <div className="absolute top-0 right-0 p-4">
                         <div className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center shadow-lg shadow-blue-500/30">
                            <div className="w-3 h-3 bg-white rounded-full"></div>
                         </div>
                     </div>
                  )}

                  <div className="flex items-start gap-6 relative z-10">
                      {/* Train Icon Block */}
                      <div className={cn(
                        "w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold transition-colors duration-300 shadow-inner",
                        selectedTrain === train.id ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-500"
                      )}>
                          <TrainIcon className="w-8 h-8" />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
                              <div>
                                <h3 className="font-display font-bold text-xl text-slate-900 group-hover:text-blue-700 transition-colors">
                                  {train.name}
                                </h3>
                                <p className="text-sm font-medium text-slate-400 flex items-center gap-2 mt-1">
                                    <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-500">#{train.number}</span>
                                    <span>•</span>
                                    <span>Daily Service</span>
                                    {train.isExpired && (
                                      <span className="flex items-center gap-1 bg-red-100 text-red-600 px-2 py-0.5 rounded-full text-xs font-bold">
                                        <BanIcon className="w-3 h-3" /> Departed
                                      </span>
                                    )}
                                </p>
                              </div>
                              <div className="text-right hidden sm:block">
                                  <p className="text-2xl font-bold text-slate-900 font-mono tracking-tight">{train.departureTime}</p>
                                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Depart</p>
                              </div>
                          </div>

                          {/* Timeline Strip */}
                          <div className="flex items-center gap-6 mb-6">
                             <div className="sm:hidden text-center">
                                <p className="text-xl font-bold text-slate-900 font-mono">{train.departureTime}</p>
                             </div>
                             
                             <div className="flex-1 h-2 bg-slate-100 rounded-full relative overflow-hidden">
                                {selectedTrain === train.id && (
                                    <motion.div 
                                        layoutId="progress"
                                        className="absolute inset-0 bg-blue-500/20"
                                        initial={{ width: 0 }}
                                        animate={{ width: "100%" }}
                                    />
                                )}
                                <div className="absolute top-1/2 left-0 -translate-y-1/2 w-3 h-3 bg-white border-4 border-emerald-500 rounded-full shadow-sm z-10"></div>
                                <div className="absolute top-1/2 right-0 -translate-y-1/2 w-3 h-3 bg-white border-4 border-rose-500 rounded-full shadow-sm z-10"></div>
                                
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white border border-slate-200 px-3 py-1 rounded-full text-[10px] font-bold text-slate-500 shadow-sm z-20 flex items-center gap-1.5">
                                    <Clock className="w-3 h-3 text-slate-400" />
                                    {train.duration}
                                </div>
                             </div>

                             <div className="text-right">
                                <p className="text-2xl font-bold text-slate-900 font-mono tracking-tight">{train.arrivalTime}</p>
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Arrive</p>
                             </div>
                          </div>

                          {/* Footer Info */}
                          <div className="flex flex-wrap items-center justify-between gap-4">
                              <div className="flex items-center gap-2">
                                  {train.coaches.slice(0, 3).map((coach, i) => (
                                      <span key={i} className="px-2.5 py-1 bg-slate-100 border border-slate-200 text-slate-600 text-xs font-bold rounded-lg uppercase tracking-wide">
                                          {coach}
                                      </span>
                                  ))}
                                  {train.coaches.length > 3 && (
                                      <span className="text-xs font-bold text-slate-400">+{train.coaches.length - 3} more</span>
                                  )}
                              </div>
                              <div className="flex items-center gap-3 text-xs font-medium text-slate-400">
                                  <span className="flex items-center gap-1.5 bg-green-50 text-green-700 px-2 py-1 rounded-md">
                                      <Wifi className="w-3 h-3" /> WiFi
                                  </span>
                                  <span className="flex items-center gap-1.5 bg-orange-50 text-orange-700 px-2 py-1 rounded-md">
                                      <UtensilsCrossed className="w-3 h-3" /> Pantry
                                  </span>
                                  {/* Track Train Button */}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setExpandedTrackerId(prev => prev === train.id ? null : train.id);
                                    }}
                                    className={cn(
                                      "flex items-center gap-1.5 border px-2.5 py-1 rounded-md transition-all font-semibold text-xs",
                                      expandedTrackerId === train.id
                                        ? "bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/20"
                                        : "bg-blue-50 text-blue-700 border-blue-100 hover:bg-blue-100 hover:border-blue-200"
                                    )}
                                  >
                                    <Radio className="w-3 h-3 animate-pulse" />
                                    {expandedTrackerId === train.id ? 'Hide' : 'Track'}
                                  </button>
                              </div>
                          </div>
                      </div>
                  </div>
                  {/* ── Inline Live Tracker (expands inside the card) ── */}
                  <TrainInlineTracker
                    runId={train.runId}
                    trainId={train.trainDbId}
                    isOpen={expandedTrackerId === train.id}
                    onToggle={(e) => {
                      e.stopPropagation();
                      setExpandedTrackerId(prev => prev === train.id ? null : train.id);
                    }}
                  />
                </motion.div>
              ))}
              
              {displayTrains.length === 0 && (
                  <div className="text-center py-20 bg-white/50 border border-dashed border-slate-300 rounded-3xl">
                      <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
                          <TrainIcon className="w-8 h-8 opacity-50" />
                      </div>
                      <h3 className="text-lg font-bold text-slate-600 mb-1">No trains found</h3>
                      <p className="text-slate-400">Try changing your search filters</p>
                  </div>
              )}
            </div>
          </motion.div>
        </div>
      </main>
    </div>
  );
};

export default TrainSelection;
