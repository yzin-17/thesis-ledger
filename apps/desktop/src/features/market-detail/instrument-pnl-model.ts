import type { PerformancePnlPoint } from '@thesis-ledger/schemas';
import type { PnlChartPoint } from '../performance/performance-pnl-model.js';

export function instrumentPnlPoints(
  history: PerformancePnlPoint[],
  at: string,
  unrealized: number | null | undefined,
  realized: number | null | undefined,
): PnlChartPoint[] {
  const points: PnlChartPoint[] = history
    .filter((point) => Date.parse(point.at) < Date.parse(at))
    .map((point) => ({ ...point, current: false }));
  const available =
    typeof unrealized === 'number' &&
    Number.isFinite(unrealized) &&
    typeof realized === 'number' &&
    Number.isFinite(realized);
  let reason: PnlChartPoint['reason'] = null;
  if (typeof unrealized !== 'number' || !Number.isFinite(unrealized))
    reason = 'current_unavailable';
  else if (!available) reason = 'realized_unavailable';
  points.push({
    at,
    value: available ? Number((unrealized + realized).toFixed(4)) : null,
    unrealizedPnl: unrealized ?? null,
    realizedPnl: realized ?? null,
    reason,
    current: true,
  });
  return points;
}
