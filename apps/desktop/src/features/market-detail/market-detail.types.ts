import type {
  MarketDetailCapability,
  MarketDetailResponseV2,
  MarketDetailSectionV2,
  MarketDetailSectionStatus,
} from '@thesis-ledger/api-client';
import type { BarSeriesV2 } from '@thesis-ledger/schemas';

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
  const sections = { ...current.sections, ...next.sections };
  const currentSeries = current.barSeries;
  const nextSeries = next.barSeries;
  let mergedBarSeries = nextSeries ?? currentSeries;
  if (currentSeries && nextSeries) {
    const byDate = new Map([...currentSeries.points, ...nextSeries.points].map((bar) => [bar.timestamp, bar]));
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
