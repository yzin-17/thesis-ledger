import type { Time } from 'lightweight-charts';
import type { MarketChartBar } from './market-chart-types.js';
import type { ChartPoint } from './market-chart-model.js';
import { toChartTime } from './market-chart-time.js';
import { isMarketMinuteTimeframe } from '@thesis-ledger/schemas';
import { chartDateInterval, chartMarketDate, type ChartRange } from './chart-date-range.js';
export { chartRangeLabel, type ChartRange } from './chart-date-range.js';

export const rangeMonths = (range: number): number | null => {
  if (range === 30) return 1;
  if (range === 90) return 3;
  if (range === 180) return 6;
  if (range === 365) return 12;
  return null;
};

export const chartBarDate = (bar: MarketChartBar) =>
  isMarketMinuteTimeframe(bar.timeframe) ? bar.tradingDate ?? chartMarketDate(bar.timestamp, bar.symbol) : bar.timestamp.slice(0, 10);

export const visibleBarsForRange = (bars: MarketChartBar[], range: ChartRange) => {
  const latest = bars.at(-1);
  if (!latest) return [];
  const interval = chartDateInterval(range, chartBarDate(latest));
  if (interval) return bars.filter((bar) => {
    const date = chartBarDate(bar);
    return interval.from <= date && date <= interval.to;
  });
  if (isMarketMinuteTimeframe(latest.timeframe) && typeof range === 'number' && range > 0) return bars.slice(-range);
  return bars;
};

export const rangeCoverage = (bars: MarketChartBar[], range: ChartRange) => {
  const earliest = bars[0], latest = bars.at(-1);
  if (!earliest || !latest) return null;
  const requested = chartDateInterval(range, chartBarDate(latest));
  if (!requested) return null;
  return {
    available: chartBarDate(earliest) <= requested.from && chartBarDate(latest) >= requested.to,
    earliest: chartBarDate(earliest), latest: chartBarDate(latest), requested,
    months: typeof range === 'number' ? rangeMonths(range) : null,
  };
};

export type ChartViewportPoint = Pick<ChartPoint, 'date' | 'bar'>;

export function initialChartTimeRange(points: readonly ChartViewportPoint[], range: ChartRange): { from: Time; to: Time } | null {
  const latest = points.at(-1);
  if (!latest) return null;
  const interval = chartDateInterval(range, latest.bar ? chartBarDate(latest.bar) : latest.date.slice(0, 10));
  if (isMarketMinuteTimeframe(latest.bar?.timeframe) || latest.date.length > 10) {
    if (interval) {
      const visible = points.filter((point) => {
        const date = point.bar ? chartBarDate(point.bar) : chartMarketDate(point.date, latest.bar?.symbol);
        return interval.from <= date && date <= interval.to;
      });
      const first = visible[0], last = visible.at(-1);
      return first && last ? { from: toChartTime(first.date), to: toChartTime(last.date) } : null;
    }
    const first = points[typeof range === 'number' && range > 0 ? Math.max(0, points.length - range) : 0];
    return first ? { from: toChartTime(first.date), to: toChartTime(latest.date) } : null;
  }
  if (interval) {
    if (!points.some((point) => interval.from <= point.date.slice(0, 10) && point.date.slice(0, 10) <= interval.to)) return null;
    return interval;
  }
  const first = points[0];
  return first ? { from: first.date, to: latest.date } : null;
}
