import { useState } from 'react';
import { InfoIcon } from 'lucide-react';
import type { WatchlistItem, WatchlistPrice } from '@thesis-ledger/schemas';
import { watchlistPriceDisplay } from '@thesis-ledger/domain';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { quoteCadence, type CadenceCatalog } from './watchlist-source-cadence.js';
import { dataSourceDisplay } from '../market-data/market-data.types.js';
import { cn } from '@/lib/utils';

export function WatchlistSource({
  item,
  snap,
  catalog,
  className,
}: {
  item: WatchlistItem;
  snap?: WatchlistPrice | undefined;
  catalog?: CadenceCatalog;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const value = watchlistPriceDisplay(snap?.price, snap?.quoteContext);
  const cadence = quoteCadence(item, snap, catalog);
  const snapshot = snap?.price.kind === 'quote' && snap.quoteContext?.session === 'closed_snapshot';
  let status = value.status;
  const source =
    value.source || (snap?.price.kind === 'nav' ? dataSourceDisplay(snap.price.nav.provider) : '');
  if (snapshot && status === '休市 · 最近时段快照') status = '休市快照';
  return (
    <div className={cn('flex min-w-0 flex-col gap-1 text-xs text-muted-foreground', className)}>
      <div className="flex flex-wrap items-center gap-x-1">
        {source && <span className="text-foreground">{source}</span>}
        <HoverCard open={open} onOpenChange={setOpen}>
          <HoverCardTrigger
            render={<button type="button" />}
            aria-label={`${item.displayName}的来源与检查信息`}
            aria-expanded={open}
            className="inline-flex size-6 items-center justify-center rounded-sm outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-3.5"
            delay={150}
            closeDelay={100}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onClick={() => setOpen(true)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setOpen(false);
                event.stopPropagation();
              }
            }}
          >
            <InfoIcon aria-hidden="true" />
          </HoverCardTrigger>
          <HoverCardContent className="flex w-72 min-w-0 flex-col gap-2 p-3 text-xs" align="end">
            <strong className="text-sm font-medium">来源与检查信息</strong>
            {value.fetched && <span>读取时间 {value.fetched}</span>}
            <span>
              {cadence ? `检查周期：${cadence.label}` : '来源周期待确认，自动报价检查暂停'}
            </span>
            {snap?.minRefreshSeconds && snap.minRefreshSeconds > 60 ? (
              <span>请求间隔至少 {snap.minRefreshSeconds / 60} 分钟</span>
            ) : null}
            <span>后台暂停自动检查</span>
          </HoverCardContent>
        </HoverCard>
      </div>
      {snap && snap.price.kind !== 'unavailable' && (
        <span className="break-words tabular-nums">
          {snap?.price.kind === 'nav' ? '净值 ' : '行情 '}
          {value.time || '时间未知'}
        </span>
      )}
      {status && (
        <span>
          {status}
          {snapshot && ' · 非官方收盘价'}
        </span>
      )}
      {value.refresh && <span>{value.refresh}</span>}
      {!cadence && snap?.price.kind === 'quote' && <span>自动报价检查暂停</span>}
    </div>
  );
}
