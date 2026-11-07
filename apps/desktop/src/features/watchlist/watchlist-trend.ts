import type { MarketDisplayDetailResponse } from '@thesis-ledger/api-client';
import type { FundNavHistory } from '@thesis-ledger/schemas';
export type TrendPoint = { at: string; value: number };
export type WatchlistTrend = {
  points: TrendPoint[];
  label: string;
  cutoff?: string;
  source?: string;
  upstreamSource?: string;
  notice?: string;
};
export function watchlistTrend(
  detail: MarketDisplayDetailResponse,
  fund: boolean,
  minute: boolean,
): WatchlistTrend {
  let label = '近20交易日 · 前复权';
  if (fund) label = '近20期净值';
  else if (minute) label = '分时 · 1分钟';
  const section = detail.sections[fund ? 'fund-nav-history' : 'bars'];
  const base = { label, points: [] };
  if (!section || !['ready', 'stale'].includes(section.status))
    return { ...base, notice: section?.error?.message ?? '当前来源暂无可用走势' };
  let points: TrendPoint[];
  let source: string | undefined;
  let upstreamSource: string | undefined;
  if (fund) {
    const history = section.data as FundNavHistory;
    source = history.at(-1)?.provider;
    points = history.slice(-20).map((p) => ({ at: p.navDate, value: p.unitNav }));
  } else {
    const series = detail.barSeries;
    if (!series) return { ...base, notice: '当前来源暂无可用走势' };
    source =
      'providerId' in series.provenance ? series.provenance.providerId : series.provenance.provider;
    if ('upstreamSource' in series.provenance) upstreamSource = series.provenance.upstreamSource;
    let bars = series.points;
    if (minute && bars.length) {
      // Derive the civil trading date in the instrument's market, never browser time.
      let timeZone = 'Asia/Shanghai';
      if (detail.symbol.endsWith('.HK')) timeZone = 'Asia/Hong_Kong';
      else if (detail.symbol.endsWith('.US')) timeZone = 'America/New_York';
      const day = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      const lastDay = day.format(new Date(bars.at(-1)!.timestamp));
      bars = bars.filter((p) => day.format(new Date(p.timestamp)) === lastDay);
    }
    points = bars.slice(minute ? -400 : -20).map((p) => ({ at: p.timestamp, value: p.close }));
  }
  return {
    label,
    points,
    ...(source ? { source } : {}),
    ...(upstreamSource ? { upstreamSource } : {}),
    ...(points.at(-1) ? { cutoff: points.at(-1)!.at } : {}),
    ...(section.status === 'stale' ? { notice: '走势为缓存数据，请核对截止时间' } : {}),
  };
}
/** Preserve elapsed time and break missing minutes/lunch gaps; no invented intermediate ticks. */
export function trendPaths(points: TrendPoint[], minute: boolean): string[] {
  if (points.length < 2) return [];
  const values = points.map((p) => p.value);
  const low = Math.min(...values),
    high = Math.max(...values);
  const first = Date.parse(points[0]!.at),
    last = Date.parse(points.at(-1)!.at);
  const paths: string[] = [];
  let path = '';
  points.forEach((point, i) => {
    const x =
      minute && last > first
        ? 4 + ((Date.parse(point.at) - first) / (last - first)) * 152
        : 4 + (i / (points.length - 1)) * 152;
    const y = high === low ? 22 : 40 - ((point.value - low) / (high - low)) * 36;
    if (i && minute && Date.parse(point.at) - Date.parse(points[i - 1]!.at) > 60_000) {
      if (path) paths.push(path);
      path = '';
    }
    path += `${path ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)} `;
  });
  if (path) paths.push(path);
  return paths;
}
