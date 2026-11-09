import { DsaError } from '../integration/dsa/dsa.client.js';
import { MARKET_CACHE_POLICIES } from './market-result-cache.js';
import type { Quote, QuoteAssetType, MarketQuoteSession } from '@thesis-ledger/schemas';
import { observedQuoteReason, quoteSessionStaleReason } from './market-quote-diagnostics.js';

/** DSA 在来源请求前占用 ETF 的 600 秒窗口，失败也不能立即重试。 */
export const quoteCacheSeconds = (assetType?: QuoteAssetType) => (assetType === 'ETF' ? 600 : MARKET_CACHE_POLICIES.realtimeQuote.freshSeconds);
export function quoteRefreshFailure(reason: string, error?: unknown): Quote['refreshFailure'] {
  if (reason === 'request_budget_cooldown') return 'budget_cooldown';
  if (error instanceof DsaError) return 'fetch_failed';
  if (['cache-error', 'cache-unavailable', 'cache-write', 'unavailable'].includes(reason))
    return 'cache_unavailable';
  if (reason === 'lock-wait') return undefined;
  return 'fetch_failed';
}

/** 与 quote 分布式锁一起使用；无缓存样本的失败也必须退避。 */
export async function reserveQuoteWindow(
  client:
    | {
        set?: (
          key: string,
          value: string,
          mode: 'PX',
          ttl: number,
          flag: 'NX',
        ) => Promise<string | null>;
      }
    | undefined,
  key: string,
  assetType?: QuoteAssetType,
) {
  if (assetType !== 'ETF') return;
  if (
    !client?.set ||
    (await client.set(key + ':request-window', 'reserved', 'PX', 600_000, 'NX')) !== 'OK'
  ) {
    throw new DsaError('报价请求处于冷却窗口', 'unavailable', undefined, 'request_budget_cooldown');
  }
}

export function observeQuoteTime(quote: Quote, now = Date.now()): Quote {
  const staleReason = observedQuoteReason(quote, now);
  if (quote.marketTime && now - Date.parse(quote.marketTime) > 600_000)
    return { ...quote, stale: true, freshness: 'stale', staleReason };
  return staleReason ? { ...quote, staleReason } : quote;
}

/** 正常休市快照的展示质量与严格实时行情门禁分别投影。 */
export function projectQuoteSessionFreshness(quote: Quote, sessionContext: MarketQuoteSession): Quote {
  const result = { ...quote, sessionContext, staleReason: quoteSessionStaleReason(quote, sessionContext) };
  const reason = quote.staleReason?.code;
  if (sessionContext.session !== 'closed_snapshot' || quote.refreshFailure) return result;
  if (reason && reason !== 'market_time_aged') return result;
  return { ...result, stale: false, freshness: 'delayed', staleReason: undefined };
}
