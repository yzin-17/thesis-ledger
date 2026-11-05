import type { MarketDisplayDetailSection } from '@thesis-ledger/api-client';
import { marketStaleReasonSchema, type Quote } from '@thesis-ledger/schemas';
import { isQuoteWithinUpstreamRefreshWindow } from './market-detail.types.js';

export function marketDetailStaleReason(section: MarketDisplayDetailSection): string | null {
  if (section.status !== 'stale') return null;
  if (section.error) return section.error.message;
  const values = Array.isArray(section.data) ? section.data : [section.data];
  const messages = values.flatMap((value) => {
    if (!value || typeof value !== 'object' || !('staleReason' in value)) return [];
    const reason = marketStaleReasonSchema.safeParse(value.staleReason);
    return reason.success ? [reason.data.message] : [];
  });
  return [...new Set(messages)].join('；') || '来源未返回具体陈旧原因，当前保留上次可用数据。';
}

export const quoteUpstreamWindowLabel = (section: MarketDisplayDetailSection) => {
  if (section.capability !== 'quote' || section.status !== 'stale' || section.error) return null;
  return isQuoteWithinUpstreamRefreshWindow(section.data as Quote | undefined)
    ? '按上游间隔'
    : null;
};
