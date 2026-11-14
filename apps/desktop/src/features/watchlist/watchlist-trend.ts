import type { MarketDisplayDetailResponse } from '@thesis-ledger/api-client';
import type { FundNavHistory } from '@thesis-ledger/schemas';
export type TrendPoint = { at: string; value: number };
export type TrendCandle = { at: string; open: number; high: number; low: number; close: number };
export type WatchlistTrend = {
  points: TrendPoint[];
  candles?: TrendCandle[];
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
  let label = '日线 · 前复权';
  if (fund) label = '近20期净值';
  else if (minute) label = '分时 · 1分钟';
  const section = detail.sections[fund ? 'fund-nav-history' : 'bars'];
  const base = { label, points: [] };
  if (!section || !['ready', 'stale'].includes(section.status))
    return { ...base, notice: section?.error?.message ?? '当前来源暂无可用走势' };
  let points: TrendPoint[];
  let source: string | undefined;
  let upstreamSource: string | undefined;
  let candles: TrendCandle[] | undefined;
  if (fund) {
    const history = section.data as FundNavHistory;
    source = history.at(-1)?.provider;
    points = history.slice(-20).map((p) => ({ at: p.navDate, value: p.unitNav }));
  } else {
    const market = marketTrendSeries(detail, minute);
    if (!market) return { ...base, notice: '当前来源暂无可用走势' };
    ({ source, upstreamSource, points, candles } = market);
  }
  return {
    label,
    points,
    ...(candles ? { candles } : {}),
    ...(source ? { source } : {}),
    ...(upstreamSource ? { upstreamSource } : {}),
    ...(points.at(-1) ? { cutoff: points.at(-1)!.at } : {}),
    ...(section.status === 'stale' ? { notice: '走势为缓存数据，请核对截止时间' } : {}),
  };
}

function marketTrendSeries(detail: MarketDisplayDetailResponse, minute: boolean) {
  let upstreamSource: string | undefined;
  let candles: TrendCandle[] | undefined;
  const series = detail.barSeries;
  if (!series) return null;
  const source =
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
  const points = bars.slice(minute ? -400 : -20).map((p) => ({ at: p.timestamp, value: p.close }));
  if (!minute) {
    candles = bars.slice(-20).map((p) => ({
      at: p.timestamp,
      open: p.open,
      high: p.high,
      low: p.low,
      close: p.close,
    }));
  }
  return { source, upstreamSource, points, candles };
}
