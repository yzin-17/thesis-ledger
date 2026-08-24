import type { PortfolioMode } from '../portfolio/portfolio.types.js';
import type { AllocationCategory } from '@thesis-ledger/domain';

export type { PortfolioMode };
export type { AllocationCategory };

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
}

export interface PerformanceAccountTotal {
  accountId: string;
  marketValue: number;
  costValue: number;
  cashValue: number;
  partial: boolean;
  missingSymbols: string[];
}

export interface PerformancePortfolioTotal {
  marketValue: number;
  costValue: number;
  cashValue: number;
  partial: boolean;
  missingSymbols: string[];
}

export interface PerformanceSummary {
  ttwror: number;
  xirr: number | null;
  xirrReason?: string | null;
}

export interface PerformanceLayersResponse {
  security: PerformanceLayerRecord[];
  account: PerformanceAccountTotal[];
  portfolio: PerformancePortfolioTotal;
  valuedAt: string;
  dataQuality: PerformanceDataQuality;
}

export interface PerformanceTargetsResponse {
  targets?: Record<string, number>;
  scope?: 'account' | 'portfolio';
  accountId?: string | null;
  version?: number;
  createdAt?: string;
}

export interface PerformanceAllocationResponse {
  allocation: PerformanceAllocationRecord[];
  rebalance: RebalanceGapRecord[];
  partial: boolean;
  missingSymbols: string[];
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
