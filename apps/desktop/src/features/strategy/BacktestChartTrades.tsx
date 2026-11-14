import { formatDecimalNumber } from '@thesis-ledger/domain';
import { formatDateTimeInTimeZone } from '@/lib/date-display';
import { marketToneClass } from '@/ui/market-color';
import type { BacktestTradeMarker } from './backtest-trade-markers.model.js';
import { Switch, SwitchThumb } from '@/components/ui/switch';

export function BacktestTradeVisibility({ markers, checked, onCheckedChange }: {
  markers: BacktestTradeMarker[];
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return <span className="inline-flex items-center gap-2 text-xs text-foreground">
    <Switch variant="risk" aria-label="显示买卖点" checked={checked} onCheckedChange={onCheckedChange} disabled={!markers.length}>
      <SwitchThumb variant="risk" aria-hidden="true" />
    </Switch>
    <span>显示买卖点</span>
  </span>;
}

export function BacktestChartTradeReadout({ groups, timezone, currency, research }: {
  groups: BacktestTradeMarker[];
  timezone: string;
  currency: string | null;
  research: boolean;
}) {
  const fills = groups.flatMap((group) => group.fills).sort((a, b) => a.time - b.time);
  if (!fills.length) return null;
  return (
    <div className="mt-2 flex flex-col gap-2 border-t pt-2">
      {fills.slice(0, 3).map((fill, index) => (
        <div key={`${fill.id}:${index}`} className="break-words">
          <p className="flex flex-wrap gap-x-2">
            <span className={marketToneClass(fill.side === 'buy' ? 'up' : 'down')}>
              {fill.side === 'buy' ? '模拟买入' : '模拟卖出'} · {fill.symbol}
            </span>
            <span>{formatDateTimeInTimeZone(fill.occurredAt, timezone)}</span>
          </p>
          <p>{research ? '研究单位' : '数量'} {formatDecimalNumber(fill.quantity)} · {research ? '后复权价' : '成交价'} {formatDecimalNumber(fill.price)} {currency}</p>
        </div>
      ))}
      {fills.length > 3 && <p>其余 {fills.length - 3} 笔见“交易与订单”。</p>}
    </div>
  );
}
