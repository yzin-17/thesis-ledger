import type { WatchlistPrice } from '@thesis-ledger/schemas';
import { formatRatioPercent, watchlistPriceDisplay } from '@thesis-ledger/domain';
export function WatchlistRange({ snap }: { snap?: WatchlistPrice | undefined }) {
  const value = watchlistPriceDisplay(snap?.price, snap?.quoteContext);
  const q = snap?.price.kind === 'quote' ? snap.price.quote : undefined;
  const valid = q && q.low != null && q.high != null && q.low <= q.price && q.price <= q.high;
  let amplitude = '—';
  if (valid && q.previousClose != null && q.previousClose > 0)
    amplitude = formatRatioPercent((q.high - q.low) / q.previousClose);
  if (!valid)
    return (
      <span className="text-xs text-muted-foreground">
        {snap?.price.kind === 'nav' ? '净值无分时数据' : '暂无日内区间'}
      </span>
    );
  return (
    <div className="flex flex-col gap-1 text-xs tabular-nums">
      <span className="flex flex-wrap justify-between gap-x-2 text-muted-foreground">
        <span>
          低 <span className="inline text-foreground">{value.low}</span>
        </span>
        <span>
          高 <span className="inline text-foreground">{value.high}</span>
        </span>
      </span>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
        <span>
          今开 <span className="inline text-foreground">{value.open}</span>
        </span>
        <span>
          前收 <span className="inline text-foreground">{value.previousClose}</span>
        </span>
        <span>振幅 {amplitude}</span>
      </div>
    </div>
  );
}
