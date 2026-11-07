import { formatMarketNumber, formatRatioPercent } from '@thesis-ledger/domain';
import type { Currency, FundNavHistory } from '@thesis-ledger/schemas';


export function MarketNavChartReadout({
  selectedDate,
  locked,
  selected,
  viewportChange,
  pnl,
}: {
  selectedDate: string | null;
  locked: boolean;
  selected: FundNavHistory[number] | undefined;
  viewportChange: number | null;
  pnl?: { currency: Currency; value: number | null; date: string | undefined } | undefined;
}) {
  const money = new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: pnl?.currency ?? 'CNY',
  });
  let interaction = `最新 ${selected?.navDate ?? '—'}`;
  if (selectedDate) interaction = `${locked ? '已锁定' : '悬停'} ${selectedDate}`;

  return (
    <div
      className="grid min-w-0 gap-2 text-xs text-muted-foreground"
      data-market-nav-readout
      role="status"
    >
      <div className="grid min-w-0 gap-2 sm:grid-cols-2">
        <div className="grid min-w-0 gap-1">
          <span className="min-w-0 overflow-x-auto whitespace-nowrap tabular-nums">
            单位净值 {formatMarketNumber(selected?.unitNav)}
          </span>
          <span className="min-w-0 overflow-x-auto whitespace-nowrap tabular-nums">
            {interaction}
          </span>
        </div>
        {pnl ? (
          <div className="grid min-w-0 gap-1 sm:text-right">
            <span className="min-w-0 overflow-x-auto whitespace-nowrap tabular-nums">
              累计盈亏 {pnl.value === null ? '—' : money.format(pnl.value)}
            </span>
            <span className="min-w-0 overflow-x-auto whitespace-nowrap tabular-nums">
              {selectedDate ?? pnl.date ?? '—'}
            </span>
          </div>
        ) : null}
      </div>
      <span className="min-w-0 overflow-x-auto whitespace-nowrap tabular-nums">
        可视区间涨跌幅 {formatRatioPercent(viewportChange, 'always')}
      </span>
    </div>
  );
}
