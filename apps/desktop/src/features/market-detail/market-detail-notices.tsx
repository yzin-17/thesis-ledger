import type { MarketDisplayDetailResponse, MarketDisplayDetailSection } from '@thesis-ledger/api-client';
import { isMarketClosedSnapshot, quoteFreshnessExplanation } from '@thesis-ledger/domain';
import { marketDetailStaleReason, quoteUpstreamWindowLabel } from './market-detail-stale-reason.js';
import { MarketDetailNotice, type MarketDetailNoticeState } from './MarketDetailSections.js';
import {
  marketDetailSectionTitle,
} from './market-detail.types.js';

function quoteInformation(section: MarketDisplayDetailSection | undefined, cooldown: boolean, normal: boolean) {
  if (cooldown && section) return { title: '行情刷新冷却中', description: marketDetailStaleReason(section) ?? '' };
  const quote = section?.capability === 'quote' ? section.data : undefined;
  if (normal && quote && isMarketClosedSnapshot(quote)) return {
    title: '休市快照', description: quoteFreshnessExplanation(quote) ?? '',
  };
  return null;
}

export function marketDetailNotices(
  detail: MarketDisplayDetailResponse | null,
  refreshing: boolean,
  onRetry?: () => void,
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
  const staleNotice: MarketDetailNoticeState = refreshing
    ? {
        state: 'loading',
        title: '正在刷新行情详情',
        description: '已保留当前可见内容，正在尝试获取更新数据。',
      }
    : {
        state: 'stale',
        title: '行情数据时效提示',
        description: staleSections
          .map(
            (section) =>
              `${marketDetailSectionTitle(section.capability)}：${marketDetailStaleReason(section)}`,
          )
          .join('；'),
      };
  const info = quoteInformation(quoteSection, onlyUpstreamWindow, !refreshing && staleSections.length === 0);
  const quoteInfoNotice = info ? (
    <MarketDetailNotice
      flush
      state="info"
      title={info.title}
      description={info.description}
      {...(onRetry ? { onRetry } : {})}
    />
  ) : null;
  return {
    stale: staleSections.length > 0 || (refreshing && Boolean(detail)),
    staleNotice,
    quoteInfoNotice,
  };
}
