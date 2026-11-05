import type { FundValuationToday } from '@thesis-ledger/api-client';

export function fundIntradaySegments(points: FundValuationToday['points']) {
  const segments: Array<Array<{ time: number; value: number }>> = [];
  let segment: Array<{ time: number; value: number }> = [];
  let anchor: string | undefined;
  for (const point of points) {
    const value = point.valuation.estimatedNav;
    const time = Date.parse(point.at) / 1000;
    const nextAnchor = point.valuation.anchor?.navDate;
    const previous = segment.at(-1);
    if (value === null || previous && (time - previous.time > 60 || anchor !== nextAnchor)) {
      if (segment.length) segments.push(segment);
      segment = [];
    }
    if (value !== null) segment.push({ time, value });
    anchor = nextAnchor;
  }
  if (segment.length) segments.push(segment);
  return segments;
}
