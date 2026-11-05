import type { MarketDisplayDetailResponse } from '@thesis-ledger/api-client';
import { type Quote } from '@thesis-ledger/schemas';
import { marketDetailStaleReason, quoteUpstreamWindowLabel } from './market-detail-stale-reason.js';
import { MarketDetailNotice, type MarketDetailNoticeState } from './MarketDetailSections.js';
import {
  MARKET_QUOTE_UPSTREAM_REFRESH_SECONDS,
  marketDetailSectionTitle,
  quoteServedAgeMs,
} from './market-detail.types.js';

export function marketDetailNotices(
  detail: MarketDisplayDetailResponse | null,
  refreshing: boolean,
  onRetry: () => void,
) {
  const staleSections = Object.values(detail?.sections ?? {}).filter(
    (section) => section.status === 'stale',
  );
  const quoteSection = detail?.sections.quote;
  const onlyUpstreamWindow =
    !refreshing &&
    staleSections.length > 0 &&
    staleSections.every(
      (section) => section.capability === 'quote' && quoteUpstreamWindowLabel(section),
    );
  const quoteAge = quoteServedAgeMs(quoteSection?.data as Quote | undefined);
  const remainingMinutes = Math.max(
    1,
    Math.ceil((MARKET_QUOTE_UPSTREAM_REFRESH_SECONDS * 1000 - (quoteAge ?? 0)) / 60_000),
  );
  const staleNotice: MarketDetailNoticeState = refreshing
    ? {
        state: 'stale',
        title: '正在刷新行情详情',
        description: '已保留当前可见内容，正在尝试获取更新数据。',
      }
    : {
        state: 'stale',
        title: '行情详情可能陈旧',
        description: staleSections
          .map(
            (section) =>
              `${marketDetailSectionTitle(section.capability)}：${marketDetailStaleReason(section)}`,
          )
          .join('；'),
      };
  const quoteUpstreamNotice = onlyUpstreamWindow ? (
    <MarketDetailNotice
      flush
      state="info"
      title="行情按上游刷新间隔更新"
      description={`上游对单标的行情有约 ${MARKET_QUOTE_UPSTREAM_REFRESH_SECONDS / 60} 分钟最小刷新间隔，当前已是该间隔内的最新结果；约 ${remainingMinutes} 分钟后可再次刷新。`}
      onRetry={onRetry}
    />
  ) : null;
  return {
    stale: staleSections.length > 0 || (refreshing && Boolean(detail)),
    staleNotice,
    quoteUpstreamNotice,
  };
}
