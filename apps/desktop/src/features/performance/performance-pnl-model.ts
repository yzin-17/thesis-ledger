import type { PerformancePnlPoint } from '@thesis-ledger/schemas';
import type { Portfolio } from '../portfolio/portfolio.types.js';

export type PnlChartPoint = Omit<PerformancePnlPoint, 'sourceSnapshotId' | 'reason'> & {
  current: boolean;
  reason: PerformancePnlPoint['reason'] | 'current_unavailable';
};

export const pnlReasonLabels: Record<NonNullable<PnlChartPoint['reason']>, string> = {
  price_unavailable: '行情数据不完整',
  position_unavailable: '历史标的持仓依据不完整',
  scope_unavailable: '历史账户范围不完整',
  realized_unavailable: '已实现盈亏依据不完整',
  fx_unavailable: '历史汇率不完整',
  current_unavailable: '当前盈亏暂不可用',
};

export function portfolioPnlPoints(
  history: PerformancePnlPoint[],
  portfolio: Portfolio,
): PnlChartPoint[] {
  const at = Date.parse(portfolio.valuedAt);
  const points: PnlChartPoint[] = history
    .filter((point) => Date.parse(point.at) < at)
    .map((point) => ({ ...point, current: false }));
  if (!Number.isFinite(at)) return points;
  const value = portfolio.cumulativePnl;
  const available = value !== null && value !== undefined && Number.isFinite(value);
  points.push({
    at: portfolio.valuedAt,
    value: available ? value : null,
    realizedPnl: portfolio.realizedPnl ?? null,
    unrealizedPnl: portfolio.unrealizedPnl ?? null,
    reason: available ? null : 'current_unavailable',
    current: true,
  });
  return points;
}

export function pnlChartGeometry(points: PnlChartPoint[], width: number) {
  const height = 224;
  const padding = { left: 72, right: 16, top: 16, bottom: 30 };
  const values = points.flatMap((point) => (point.value === null ? [] : [point.value]));
  const low = Math.min(0, ...values);
  const high = Math.max(0, ...values);
  const margin = Math.max((high - low) * 0.15, 1);
  const min = low - margin;
  const max = high + margin;
  const times = points.map((point) => Date.parse(point.at));
  const first = times[0] ?? 0;
  const last = times.at(-1) ?? first;
  const y = (value: number) =>
    padding.top + ((max - value) / (max - min)) * (height - padding.top - padding.bottom);
  const coordinates = points.map((point, index) => ({
    x:
      first === last
        ? (width + padding.left - padding.right) / 2
        : padding.left +
          ((times[index]! - first) / (last - first)) * (width - padding.left - padding.right),
    y: point.value === null ? null : y(point.value),
    index,
  }));
  const segments: Array<typeof coordinates> = [];
  let current: typeof coordinates = [];
  for (const coordinate of coordinates) {
    if (coordinate.y === null) {
      if (current.length) segments.push(current);
      current = [];
    } else current.push(coordinate);
  }
  if (current.length) segments.push(current);
  return {
    height,
    padding,
    coordinates,
    segments,
    zeroY: y(0),
    ticks: [min, 0, max].map((value) => ({ value, y: y(value) })),
  };
}
