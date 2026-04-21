const LEGEND_ITEMS = [
  {
    cls: 'seat-available',
    label: 'Available',
  },
  {
    cls: 'seat-selected',
    label: 'Selected',
  },
  {
    cls: 'seat-booked',
    label: 'Booked',
  },
  {
    cls: 'seat-locked',
    label: 'Locked',
  },
];

interface SeatLegendProps {
  /** When true, shows the balance-guidance legend entries */
  showBalanceGuide?: boolean;
}

export const SeatLegend = ({ showBalanceGuide }: SeatLegendProps) => (
  <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-muted/40 rounded-xl border border-border/40 backdrop-blur-sm">
    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mr-1">Legend</span>
    {LEGEND_ITEMS.map(({ cls, label }) => (
      <div key={label} className="flex items-center gap-2">
        <div className={`${cls} !w-6 !h-6 !text-[8px] !rounded-md !shadow-none pointer-events-none select-none`}>
          <span className="opacity-0">0</span>
        </div>
        <span className="text-xs font-medium text-foreground/80">{label}</span>
      </div>
    ))}
    {showBalanceGuide && (
      <>
        {/* Recommended swatch — green glow ring */}
        <div className="flex items-center gap-2">
          <div
            className="seat-available !w-6 !h-6 !text-[8px] !rounded-md !shadow-none pointer-events-none select-none"
            style={{ boxShadow: '0 0 0 2px #10b981, 0 0 8px 1px rgba(16,185,129,0.4)' }}
          >
            <span className="opacity-0">0</span>
          </div>
          <span className="text-xs font-medium text-emerald-500">Recommended</span>
        </div>
        {/* Blocked swatch — dimmed amber */}
        <div className="flex items-center gap-2">
          <div
            className="seat-available !w-6 !h-6 !text-[8px] !rounded-md !shadow-none pointer-events-none select-none"
            style={{ opacity: 0.4, filter: 'sepia(0.6) brightness(0.85)' }}
          >
            <span className="opacity-0">0</span>
          </div>
          <span className="text-xs font-medium text-amber-500">Causes Imbalance</span>
        </div>
      </>
    )}
  </div>
);

