import type { TrendPoint } from './watchlist-trend.js';

import type { MarketPeriodSession } from '@thesis-ledger/domain';

/** 只压缩日历证明的同日时段间隔；其他行情缺口保持真实时间。 */
function sessionBreak(points: TrendPoint[], sessions: readonly MarketPeriodSession[]) {
  const windows = [...sessions].sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
  for (let i = 1; i < windows.length; i++) {
    const left = windows[i - 1]!, right = windows[i]!;
    if (left.tradingDate !== right.tradingDate || Date.parse(left.endAt) >= Date.parse(right.startAt)) continue;
    const index = points.findIndex((point, j) => j > 0 &&
      Date.parse(points[j - 1]!.at) >= Date.parse(left.startAt) && Date.parse(points[j - 1]!.at) <= Date.parse(left.endAt) &&
      Date.parse(point.at) >= Date.parse(right.startAt) && Date.parse(point.at) <= Date.parse(right.endAt));
    if (index > 0) return { index, start: Date.parse(left.endAt), duration: Date.parse(right.startAt) - Date.parse(left.endAt) };
  }
  return undefined;
}

export function watchlistTrendGeometry(points: TrendPoint[], minute: boolean, sessions: readonly MarketPeriodSession[] = []) {
  if (points.length < 2) return { paths: [], dividers: [] };
  const lunch = minute ? sessionBreak(points, sessions) : undefined;
  const times = points.map((point, index) => Date.parse(point.at) -
    (lunch && index >= lunch.index ? lunch.duration : 0));
  const first = times[0]!, span = times.at(-1)! - first;
  const width = lunch ? 148 : 152;
  const xAt = (time: number) => span > 0 ? 4 + ((time - first) / span) * width : 4;
  const values = points.map((point) => point.value);
  const low = Math.min(...values), high = Math.max(...values);
  const paths: string[] = [];
  let path = '';
  points.forEach((point, index) => {
    let x = 4 + (index / (points.length - 1)) * 152;
    if (minute && span > 0) x = xAt(times[index]!) + (lunch && index >= lunch.index ? 4 : 0);
    const y = high === low ? 22 : 40 - ((point.value - low) / (high - low)) * 36;
    if (index && minute && Date.parse(point.at) - Date.parse(points[index - 1]!.at) > 60_000) {
      if (path) paths.push(path);
      path = '';
    }
    path += `${path ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)} `;
  });
  if (path) paths.push(path);
  return { paths, dividers: lunch ? [span > 0 ? xAt(lunch.start) + 2 : 80] : [] };
}
