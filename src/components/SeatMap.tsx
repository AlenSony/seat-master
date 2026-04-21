import { CoachLayout, Seat as SeatType } from '@/data/coachLayouts';
import { cn } from '@/lib/utils';
import { Seat } from './Seat';
import { SeatLegend } from './SeatLegend';

interface SeatMapProps {
  coach: CoachLayout;
  selectedSeats: SeatType[];
  onSeatSelect: (seat: SeatType) => void;
  /** IDs of seats on the recommended side — shown with a green glow */
  recommendedSeatIds?: Set<string>;
  /** IDs of seats whose selection would worsen the imbalance — dimmed */
  blockedSeatIds?: Set<string>;
}

const CompartmentDivider = () => (
  <div className="relative py-3 my-2">
    <div className="absolute inset-0 flex items-center">
      <div className="w-full border-t-2 border-dashed border-border/60" />
    </div>
    <div className="relative flex justify-center">
      <div className="w-3 h-3 rounded-full bg-border" />
    </div>
  </div>
);

const BerthLabel = ({ label, position }: { label: string; position: 'left' | 'right' }) => (
  <span className={cn(
    "seat-berth-label w-8 text-center",
    position === 'left' ? 'text-right pr-1' : 'text-left pl-1'
  )}>
    {label}
  </span>
);

export const SeatMap = ({ coach, selectedSeats, onSeatSelect, recommendedSeatIds, blockedSeatIds }: SeatMapProps) => {
  const isSeatSelected = (seat: SeatType) =>
    selectedSeats.some(s => s.id === seat.id);

  /** Helper to build balance-guidance props for a given seat */
  const guidanceProps = (seat: SeatType) => {
    if (!recommendedSeatIds && !blockedSeatIds) return {};
    const avail = seat.status === 'available' && !isSeatSelected(seat);
    if (!avail) return {};
    return {
      isRecommended:    recommendedSeatIds?.has(seat.id) ?? false,
      isBalanceBlocked: blockedSeatIds?.has(seat.id)     ?? false,
    };
  };
  const renderSleeperLayout = () => {
    const compartmentCount = Math.floor(coach.rows.length / 2);

    return (
      <div className="space-y-3">
        {/* Column headers */}
        <div className="flex items-center gap-2 pb-3 border-b border-border">
          <div className="w-16" />{/* compartment label space */}
          <div className="flex gap-2">
            {['LOWER', 'MIDDLE', 'UPPER'].map(col => (
              <div key={col} className="w-11 h-6 rounded-md bg-amber-50 border border-amber-200 flex items-center justify-center">
                <span className="text-[9px] font-bold text-amber-700">{col}</span>
              </div>
            ))}
          </div>
          <div className="w-8" />
          <div className="w-11 h-6 rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center">
            <span className="text-[9px] font-bold text-slate-500">SIDE</span>
          </div>
        </div>

        {/* Compartments */}
        {Array.from({ length: compartmentCount }).map((_, ci) => {
          const mainRow = coach.rows[ci * 2];
          const sideRow = coach.rows[ci * 2 + 1];
          if (!mainRow) return null;

          const seats = mainRow.seats;
          const row1 = [seats[0], seats[1], seats[2]];
          const row2 = [seats[3], seats[4], seats[5]];
          const sl = sideRow?.seats.find(s => s.type === 'side-lower') ?? sideRow?.seats[0];
          const su = sideRow?.seats.find(s => s.type === 'side-upper') ?? sideRow?.seats[1];

          return (
            <div
              key={ci}
              className="rounded-xl border border-border bg-card shadow-sm overflow-hidden"
            >


              {/* Row 1 — Lower berth row */}
              <div className="flex items-center gap-2 px-3 py-2.5 bg-muted/10">
                <div className="w-10 text-right">
                  <span className="text-[9px] font-semibold text-muted-foreground uppercase">Row {ci * 2 + 1}</span>
                </div>
                <div className="flex gap-2">
                  {row1.map(seat => seat && (
                    <Seat key={seat.id} seat={seat} onSelect={onSeatSelect} isSelected={isSeatSelected(seat)} {...guidanceProps(seat)} />
                  ))}
                </div>
                <div className="w-8 flex items-center justify-center">
                  <div className="w-px h-8 bg-border" />
                </div>
                <div className="w-11">
                  {sl && <Seat key={sl.id} seat={sl} onSelect={onSeatSelect} isSelected={isSeatSelected(sl)} {...guidanceProps(sl)} />}
                </div>
              </div>

              {/* Thin inner divider */}
              <div className="mx-3 border-t border-dashed border-border/50" />

              {/* Row 2 — Upper berth row */}
              <div className="flex items-center gap-2 px-3 py-2.5">
                <div className="w-10 text-right">
                  <span className="text-[9px] font-semibold text-muted-foreground uppercase">Row {ci * 2 + 2}</span>
                </div>
                <div className="flex gap-2">
                  {row2.map(seat => seat && (
                    <Seat key={seat.id} seat={seat} onSelect={onSeatSelect} isSelected={isSeatSelected(seat)} {...guidanceProps(seat)} />
                  ))}
                </div>
                <div className="w-8 flex items-center justify-center">
                  <div className="w-px h-8 bg-border" />
                </div>
                <div className="w-11">
                  {su && <Seat key={su.id} seat={su} onSelect={onSeatSelect} isSelected={isSeatSelected(su)} {...guidanceProps(su)} />}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderACLayout = () => {
    const compartmentCount = Math.floor(coach.rows.length / 2);

    return (
      <div className="space-y-3">
        {/* Column headers */}
        <div className="flex items-center gap-2 pb-3 border-b border-border">
          <div className="w-16" />
          <div className="flex gap-2">
            {['LOWER', 'UPPER'].map(col => (
              <div key={col} className="w-11 h-6 rounded-md bg-blue-50 border border-blue-200 flex items-center justify-center">
                <span className="text-[9px] font-bold text-blue-700">{col}</span>
              </div>
            ))}
          </div>
          <div className="w-8" />
          <div className="w-11 h-6 rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center">
            <span className="text-[9px] font-bold text-slate-500">SIDE</span>
          </div>
        </div>

        {/* Compartments */}
        {Array.from({ length: compartmentCount }).map((_, ci) => {
          const mainRow = coach.rows[ci * 2];
          const sideRow = coach.rows[ci * 2 + 1];
          if (!mainRow) return null;

          const seats = mainRow.seats;
          const row1 = [seats[0], seats[1]];
          const row2 = [seats[2], seats[3]];
          const sl = sideRow?.seats.find(s => s.type === 'side-lower') ?? sideRow?.seats[0];
          const su = sideRow?.seats.find(s => s.type === 'side-upper') ?? sideRow?.seats[1];

          return (
            <div
              key={ci}
              className="rounded-xl border border-border bg-card shadow-sm overflow-hidden"
            >


              {/* Row 1 — Lower berth row */}
              <div className="flex items-center gap-2 px-3 py-2.5 bg-muted/10">
                <div className="w-10 text-right">
                  <span className="text-[9px] font-semibold text-muted-foreground uppercase">Row {ci * 2 + 1}</span>
                </div>
                <div className="flex gap-2">
                  {row1.map(seat => seat && (
                    <Seat key={seat.id} seat={seat} onSelect={onSeatSelect} isSelected={isSeatSelected(seat)} {...guidanceProps(seat)} />
                  ))}
                </div>
                <div className="w-8 flex items-center justify-center">
                  <div className="w-px h-8 bg-border" />
                </div>
                <div className="w-11">
                  {sl && <Seat key={sl.id} seat={sl} onSelect={onSeatSelect} isSelected={isSeatSelected(sl)} {...guidanceProps(sl)} />}
                </div>
              </div>

              <div className="mx-3 border-t border-dashed border-border/50" />

              {/* Row 2 — Upper berth row */}
              <div className="flex items-center gap-2 px-3 py-2.5">
                <div className="w-10 text-right">
                  <span className="text-[9px] font-semibold text-muted-foreground uppercase">Row {ci * 2 + 2}</span>
                </div>
                <div className="flex gap-2">
                  {row2.map(seat => seat && (
                    <Seat key={seat.id} seat={seat} onSelect={onSeatSelect} isSelected={isSeatSelected(seat)} {...guidanceProps(seat)} />
                  ))}
                </div>
                <div className="w-8 flex items-center justify-center">
                  <div className="w-px h-8 bg-border" />
                </div>
                <div className="w-11">
                  {su && <Seat key={su.id} seat={su} onSelect={onSeatSelect} isSelected={isSeatSelected(su)} {...guidanceProps(su)} />}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderChairCarLayout = () => (
    <div className="space-y-2">
      {/* Column headers */}
      <div className="flex items-center gap-2 pb-3 border-b border-border">
        <div className="w-8" />{/* row number space */}
        <div className="flex gap-2">
          {['A', 'B', 'C'].map(col => (
            <div key={col} className="w-11 h-6 rounded-md bg-emerald-50 border border-emerald-200 flex items-center justify-center">
              <span className="text-xs font-bold text-emerald-700">{col}</span>
            </div>
          ))}
        </div>
        <div className="w-10 flex items-center justify-center">
          <div className="px-2 py-1 bg-muted rounded text-[9px] font-medium text-muted-foreground">AISLE</div>
        </div>
        <div className="flex gap-2">
          {['D', 'E'].map(col => (
            <div key={col} className="w-11 h-6 rounded-md bg-emerald-50 border border-emerald-200 flex items-center justify-center">
              <span className="text-xs font-bold text-emerald-700">{col}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Rows */}
      {coach.rows.map((row, idx) => (
        <div
          key={row.rowNumber}
          className={cn(
            "flex items-center gap-2 py-2 px-2 rounded-xl border transition-colors",
            idx % 2 === 0
              ? 'bg-muted/20 border-border/60'
              : 'bg-card border-transparent'
          )}
        >
          {/* Row number badge */}
          <div className="w-6 h-6 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
            <span className="text-[10px] font-bold text-primary">{row.rowNumber}</span>
          </div>

          {/* Left side — 3 seats */}
          <div className="flex gap-2">
            {row.seats.slice(0, 3).map(seat => (
              <Seat
                key={seat.id}
                seat={seat}
                onSelect={onSeatSelect}
                isSelected={isSeatSelected(seat)}
                {...guidanceProps(seat)}
              />
            ))}
          </div>

          {/* Aisle */}
          <div className="w-10 flex items-center justify-center">
            <div className="w-px h-9 bg-gradient-to-b from-transparent via-border to-transparent" />
          </div>

          {/* Right side — 2 seats */}
          <div className="flex gap-2">
            {row.seats.slice(3).map(seat => (
              <Seat
                key={seat.id}
                seat={seat}
                onSelect={onSeatSelect}
                isSelected={isSeatSelected(seat)}
                {...guidanceProps(seat)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  const getCoachIcon = () => {
    const configs = {
      sleeper: { label: 'Sleeper Class', text: 'text-amber-900', bg: 'bg-amber-50 border-amber-200' },
      ac:      { label: 'AC Tier',       text: 'text-blue-900',  bg: 'bg-blue-50 border-blue-200' },
      chair:   { label: 'Chair Car',     text: 'text-emerald-900', bg: 'bg-emerald-50 border-emerald-200' },
    };
    const cfg = configs[coach.type] ?? configs.chair;
    return (
      <div className={`flex items-center px-3 py-1.5 rounded-xl border ${cfg.bg}`}>
        <span className={`text-sm font-bold ${cfg.text}`}>{cfg.label}</span>
      </div>
    );
  };


  return (
    <div className="animate-fade-in">
      <SeatLegend showBalanceGuide={!!(recommendedSeatIds && recommendedSeatIds.size > 0)} />

      <div className="mt-4 rounded-2xl border border-border shadow-md overflow-hidden">
        {/* Coach header bar */}
        <div className="flex items-center justify-between px-5 py-3 bg-gradient-to-r from-muted/80 to-muted/40 border-b border-border">
          {getCoachIcon()}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-medium">
              {coach.totalSeats} seats
            </span>
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-200 rounded-full">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-semibold text-emerald-700">Live</span>
            </div>
          </div>
        </div>

        {/* Seat layout */}
        <div className="p-5 bg-card min-w-fit overflow-x-auto">
          {coach.type === 'sleeper' && renderSleeperLayout()}
          {coach.type === 'ac' && renderACLayout()}
          {coach.type === 'chair' && renderChairCarLayout()}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-2.5 bg-muted/30 border-t border-border text-[11px] text-muted-foreground font-medium">
          <div className="flex items-center gap-1.5">
            <span className="text-base">🚪</span>
            <span>Entry / Exit</span>
          </div>
          <span className="font-semibold text-foreground/60">Coach {coach.name}</span>
          <div className="flex items-center gap-1.5">
            <span>Toilet</span>
            <span className="text-base">🚽</span>
          </div>
        </div>
      </div>
    </div>
  );
};
