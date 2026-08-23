export type PortfolioMode = 'actual' | 'shadow';
export type LoadState = 'loading' | 'ready' | 'empty' | 'error' | 'stale';
export type HeldAssetType = 'stock' | 'etf' | 'fund';

export interface InstrumentLookup {
  id: string;
  symbol: string;
  canonicalCode: string;
  instrumentType: string;
  market: string;
  displayName: string;
  confirmable: boolean;
  disabledReason?: string | null;
}

export type InstrumentSearchState = 'idle' | 'loading' | 'results' | 'empty' | 'error' | 'selected';

export const instrumentTypeLabel = (instrumentType: string) => {
  if (instrumentType === 'ETF') return 'ETF';
  if (instrumentType === 'MUTUAL_FUND') return '基金';
  return '股票';
};

export const instrumentMarketLabel = (market: string) => {
  if (market === 'SH') return '上海证券交易所';
  if (market === 'SZ') return '深圳证券交易所';
  if (market === 'BJ') return '北京证券交易所';
  if (market === 'HK') return '香港交易所';
  if (market === 'OF') return '场外基金';
  return market;
};

export const instrumentAssetType = (instrumentType: string): HeldAssetType => {
  if (instrumentType === 'ETF') return 'etf';
  if (instrumentType === 'MUTUAL_FUND') return 'fund';
  return 'stock';
};

export const assetTypeLabel = (assetType?: HeldAssetType) => {
  if (assetType === 'etf') return 'ETF';
  if (assetType === 'fund') return '基金';
  return '股票';
};

export const assetQuantityUnit = (assetType?: HeldAssetType, symbol?: string) =>
  assetType === 'stock' || (!assetType && !symbol?.endsWith('.OF')) ? '股' : '份';

export interface Account {
  id: string;
  name: string;
  institution?: string | null;
  type: 'securities' | 'fund' | 'cash';
  mode: PortfolioMode;
  currency: 'CNY' | 'HKD' | 'USD';
  active?: boolean;
}

export interface Position {
  id: string;
  accountId: string;
  symbol: string;
  quantity: number;
  costPrice: number;
  marketValue: number | null;
  pnl: number | null;
  stale: boolean;
  source?: string;
  asset: { name: string; assetType?: HeldAssetType };
}

export interface Portfolio {
  totalMarketValue: number;
  totalCost: number;
  totalPnl: number;
  cashValue: number;
  mode: PortfolioMode;
  partial: boolean;
  valuedAt: string;
  positions: Position[];
}
