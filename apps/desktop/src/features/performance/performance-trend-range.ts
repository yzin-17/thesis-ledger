import type { PerformancePnlRange } from '@thesis-ledger/schemas';
import type { PerformanceSeriesRange } from './performance.types.js';
import type { PnlChartPoint } from './performance-pnl-model.js';

export function pnlQueryRange(range: PerformanceSeriesRange): PerformancePnlRange {
  if (range === '1D' || range === '5D') return '1M';
  if (range === '5Y') return 'ALL';
  return range;
}

export function pnlPointsInRange(
  points: PnlChartPoint[],
  range: PerformanceSeriesRange,
  anchor: string,
): PnlChartPoint[] {
  if (range === 'ALL') return points;
  const cutoff = new Date(anchor);
  if (!Number.isFinite(cutoff.getTime())) return points;
  if (range === 'YTD') {
    cutoff.setMonth(0, 1);
    cutoff.setHours(0, 0, 0, 0);
  } else if (range === '1D' || range === '5D') {
    cutoff.setDate(cutoff.getDate() - (range === '1D' ? 1 : 5));
  } else {
    const months = { '1M': 1, '3M': 3, '1Y': 12, '5Y': 60 }[range];
    cutoff.setMonth(cutoff.getMonth() - months);
  }
  return points.filter((point) => Date.parse(point.at) >= cutoff.getTime());
}
