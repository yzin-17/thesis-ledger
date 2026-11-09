import { formatMarketNumber, formatPercentValue } from '@thesis-ledger/domain';
import type { FundValuationToday } from '@thesis-ledger/schemas';
const clock = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit' });

export function FundIntradayReadout({ points, selectedTime, locked }: {
  points: FundValuationToday['points'] | undefined;
  selectedTime: number | null;
  locked: boolean;
}) {
  const selected = selectedTime === null ? points?.at(-1) : points?.find((point) => Date.parse(point.at) / 1000 === selectedTime);
  const current = selected?.valuation;
  let quality = '';
  if (current?.quality === 'low_coverage') quality = '低覆盖';
  else if (current?.quality === 'partial') quality = '部分覆盖';
  else if (current?.quality === 'unavailable') quality = '估值不可用';
  return (
      <div className="grid min-w-0 gap-1 text-xs text-muted-foreground" data-market-nav-readout role="status">
        <span className="min-w-0 overflow-x-auto whitespace-nowrap tabular-nums">
          盘中估值 {formatMarketNumber(current?.estimatedNav, 'valuation')}
          {current?.changePercent == null ? '' : ` · ${formatPercentValue(current.changePercent, 'always')}`}
        </span>
        <span className="min-w-0 overflow-x-auto whitespace-nowrap tabular-nums">
          {selected ? clock.format(new Date(selected.at)) : '—'}{!locked ? '' : ' · 已锁定'}{quality ? ` · ${quality}` : ''}
        </span>
      </div>
  );
}
