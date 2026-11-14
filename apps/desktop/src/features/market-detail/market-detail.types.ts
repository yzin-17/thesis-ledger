import type {
  MarketDetailCapability,
  MarketDisplayDetailResponse as MarketDetailResponse,
  MarketDisplayDetailSection as MarketDetailSection,
  MarketDetailSectionStatus,
} from '@thesis-ledger/api-client';
import type { Currency, MarketDisplayBarSeries as BarSeries } from '@thesis-ledger/schemas';
import { isMarketMinuteTimeframe } from '@thesis-ledger/schemas';
import { canCombineChartSeries } from './market-chart-acquisition.js';
import type { MarketDetailResponse as NativeDetailResponse } from '@thesis-ledger/api-client';

export interface MarketDetailPosition {
  instrumentId?: string;
  symbol: string;
  accountId?: string;
  mode?: 'actual' | 'shadow';
  currency?: Currency | undefined;
  valuedAt?: string;
  accountName?: string | undefined;
  quantity?: number;
  costPrice?: number;
  pnl?: number | null;
  asset: { name: string; assetType?: 'stock' | 'etf' | 'fund' };
}

type OriginalBarSeries = Exclude<BarSeries, { derivation: unknown }>;

function mergeCompatibleBarSeries(
  currentSeries: OriginalBarSeries,
  nextSeries: OriginalBarSeries,
): OriginalBarSeries {
  // 日线按交易日合并，分钟保留同日每个独立时刻；重叠项由本次有效响应替换。
  const key = (timestamp: string) =>
    isMarketMinuteTimeframe(nextSeries.identity.timeframe)
      ? new Date(timestamp).toISOString()
      : timestamp.slice(0, 10);
  const byDate = new Map(currentSeries.points.map((bar) => [key(bar.timestamp), bar]));
  nextSeries.points.forEach((bar) => byDate.set(key(bar.timestamp), bar));
  const points = [...byDate.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return {
    ...nextSeries,
    points,
    coverage: {
      ...nextSeries.coverage,
      actualStart: points[0]?.timestamp ?? null,
      actualEnd: points.at(-1)?.timestamp ?? null,
      hasMoreBefore: nextSeries.coverage.hasMoreBefore || currentSeries.coverage.hasMoreBefore,
    },
  };
}

export function mergeMarketDetail(
  current: NativeDetailResponse | null,
  next: NativeDetailResponse,
): NativeDetailResponse;
export function mergeMarketDetail(
  current: MarketDetailResponse | null,
  next: MarketDetailResponse,
): MarketDetailResponse;
export function mergeMarketDetail(
  current: MarketDetailResponse | null,
  next: MarketDetailResponse,
): MarketDetailResponse {
  if (!current) return next;
  if (current.symbol !== next.symbol) return current;
  const currentSeries = current.barSeries;
  const nextSeries =
    next.barSeries?.points.length === 0 && currentSeries?.points.length
      ? undefined
      : next.barSeries;
  const canCombine = Boolean(
    currentSeries && nextSeries && canCombineChartSeries(currentSeries, nextSeries),
  );
  const sections = { ...current.sections };
  if (currentSeries && nextSeries && !canCombine) {
    delete sections.bars;
    delete sections['indicator:MA'];
    delete sections['indicator:MACD'];
    delete sections['indicator:RSI'];
  }
  Object.entries(next.sections).forEach(([capability, nextSection]) => {
    const currentSection = sections[capability as MarketDetailCapability];
    const currentHasData =
      currentSection?.data !== undefined &&
      currentSection.data !== null &&
      (currentSection.status === 'ready' || currentSection.status === 'stale');
    // 局部回源失败或空响应不能抹掉已经展示的有效数据；保留分段状态也能让用户继续手动重试。
    const preserveCurrent =
      currentHasData &&
      (nextSection.data === undefined ||
        nextSection.data === null ||
        nextSection.status === 'unavailable' ||
        nextSection.status === 'empty');
    if (!preserveCurrent) sections[capability as MarketDetailCapability] = nextSection;
  });
  let mergedBarSeries = nextSeries ?? currentSeries;
  if (
    currentSeries &&
    nextSeries &&
    canCombine &&
    !('derivation' in currentSeries) &&
    !('derivation' in nextSeries)
  ) {
    const mergedSeries = mergeCompatibleBarSeries(currentSeries, nextSeries);
    mergedBarSeries = mergedSeries;
    sections.bars = {
      ...next.sections.bars!,
      data: mergedSeries,
    } as MarketDetailSection;
  }
  return {
    ...next,
    ...(mergedBarSeries ? { barSeries: mergedBarSeries } : {}),
    requested: [...new Set([...current.requested, ...next.requested])],
    sections,
    dependencies: { ...current.dependencies, ...next.dependencies },
  };
}

export const getVisibleMarketDetail = (
  detail: MarketDetailResponse | null,
  queryData: MarketDetailResponse | undefined,
  symbol: string,
) => {
  if (detail?.symbol === symbol) return detail;
  if (queryData?.symbol === symbol) return queryData;
  return null;
};

export const getMarketDetailSection = <T>(
  detail: MarketDetailResponse | null,
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

export const marketDetailStatusVariant = (status: MarketDetailSectionStatus) => {
  if (status === 'unavailable') return 'destructive';
  if (status === 'ready') return 'secondary';
  return 'outline';
};

export const marketDetailSectionTitle = (capability: MarketDetailCapability) => {
  if (capability === 'quote') return '实时行情';
  if (capability === 'bars') return '历史行情';
  if (capability === 'chip') return '筹码摘要';
  if (capability === 'fund-nav') return '最新基金净值';
  if (capability === 'fund-nav-history') return '基金净值历史';
  return `技术指标 ${capability.slice('indicator:'.length)}`;
};

export const isRetryableMarketDetailSection = (section: MarketDetailSection | undefined) =>
  section?.status === 'unavailable' &&
  ![
    'capability_not_enabled',
    'capability_unsupported',
    'market_data_unauthorized',
    'market_data_contract_invalid',
  ].includes(section.error?.code ?? '');
