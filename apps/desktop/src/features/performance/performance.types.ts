import type { PortfolioMode } from '../portfolio/portfolio.types.js';
import type { AllocationCategory } from '@thesis-ledger/domain';

export type { PortfolioMode };
export type { AllocationCategory };

export type Currency = 'CNY' | 'HKD' | 'USD';

export interface PerformanceQueryOptions {
  fxMerge: boolean;
  baseCurrency: Currency;
}

export type FxMergeStatus = 'disabled' | 'not_needed' | 'ready' | 'stale' | 'blocked';

export interface PerformanceFxRate {
  fromCurrency: Currency;
  toCurrency: Currency;
  rate?: number;
  rateDate?: string;
  provider?: string;
  fetchedAt?: string;
  freshness: 'live' | 'delayed' | 'stale' | 'unavailable';
  stale: boolean;
  ageDays: number | null;
  available: boolean;
}

export interface PerformanceFxMeta {
  enabled: boolean;
  status: FxMergeStatus;
  baseCurrency?: Currency;
  asOf?: string;
  fxAsOf?: string;
  estimated?: boolean;
  conversionMode?: 'current-rate';
  stale?: boolean;
  fxStale?: boolean;
  missingCurrencies: Currency[];
  rates: PerformanceFxRate[];
}

export interface PerformanceDataQuality {
  partial: boolean;
  missingSymbols: string[];
}

export interface SnapshotRecord {
  id: string;
  capturedAt: string;
  marketValue: number;
  costValue: number;
  cashValue: number;
  partial: boolean;
  missingSymbols: string[];
  currency?: Currency;
}

export interface PerformanceAllocationRecord {
  category: AllocationCategory;
  value: number;
  weight: number | null;
}

export interface RebalanceGapRecord {
  category: AllocationCategory;
  currentWeight: number;
  targetWeight: number;
  weightGap: number;
  amountGap: number;
  direction: 'increase' | 'decrease' | 'balanced';
}

export interface PerformanceLayerRecord {
  accountId: string;
  symbol: string;
  assetType: string;
  costValue: number;
  marketValue: number | null;
  unrealizedPnl: number | null;
  currency?: Currency;
  nativeCostValue?: number;
  nativeMarketValue?: number | null;
}

export interface PerformanceAccountTotal {
  accountId: string;
  marketValue: number;
  costValue: number;
  cashValue: number;
  partial: boolean;
  missingSymbols: string[];
  currency?: Currency;
  nativeCostValue?: number;
  nativeMarketValue?: number;
  nativeCashValue?: number;
}

export interface PerformancePortfolioTotal {
  marketValue: number;
  costValue: number;
  cashValue: number;
  partial: boolean;
  missingSymbols: string[];
  currency?: Currency;
  nativeCostValue?: number;
  nativeMarketValue?: number;
  nativeCashValue?: number;
}

export interface PerformanceSummary {
  ttwror: number | null;
  xirr: number | null;
  xirrReason?: string | null;
  currency?: Currency;
  fx?: PerformanceFxMeta;
  estimated?: boolean;
  conversionMode?: 'current-rate';
  fxAsOf?: string;
  fxStale?: boolean;
}

export interface PerformanceLayersResponse {
  security: PerformanceLayerRecord[];
  account: PerformanceAccountTotal[];
  portfolio: PerformancePortfolioTotal | null;
  byCurrency?: PerformancePortfolioTotal[];
  valuedAt: string;
  dataQuality: PerformanceDataQuality;
  fx?: PerformanceFxMeta;
  estimated?: boolean;
  conversionMode?: 'current-rate';
  fxAsOf?: string;
  fxStale?: boolean;
}

export interface PerformanceTargetsResponse {
  targets?: Record<string, number>;
  scope?: 'account' | 'portfolio';
  accountId?: string | null;
  version?: number;
  createdAt?: string;
  source?: 'explicit' | 'account-aggregate' | 'none';
  aggregatedAccountCount?: number;
  aggregationUnavailableReason?: 'mixed-currency';
}

export interface PerformanceAllocationResponse {
  allocation: PerformanceAllocationRecord[];
  rebalance: RebalanceGapRecord[];
  partial: boolean;
  missingSymbols: string[];
  fx?: PerformanceFxMeta;
}

export interface PerformanceAllocationInput {
  positions: Array<{ category: AllocationCategory; marketValue: number }>;
  targets?: Record<string, number>;
  dataQuality?: PerformanceDataQuality;
}

export interface SavePerformanceTargetsInput {
  scope: 'account' | 'portfolio';
  accountId?: string;
  targets: Record<string, number>;
}
