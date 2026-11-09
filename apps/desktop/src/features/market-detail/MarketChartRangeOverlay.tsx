import type { ChartRange } from './chart-date-range.js';
import { visibleBarsForRange } from './market-chart-range.js';
import type { MarketChartBar } from './market-chart-types.js';

export function MarketChartRangeOverlay({ bars, range, loading }: {
  bars: MarketChartBar[];
  range: ChartRange;
  loading?: boolean | undefined;
}) {
  if (!bars.length || visibleBarsForRange(bars, range).length > 0) return null;
  if (loading) return null;
  return <p className="pointer-events-none absolute inset-0 m-0 flex items-center justify-center bg-background/95 text-sm text-muted-foreground" role="status">
    所选区间暂无行情数据。
  </p>;
}
