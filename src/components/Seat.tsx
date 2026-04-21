import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { Seat as SeatType, SeatType as SeatTypeEnum } from '@/data/coachLayouts';
import { cn } from '@/lib/utils';

interface SeatProps {
  seat: SeatType;
  onSelect: (seat: SeatType) => void;
  isSelected: boolean;
  /** Seat is on the recommended (lighter) side — glows green */
  isRecommended?: boolean;
  /** Selecting this seat would worsen imbalance — dimmed with amber tint */
  isBalanceBlocked?: boolean;
}

const seatTypeLabels: Record<SeatTypeEnum, string> = {
  'lower': 'Lower Berth',
  'middle': 'Middle Berth',
  'upper': 'Upper Berth',
  'side-lower': 'Side Lower',
  'side-upper': 'Side Upper',
  'window': 'Window Seat',
  'aisle': 'Aisle Seat',
  'middle-seat': 'Middle Seat',
};

export const Seat = ({ seat, onSelect, isSelected, isRecommended, isBalanceBlocked }: SeatProps) => {
  const isAvailable = seat.status === 'available';

  const getStatusClass = (): string => {
    if (isSelected) return 'seat-selected';
    switch (seat.status) {
      case 'available': return 'seat-available';
      case 'booked':   return 'seat-booked';
      case 'locked':   return 'seat-locked';
      default:         return 'seat-available';
    }
  };

  const handleClick = () => {
    if (isAvailable || isSelected) onSelect(seat);
  };

  const isClickable = isAvailable || isSelected;

  // ── Overlay style for balance guidance ────────────────────────────────────
  // Recommended: subtle teal glow ring + brightened appearance
  // Blocked:     amber tint + reduced opacity (still clickable — SeatBooking guards it)
  const overlayStyle: React.CSSProperties = (() => {
    if (isSelected || !isAvailable) return {};
    if (isRecommended) return {
      boxShadow: '0 0 0 2px #10b981, 0 0 10px 2px rgba(16,185,129,0.35)',
      filter: 'brightness(1.08)',
    };
    if (isBalanceBlocked) return {
      opacity: 0.45,
      filter: 'sepia(0.6) brightness(0.85)',
    };
    return {};
  })();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={handleClick}
          disabled={!isClickable}
          style={overlayStyle}
          className={cn(
            'seat-base',
            getStatusClass(),
            !isClickable && 'cursor-not-allowed',
            // Extra transition so the glow animates in smoothly
            'transition-all duration-200'
          )}
          aria-label={`Seat ${seat.number} - ${seatTypeLabels[seat.type]} - ${seat.status}${isRecommended ? ' (Recommended)' : ''}${isBalanceBlocked ? ' (Causes Imbalance)' : ''}`}
        >
          {seat.number}
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        className="z-50 overflow-hidden rounded-xl border bg-popover px-3 py-2 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2"
      >
        <div className="grid gap-1 text-center">
          <div className="text-sm font-bold">Seat {seat.number}</div>
          <div className="text-xs text-muted-foreground">{seatTypeLabels[seat.type]}</div>
          {seat.price > 0 ? (
            <div className="font-mono text-sm font-bold text-emerald-600">₹{seat.price}</div>
          ) : (
            <div className="text-xs text-muted-foreground animate-pulse">Updating fare...</div>
          )}
          {/* Balance guidance badge */}
          {isRecommended && !isSelected && (
            <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-500 mt-0.5">
              ✦ Recommended
            </div>
          )}
          {isBalanceBlocked && !isSelected && (
            <div className="text-[10px] font-bold uppercase tracking-wider text-amber-500 mt-0.5">
              ⚠ Causes Imbalance
            </div>
          )}
          <div className={cn(
            "text-[10px] font-bold uppercase tracking-wider mt-1",
            seat.status === 'available' ? 'text-emerald-500' :
            seat.status === 'booked'    ? 'text-rose-500'    :
            seat.status === 'locked'    ? 'text-amber-500'   : 'text-slate-500'
          )}>
            {isSelected ? 'Selected' : seat.status}
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
};
