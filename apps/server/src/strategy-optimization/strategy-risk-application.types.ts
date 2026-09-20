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

/**
 * A management reference deliberately contains only stable identity fields.
 * It is returned when a command cannot (or must not) create/replace an
 * application, so clients can offer an explicit view/edit choice without
 * guessing which historical row should be used.
 */
export type StrategyRiskApplicationManagementEntry = Pick<
  StrategyRiskApplicationRow,
  | 'id'
  | 'strategyVersionId'
  | 'accountId'
  | 'symbol'
  | 'cycleMode'
  | 'revision'
  | 'enabled'
  | 'archivedAt'
>;

export const strategyRiskApplicationManagementEntry = (
  row: StrategyRiskApplicationManagementEntry,
): StrategyRiskApplicationManagementEntry => ({
  id: row.id,
  strategyVersionId: row.strategyVersionId,
  accountId: row.accountId,
  symbol: row.symbol,
  cycleMode: row.cycleMode,
  revision: row.revision,
  enabled: row.enabled,
  archivedAt: row.archivedAt,
});

export type StrategyRiskApplicationResolution =
  | {
      kind: 'reused';
      reason: 'same_identity';
      management: {
        applicationId: string;
        actions: ['view', 'edit'];
      };
    }
  | {
      kind: 'upgrade_target_exists';
      sourceApplicationId: string;
      management: {
        applicationId: string;
        actions: ['view', 'edit'];
      };
    }
  | {
      kind: 'already_bound';
      sourceApplicationId: string;
      management: {
        applicationId: string;
        actions: ['view', 'edit'];
      };
    };

export type StrategyRiskApplicationCommandResult = StrategyRiskApplicationRow & {
  applicationResolution?: StrategyRiskApplicationResolution;
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
