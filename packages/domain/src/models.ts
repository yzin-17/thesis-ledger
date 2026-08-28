export type Market = 'SH' | 'SZ' | 'BJ' | 'HK' | 'US' | 'OF' | 'CASH';
export type AssetType = 'stock' | 'etf' | 'fund' | 'index' | 'cash';
export type Currency = 'CNY' | 'HKD' | 'USD';

export interface Asset {
  symbol: string;
  name: string;
  market: Market;
  assetType: AssetType;
  currency: Currency;
  sector?: string;
}

export type AccountType = 'securities' | 'fund' | 'cash';
export type AccountMode = 'actual' | 'shadow';

export interface Account {
  id: string;
  name: string;
  institution?: string;
  type: AccountType;
  mode: AccountMode;
  currency: Currency;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Position {
  accountId: string;
  asset: Asset;
  quantity: number;
  costPrice: number;
  marketPrice?: number;
  updatedAt: string;
}

export interface PositionValuation extends Position {
  costValue: number;
  marketValue: number | null;
  pnl: number | null;
  pnlRatio: number | null;
  stale: boolean;
  error?: string;
}

export interface Portfolio {
  positions: PositionValuation[];
  totalCost: number;
  totalMarketValue: number;
  totalPnl: number;
  partial: boolean;
  valuedAt: string;
}

export type Freshness = 'live' | 'delayed' | 'stale' | 'unknown';
export type ProviderHealth = 'healthy' | 'degraded' | 'down';

export interface Provenance {
  provider: string;
  sourceUrl?: string;
  marketTime: string;
  fetchedAt: string;
  freshness: Freshness;
}

export interface JournalEntry {
  id: string;
  entryType?: 'trade' | 'review' | 'note' | 'risk';
  accountId?: string;
  ledgerEventId?: string;
  tradePlanId?: string;
  riskEventId?: string;
  strategyVersionId?: string;
  symbol?: string;
  side?: 'buy' | 'sell' | 'review';
  reason: string;
  content?: string;
  tags?: string[];
  thesis?: string;
  catalyst?: string;
  risk?: string;
  exitReason?: string;
  emotion?: string;
  notes?: string;
  createdAt: string;
}

export interface TradePlan {
  id: string;
  accountId?: string;
  tradeId?: string;
  symbol: string;
  side?: 'buy' | 'sell';
  plannedEntry?: number;
  plannedExit?: number;
  plannedEntryAt?: string;
  plannedExitAt?: string;
  stopLoss?: number;
  takeProfit?: number;
  targetWeight?: number;
  expectedHoldingDays?: number;
  reason?: string;
  thesis?: string;
  status?: 'active' | 'executed' | 'cancelled';
}
