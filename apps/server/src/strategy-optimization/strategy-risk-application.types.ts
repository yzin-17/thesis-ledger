import type { StrategyMonitoringContext } from '@thesis-ledger/domain';

export type StrategyRiskApplicationRow = {
  id: string;
  ownerKey: string;
  strategyVersionId: string;
  accountId: string;
  symbol: string;
  revision: number;
  semanticVersion: string;
  planHash: string;
  plan: unknown;
  cycleMode: string;
  cycleAnchor: unknown;
  enabled: boolean;
  notification: unknown;
  coverage: unknown;
  idempotencyKey: string;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
};

export type ActualRiskContext = {
  positionId?: string;
  tradeId?: string;
  openedAt?: string;
  context: StrategyMonitoringContext;
};

export type PositionTradeContext = {
  position: {
    id: string;
    quantity: { toString(): string };
    costPrice: { toString(): string };
  } | null;
  trade: { id: string; openedAt: Date | null } | null;
};
