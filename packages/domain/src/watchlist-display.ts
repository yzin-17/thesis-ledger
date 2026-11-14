import { formatMarketNumber } from './market-number-display.js';
import { formatRatioPercent } from './ratio-percent.js';

/** 列表只显示来源提供的价格与日期。原始场外单位净值没有币种证明。 */
type Price =
  | {
      kind: 'quote';
      quote: {
        price: number;
        open?: number | undefined;
        high?: number | undefined;
        low?: number | undefined;
        provider?: string | undefined;
        fetchedAt?: string | undefined;
        refreshFailure?: string | undefined;
        previousClose: number;
        marketTime: string | null;
        stale: boolean;
        units?: { priceCurrency: string } | undefined;
      };
    }
  | { kind: 'nav'; nav: { unitNav: number; navDate: string; freshness: string } }
  | { kind: 'unavailable'; reason: string };
const providers: Record<string, string> = {
  tencent: '腾讯财经',
  hithink: '同花顺',
  akshare: 'AKShare',
  efinance: '东方财富',
  yfinance: 'Yahoo Finance',
  futu: '富途',
  longbridge: '长桥',
};
const emptyFacts = {
  refresh: '',
  quality: '',
  changeAmount: '—',
  open: '—',
  previousClose: '—',
  high: '—',
  low: '—',
  source: '',
  fetched: '',
};
const reasons: Record<string, string> = {
  disabled: '行情已关闭',
  not_selected: '尚未配置行情来源',
  not_eligible: '行情来源不符合条件',
  inactive_instrument: '目录已停用',
  request_budget_cooldown: '请求冷却中，暂无可用报价',
};
type WatchlistContext = { session: string; reason?: string | undefined };

function watchlistQuoteStatus(q: Extract<Price, { kind: 'quote' }>['quote'], context?: WatchlistContext): string {
  let status = q.stale ? '行情陈旧' : '';
  if (context?.session === 'closed_snapshot') status = '休市 · 最近时段快照';
  if (context?.session === 'older_snapshot' && q.stale) status = '未覆盖最近交易时段';
  if (context?.session === 'unknown') status = '交易时段未知';
  if (context?.reason === 'source_time_future') status = '行情时间待核实';
  if (!q.marketTime) status = '行情时间未知';
  return status;
}

export function watchlistPriceDisplay(price?: Price, context?: WatchlistContext) {
  if (!price || price.kind === 'unavailable') {
    const status = price ? (reasons[price.reason] ?? '行情暂不可用') : '';
    return { ...emptyFacts, value: '—', change: '—', time: '', status };
  }
  if (price.kind === 'nav')
    return {
      ...emptyFacts,
      value: formatMarketNumber(price.nav.unitNav),
      change: '—',
      time: price.nav.navDate.slice(0, 10),
      status: price.nav.freshness === 'stale' ? '净值陈旧' : '正式净值',
    };
  const q = price.quote;
  const currency = q.units?.priceCurrency;
  const status = watchlistQuoteStatus(q, context);
  let refresh = '';
  if (q.refreshFailure === 'budget_cooldown') refresh = '请求冷却中，沿用上次报价';
  else if (q.refreshFailure) refresh = '刷新失败，沿用上次报价';
  return {
    value: formatMarketNumber(q.price) + (currency ? ' ' + currency : ''),
    change: q.previousClose > 0 ? formatRatioPercent(q.price / q.previousClose - 1) : '—',
    time: q.marketTime ? new Date(q.marketTime).toLocaleString('zh-CN', { hour12: false }) : '',
    status,
    refresh,
    quality: context?.session === 'closed_snapshot' ? '来源快照，非官方收盘价' : '',
    changeAmount: q.previousClose > 0 ? formatMarketNumber(q.price - q.previousClose) : '—',
    open: formatMarketNumber(q.open),
    previousClose: formatMarketNumber(q.previousClose),
    high: formatMarketNumber(q.high),
    low: formatMarketNumber(q.low),
    source: providers[q.provider ?? ''] ?? q.provider ?? '来源未知',
    fetched: q.fetchedAt ? new Date(q.fetchedAt).toLocaleString('zh-CN', { hour12: false }) : '',
  };
}

export const watchlistMarketOptions = [
  { value: '', label: '全部市场' },
  { value: 'SH', label: '沪市' },
  { value: 'SZ', label: '深市' },
  { value: 'BJ', label: '北交所' },
  { value: 'HK', label: '港股' },
  { value: 'US', label: '美股' },
  { value: 'OF', label: '场外' },
] as const;
export const watchlistTypeOptions = [
  { value: '', label: '全部类型' },
  { value: 'STOCK', label: '股票' },
  { value: 'ETF', label: 'ETF' },
  { value: 'MUTUAL_FUND', label: '场外基金' },
] as const;
