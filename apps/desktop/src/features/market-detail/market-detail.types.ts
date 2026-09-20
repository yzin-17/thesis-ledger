import type {
  MarketDetailCapability,
  MarketDetailResponseV2,
  MarketDetailSectionV2,
  MarketDetailSectionStatus,
} from '@thesis-ledger/api-client';
import type { BarSeriesV2, QuoteV1 } from '@thesis-ledger/schemas';

export interface MarketDetailPosition {
  symbol: string;
  quantity: number;
  costPrice: number;
  pnl: number | null;
  asset: { name: string; assetType?: 'stock' | 'etf' | 'fund' };
}

export const mergeMarketDetail = (
  current: MarketDetailResponseV2 | null,
  next: MarketDetailResponseV2,
): MarketDetailResponseV2 => {
  if (!current) return next;
  if (current.symbol !== next.symbol) return current;
  const sections = { ...current.sections };
  Object.entries(next.sections).forEach(([capability, nextSection]) => {
    const currentSection = current.sections[capability as MarketDetailCapability];
    const currentHasData =
      currentSection?.data !== undefined && currentSection.data !== null &&
      (currentSection.status === 'ready' || currentSection.status === 'stale');
    // 局部回源失败或空响应不能抹掉已经展示的有效数据；保留分段状态也能让用户继续手动重试。
    const preserveCurrent =
      currentHasData &&
      (nextSection.data === undefined ||
        nextSection.data === null ||
        nextSection.status === 'unavailable' ||
        nextSection.status === 'empty');
    if (!preserveCurrent)
      sections[capability as MarketDetailCapability] = nextSection;
  });
  const currentSeries = current.barSeries;
  const nextSeries = next.barSeries;
  let mergedBarSeries = nextSeries ?? currentSeries;
  if (currentSeries && nextSeries) {
    // BarSeries 的 timestamp 可能在不同适配器间使用不同 ISO 表达，但图表语义按交易日
    // 合并；同日重叠项必须由本次有效响应替换，不能因时刻字符串不同而重复一根 bar。
    const byDate = new Map(currentSeries.points.map((bar) => [bar.timestamp.slice(0, 10), bar]));
    nextSeries.points.forEach((bar) => byDate.set(bar.timestamp.slice(0, 10), bar));
    const points = [...byDate.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const mergedSeries: BarSeriesV2 = {
      ...nextSeries,
      points,
      coverage: {
        ...nextSeries.coverage,
        actualStart: points[0]?.timestamp ?? null,
        actualEnd: points.at(-1)?.timestamp ?? null,
        hasMoreBefore: nextSeries.coverage.hasMoreBefore || currentSeries.coverage.hasMoreBefore,
      },
    };
    mergedBarSeries = mergedSeries;
    sections.bars = {
      ...next.sections.bars!,
      data: mergedSeries,
    } as MarketDetailSectionV2;
  }
  return {
    ...next,
    ...(mergedBarSeries ? { barSeries: mergedBarSeries } : {}),
    requested: [...new Set([...current.requested, ...next.requested])],
    sections,
    dependencies: { ...current.dependencies, ...next.dependencies },
  };
};

export const getVisibleMarketDetail = (
  detail: MarketDetailResponseV2 | null,
  queryData: MarketDetailResponseV2 | undefined,
  symbol: string,
) => {
  if (detail?.symbol === symbol) return detail;
  if (queryData?.symbol === symbol) return queryData;
  return null;
};

export const getMarketDetailSection = <T>(
  detail: MarketDetailResponseV2 | null,
  capability: MarketDetailCapability,
) => {
  const section = detail?.sections[capability];
  return section ? ({ section, data: section.data as T | undefined } as const) : null;
};

export const marketDetailStatusLabel = (status: MarketDetailSectionStatus) => {
  if (status === 'ready') return '可用';
  if (status === 'stale') return '陈旧';
  if (status === 'empty') return '暂无数据';
  if (status === 'unsupported') return '不支持';
  return '暂时不可用';
};

export const marketDetailStatusClass = (status: MarketDetailSectionStatus) => {
  if (status === 'ready') return 'tag';
  if (status === 'stale') return 'tag warning';
  if (status === 'unavailable') return 'tag danger';
  return 'tag';
};

export const marketDetailSectionTitle = (capability: MarketDetailCapability) => {
  if (capability === 'quote') return '实时行情';
  if (capability === 'bars') return '最近日线';
  if (capability === 'chip') return '筹码摘要';
  if (capability === 'fund-nav') return '最新基金净值';
  if (capability === 'fund-nav-history') return '基金净值历史';
  return `技术指标 ${capability.slice('indicator:'.length)}`;
};

export const isRetryableMarketDetailSection = (section: MarketDetailSectionV2 | undefined) =>
  section?.status === 'unavailable';

/**
 * DSA 对单标的 REALTIME_QUOTE 的最小上游刷新间隔（秒）。
 *
 * 依据 docs/specs/2026-09-14-portfolio-valuation-demand-guard.md §2（与 DSA
 * `PROVIDER_REQUEST_BUDGET_SECONDS` 一致）。Server 的 fresh 缓存只有 15 秒，
 * 因此间隔内的请求必然回退 last-valid 并携带 `stale=true`——这是真实语义，不是故障。
 * 该常量只用于展示层把「上游刷新间隔内的回退」与「真正过期的数据」区分开，
 * 不改变 stale / servedFromCache / marketTime 的任何语义。
 */
export const MARKET_QUOTE_UPSTREAM_REFRESH_SECONDS = 600;

/** 以「这份行情被取回多久了」为口径，市场休市时 marketTime 可能远早于当前时间。 */
export const quoteServedAgeMs = (quote: QuoteV1 | undefined, now = Date.now()) => {
  if (!quote) return null;
  const parsed = Date.parse(quote.fetchedAt ?? quote.marketTime);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, now - parsed);
};

export const isQuoteWithinUpstreamRefreshWindow = (
  quote: QuoteV1 | undefined,
  now = Date.now(),
) => {
  const age = quoteServedAgeMs(quote, now);
  return age !== null && age <= MARKET_QUOTE_UPSTREAM_REFRESH_SECONDS * 1_000;
};
