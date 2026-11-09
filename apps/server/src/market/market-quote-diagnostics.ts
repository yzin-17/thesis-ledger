import type { Quote, QuoteStaleReason, MarketQuoteSession } from '@thesis-ledger/schemas';
import { marketStaleReason } from './market-stale-reason.js';
import { ZodError } from 'zod';
import { DsaError } from '../integration/dsa/dsa.client.js';

/** 缓存回退阶段与来源异常分别分类；响应只包含安全业务诊断。 */
export function quoteFallbackReason(stage: string, error?: unknown): QuoteStaleReason {
  if (error instanceof ZodError) return marketStaleReason(error);
  if (stage === 'request_budget_cooldown') return {
    code: 'request_budget_cooldown',
    message: '行情请求仍在 10 分钟冷却窗口内，本次未再次请求来源，当前展示上次可用数据。',
  };
  if (error instanceof DsaError) return marketStaleReason(error);
  if (stage === 'invalid-response') return {
    code: 'invalid_response',
    message: '数据源响应格式或标的校验失败，当前展示上次成功取得的数据。',
  };
  const cacheMessages: Record<string, string> = {
    'cache-error': '行情缓存读取或内容校验失败',
    'cache-unavailable': '行情缓存写入功能不可用',
    'cache-write': '行情缓存写入失败',
    unavailable: '行情刷新锁不可用',
  };
  if (cacheMessages[stage]) return {
    code: 'cache_unavailable', message: `${cacheMessages[stage]}，当前展示上次可用数据。`,
  };
  if (stage === 'lock-wait') return {
    code: 'refresh_in_progress',
    message: '等待其他行情刷新完成后仍未取得新结果，当前展示上次可用数据。',
  };
  return marketStaleReason(error);
}

/** 只补充可观察的时效依据；不以抓取时间替代行情时间。 */
export function observedQuoteReason(quote: Quote, now: number): QuoteStaleReason | undefined {
  if (quote.staleReason) return quote.staleReason;
  if (quote.refreshFailure === 'budget_cooldown') return quoteFallbackReason('request_budget_cooldown');
  if (quote.refreshFailure === 'cache_unavailable') return quoteFallbackReason('cache-unavailable');
  if (quote.refreshFailure === 'fetch_failed') return {
    code: 'source_unavailable',
    message: '上次刷新失败，旧缓存未记录细分错误，当前展示上次可用数据。',
  };
  if (quote.marketTime && now - Date.parse(quote.marketTime) > 600_000) return {
    code: 'market_time_aged',
    message: '来源行情时间距当前已超过 10 分钟，超出实时行情时效阈值。',
  };
  if (quote.stale || quote.freshness === 'stale') return {
    code: 'upstream_stale',
    message: '来源将该报价标记为陈旧，未提供更细的判定依据。',
  };
  return undefined;
}

export function quoteSessionStaleReason(quote: Quote, context: MarketQuoteSession): QuoteStaleReason | undefined {
  if (quote.staleReason?.code !== 'market_time_aged') return quote.staleReason;
  let message = quote.staleReason.message;
  if (context.session === 'trading') message = '当前为交易时段，来源行情时间距当前已超过 10 分钟。';
  else if (context.session === 'older_snapshot') message = `报价未覆盖最近已结束的交易时段（${context.latestTradingDate}），当前保留上次可用数据。`;
  else if (context.session === 'unknown') message = '来源行情时间距当前已超过 10 分钟；交易日历或时点信息不足，无法确认为休市快照。';
  return { ...quote.staleReason, message };
}
