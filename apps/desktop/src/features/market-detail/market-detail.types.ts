import type {
  MarketDetailCapability,
  MarketDetailResponse,
  MarketDetailSection,
  MarketDetailSectionStatus,
} from '@thesis-ledger/api-client';

export interface MarketDetailPosition {
  symbol: string;
  quantity: number;
  costPrice: number;
  pnl: number | null;
  asset: { name: string; assetType?: 'stock' | 'etf' | 'fund' };
}

export const mergeMarketDetail = (
  current: MarketDetailResponse | null,
  next: MarketDetailResponse,
): MarketDetailResponse => {
  if (!current) return next;
  if (current.symbol !== next.symbol) return current;
  return {
    ...next,
    requested: [...new Set([...current.requested, ...next.requested])],
    sections: { ...current.sections, ...next.sections },
    dependencies: { ...current.dependencies, ...next.dependencies },
  };
};

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

export const isRetryableMarketDetailSection = (section: MarketDetailSection | undefined) =>
  section?.status === 'unavailable';
