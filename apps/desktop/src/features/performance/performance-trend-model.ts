import type { PerformanceSeriesPoint } from './performance.types.js';
import type { PnlChartPoint } from './performance-pnl-model.js';

export function performanceTrendGeometry(
  assets: PerformanceSeriesPoint[],
  pnl: PnlChartPoint[],
  width: number,
) {
  const height = 256;
  const padding = { left: 64, right: 64, top: 18, bottom: 30 };
  const times = [...new Set([...assets, ...pnl].map((point) => Date.parse(point.at)))].sort(
    (a, b) => a - b,
  );
  const first = times[0] ?? 0;
  const last = times.at(-1) ?? first;
  const x = (at: string) =>
    first === last
      ? (width + padding.left - padding.right) / 2
      : padding.left +
        ((Date.parse(at) - first) / (last - first)) * (width - padding.left - padding.right);
  const axis = (values: number[], includeZero: boolean) => {
    const low = Math.min(...values, ...(includeZero || !values.length ? [0] : []));
    const high = Math.max(...values, ...(includeZero || !values.length ? [0] : []));
    const margin = Math.max((high - low) * 0.12, 1);
    const min = low - margin;
    const max = high + margin;
    const y = (value: number) =>
      padding.top + ((max - value) / (max - min)) * (height - padding.top - padding.bottom);
    const middle = includeZero ? 0 : (low + high) / 2;
    return { y, ticks: [min, middle, max].map((value) => ({ value, y: y(value) })) };
  };
  const assetAxis = axis(
    assets.map((point) => point.value),
    false,
  );
  const pnlAxis = axis(
    pnl.flatMap((point) => (point.value === null ? [] : [point.value])),
    true,
  );
  const assetCoordinates = assets.map((point) => ({ x: x(point.at), y: assetAxis.y(point.value) }));
  const pnlCoordinates = pnl.map((point) => ({
    x: x(point.at),
    y: point.value === null ? null : pnlAxis.y(point.value),
  }));
  const segments: Array<Array<{ x: number; y: number }>> = [];
  let segment: Array<{ x: number; y: number }> = [];
  for (const point of pnlCoordinates) {
    if (point.y === null) {
      if (segment.length) segments.push(segment);
      segment = [];
    } else segment.push({ x: point.x, y: point.y });
  }
  if (segment.length) segments.push(segment);
  const assetByTime = new Map(assets.map((point) => [Date.parse(point.at), point]));
  const pnlByTime = new Map(pnl.map((point) => [Date.parse(point.at), point]));
  const timeline = times.map((at) => ({
    at: new Date(at).toISOString(),
    x: x(new Date(at).toISOString()),
    asset: assetByTime.get(at),
    pnl: pnlByTime.get(at),
  }));
  return {
    height,
    padding,
    assetAxis,
    pnlAxis,
    assetCoordinates,
    pnlCoordinates,
    segments,
    timeline,
  };
}
