import type { Time } from 'lightweight-charts';
import type { MarketChartBar } from './market-chart-types.js';
import type { ChartPoint } from './market-chart-model.js';
import { toChartTime } from './market-chart-time.js';

export const rangeMonths = (range: number): number | null => {
  if (range === 30) return 1;
  if (range === 90) return 3;
  if (range === 180) return 6;
  if (range === 365) return 12;
  return null;
};

export const visibleBarsForRange = (bars: MarketChartBar[], range: number) => {
  const latest = bars.at(-1);
  if (!latest) return [];
  if (latest.timeframe === '1m') return range > 0 ? bars.slice(-range) : bars;
  const months = rangeMonths(range);
  if (months === null) return bars;
  const cutoffDate = new Date(latest.timestamp);
  cutoffDate.setUTCMonth(cutoffDate.getUTCMonth() - months);
  const cutoff = cutoffDate.getTime();
  return bars.filter((bar) => Date.parse(bar.timestamp) >= cutoff);
};

export const rangeCoverage = (bars: MarketChartBar[], range: number) => {
  const months = rangeMonths(range);
  const earliest = bars[0];
  const latest = bars.at(-1);
  if (months === null || !earliest || !latest) return null;
  if (latest.timeframe === '1m') return { available: bars.length >= range,
    earliest: earliest.timestamp, latest: latest.timestamp, months };
  const cutoffDate = new Date(latest.timestamp);
  cutoffDate.setUTCMonth(cutoffDate.getUTCMonth() - months);
  return {
    available: Date.parse(earliest.timestamp) <= cutoffDate.getTime(),
    earliest: earliest.timestamp.slice(0, 10),
    latest: latest.timestamp.slice(0, 10),
    months,
  };
};

export function chartRangeLabel(range: number, timeframe?: string) {
  if (range === 0) return '全部已加载';
  if (timeframe === '1m') return `最近${range}根`;
  if (range === 30) return '1月';
  if (range === 90) return '3月';
  if (range === 180) return '6月';
  return '1年';
}

export function initialChartTimeRange(points: readonly ChartPoint[], range: number): { from: Time; to: Time } | null {
  const latest = points.at(-1);
  if (!latest) return null;
  if (latest.bar?.timeframe === '1m' || latest.date.length > 10) {
    const first = points[range > 0 ? Math.max(0, points.length - range) : 0];
    return first ? { from: toChartTime(first.date), to: toChartTime(latest.date) } : null;
  }
  const months = rangeMonths(range);
  if (months === null) {
    const first = points[0];
    return first ? { from: first.date, to: latest.date } : null;
  }
  const cutoff = new Date(`${latest.date}T00:00:00Z`);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
  return { from: cutoff.toISOString().slice(0, 10), to: latest.date };
}
