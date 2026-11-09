import type { MarketDisplayDetailSection } from '@thesis-ledger/api-client';
import { marketStaleReasonSchema, quoteSchema } from '@thesis-ledger/schemas';
import { quoteFreshnessExplanation } from '@thesis-ledger/domain';

export function marketDetailStaleReason(section: MarketDisplayDetailSection): string | null {
  if (section.status !== 'stale') return null;
  if (section.error) return section.error.message;
  if (section.capability === 'quote') {
    const quote = quoteSchema.safeParse(section.data);
    if (quote.success) return quoteFreshnessExplanation(quote.data) ?? '当前分段标记为陈旧，但报价未提供相应时效依据，请重新加载。';
  }
  const values = Array.isArray(section.data) ? section.data : [section.data];
  const messages = values.flatMap((value) => {
    if (!value || typeof value !== 'object' || !('staleReason' in value)) return [];
    const reason = marketStaleReasonSchema.safeParse(value.staleReason);
    return reason.success ? [reason.data.message] : [];
  });
  return [...new Set(messages)].join('；') || '当前响应标记为陈旧，但缺少判定原因，请重新加载获取诊断。';
}

export const quoteUpstreamWindowLabel = (section: MarketDisplayDetailSection) => {
  if (section.capability !== 'quote' || section.status !== 'stale' || section.error) return null;
  const quote = quoteSchema.safeParse(section.data);
  if (!quote.success) return null;
  const code = quote.data.staleReason?.code;
  return code === 'request_budget_cooldown' || !code && quote.data.refreshFailure === 'budget_cooldown'
    ? '刷新冷却中' : null;
};
