import type { BacktestSeries, BacktestSeriesPoint } from './backtest-series.js';

export function expressionSourceIds(input: unknown): readonly string[] {
  const sources = new Set<string>();
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const node = value as Record<string, unknown>;
    if (node.type === 'series' && typeof node.sourceId === 'string') sources.add(node.sourceId);
    Object.values(node).forEach(visit);
  };
  visit(input);
  return [...sources];
}

export function expressionCumulativeAnchor(input: unknown): string | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const node = input as Record<string, unknown>;
  const anchors = Object.values(node).flatMap((value) => {
    const anchor = expressionCumulativeAnchor(value);
    return anchor ? [anchor] : [];
  });
  if (node.type === 'cumulative' && typeof node.anchorAt === 'string') anchors.push(node.anchorAt);
  return anchors.sort((a, b) => Date.parse(a) - Date.parse(b))[0];
}

/** 严格读取最近观测本身，不能略过 unavailable 或尚不可见的点。 */
export function latestExpressionObservation(
  series: BacktestSeries,
  at: string,
): BacktestSeriesPoint | undefined {
  return [...series.points]
    .filter((point) => Date.parse(point.occurredAt) <= Date.parse(at))
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))[0];
}
