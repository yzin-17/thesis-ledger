export type ChartMeasurement = {
  from: string;
  to: string;
  fromPrice: number;
  toPrice: number;
  difference: number;
  percent: number | null;
  count: number;
};

export function chartMeasurementActive(selection: { measuring: boolean; from: string | null }) {
  return selection.measuring || selection.from !== null;
}

export function measureChartValues(
  points: readonly { key: string; value: number }[],
  from: string | null,
  to: string | null,
): ChartMeasurement | undefined {
  const first = points.findIndex((point) => point.key === from);
  const last = points.findIndex((point) => point.key === to);
  if (first < 0 || last < 0) return undefined;
  const start = points[first]!, end = points[last]!;
  if (!Number.isFinite(start.value) || !Number.isFinite(end.value)) return undefined;
  return {
    from: start.key, to: end.key, fromPrice: start.value, toPrice: end.value,
    difference: end.value - start.value,
    percent: start.value > 0 ? (end.value / start.value - 1) * 100 : null,
    count: Math.abs(last - first) + 1,
  };
}
