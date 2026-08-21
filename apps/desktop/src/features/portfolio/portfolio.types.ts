export type PortfolioMode = 'actual' | 'shadow';
export type LoadState = 'loading' | 'ready' | 'empty' | 'error' | 'stale';
export type HeldAssetType = 'stock' | 'etf' | 'fund';

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
