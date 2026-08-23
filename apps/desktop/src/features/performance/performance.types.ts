import type { PortfolioMode } from '../portfolio/portfolio.types.js';

export type { PortfolioMode };

export interface SnapshotRecord {
  id: string;
  capturedAt: string;
  marketValue: number;
  costValue: number;
  cashValue: number;
}

export interface PerformanceAllocationRecord {
  category: string;
  value: number;
  weight: number;
}

export interface RebalanceGapRecord {
  category: string;
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

export interface PerformanceSummary {
  ttwror: number;
  xirr: number | null;
}

export interface PerformanceLayersResponse {
  security: PerformanceLayerRecord[];
}

export interface PerformanceTargetsResponse {
  targets?: Record<string, number>;
}

export interface PerformanceAllocationResponse {
  allocation: PerformanceAllocationRecord[];
  rebalance: RebalanceGapRecord[];
}

export interface PerformanceAllocationInput {
  positions: Array<{ category: string; marketValue: number }>;
  targets?: Record<string, number>;
}

export interface SavePerformanceTargetsInput {
  scope: 'account' | 'portfolio';
  accountId?: string;
  targets: Record<string, number>;
}
