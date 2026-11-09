import type { ArenaPoint } from '@thesis-ledger/schemas';
import type { MarketChartBar } from '../market-detail/market-chart-types.js';
import { chartPointKey } from '../market-detail/market-chart-time.js';

export function arenaChartWindow(bars: readonly MarketChartBar[]) {
  const first = bars[0], last = bars.at(-1);
  if (!first?.symbol || !last || !['1d', '5d', '1w', '1mo', '1y'].includes(first.timeframe ?? '')) return null;
  return { symbol: first.symbol, start: first.bucketStartDate ?? chartPointKey(first.timestamp), end: last.bucketEndDate ?? chartPointKey(last.timestamp) };
}

export function placeArenaPricePoints(bars: readonly MarketChartBar[], points: readonly ArenaPoint[]) {
  const window = arenaChartWindow(bars);
  if (!window) return [];
  return points.flatMap((point) => {
    if (point.symbol !== window.symbol) return [];
    const bar = bars.find((candidate) => {
      const key = chartPointKey(candidate.timestamp);
      return (candidate.bucketStartDate ?? key) <= point.day && point.day <= (candidate.bucketEndDate ?? key);
    });
    return bar ? [{ ...point, key: chartPointKey(bar.timestamp) }] : [];
  });
}
