import { marketToneForValue } from '@/ui/market-color';
import { DetailMetric } from './MarketDetailSections.js';
import type { MarketDetailPosition } from './market-detail.types.js';

const money = new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' });
const number = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 4 });

export function MarketDetailPositionContext({ position, unit }: { position: MarketDetailPosition; unit: string }) {
  if (position.quantity === undefined || position.costPrice === undefined) return null;
  const positionPnlTone = marketToneForValue(position.pnl ?? null);
  return (
    <div className="grid grid-cols-2 gap-x-4 border-t pt-2 sm:grid-cols-3" data-market-detail-position-context>
      <DetailMetric label="持仓数量" value={`${number.format(position.quantity)} ${unit}`} />
      <DetailMetric label="持仓成本" value={money.format(position.costPrice)} />
      <DetailMetric label="持仓盈亏" value={position.pnl == null ? '—' : money.format(position.pnl)}
        {...(positionPnlTone ? { tone: positionPnlTone } : {})} />
    </div>
  );
}
