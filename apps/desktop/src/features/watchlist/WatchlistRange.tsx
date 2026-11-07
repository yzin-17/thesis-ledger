import type { WatchlistPrice } from '@thesis-ledger/schemas';
import { formatRatioPercent, watchlistPriceDisplay } from '@thesis-ledger/domain';
export function WatchlistRange({ snap }: { snap?: WatchlistPrice | undefined }) {
  const value = watchlistPriceDisplay(snap?.price, snap?.quoteContext);
  const q = snap?.price.kind === 'quote' ? snap.price.quote : undefined;
  const valid = q && q.low != null && q.high != null && q.low <= q.price && q.price <= q.high;
  let amplitude = '—';
  if (valid && q.previousClose != null && q.previousClose > 0)
    amplitude = formatRatioPercent((q.high - q.low) / q.previousClose);
  return (
    <div className="flex flex-col gap-1 text-xs tabular-nums">
      <span className="flex justify-between gap-2">
        <span>{value.low}</span>
        <span>{value.high}</span>
      </span>
      {valid && (
        <svg
          viewBox="0 0 100 10"
          className="h-2 w-full text-foreground"
          role="img"
          aria-label={`日内最低${value.low}，最高${value.high}，当前${value.value}`}
        >
          <line x1="3" x2="97" y1="5" y2="5" stroke="currentColor" opacity="0.2" strokeWidth="3" />
          <circle
            cx={q.high === q.low ? 50 : 3 + ((q.price - q.low) / (q.high - q.low)) * 94}
            cy="5"
            r="3"
            fill="currentColor"
          />
        </svg>
      )}
      <span className="text-muted-foreground">振幅 {amplitude}</span>
      <span className="text-muted-foreground">
        今开 {value.open} · 前收 {value.previousClose}
      </span>
    </div>
  );
}
