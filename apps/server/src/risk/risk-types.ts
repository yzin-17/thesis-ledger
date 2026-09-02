import type { CompleteRiskContext, RiskRule } from '@thesis-ledger/domain';
import {
  riskAccountContextSchema,
  riskPortfolioContextSchema,
  riskScanContextSchema,
} from '@thesis-ledger/schemas';

export type SecurityContext = ReturnType<typeof riskScanContextSchema.parse>;
export type AccountContext = ReturnType<typeof riskAccountContextSchema.parse>;
export type PortfolioContext = ReturnType<typeof riskPortfolioContextSchema.parse>;
export type PortfolioMode = 'actual' | 'shadow';

export type StoredRule = {
  id: string;
  version: number;
  kind: string;
  scope: string;
  severity: string;
  threshold: unknown;
  enabled: boolean;
  needsRepair: boolean;
  repairReason: string | null;
  symbol: string | null;
  accountId: string | null;
  sourcePlanId?: string | null;
  condition?: unknown;
  parameters?: unknown;
};

export type ParsedScan = {
  scanId?: string;
  security: SecurityContext[];
  accounts: AccountContext[];
  portfolio?: PortfolioContext;
  allowStale: boolean;
};

export type EvaluationCandidate = {
  scope: RiskRule['scope'];
  mode: PortfolioMode;
  marketTime: string;
  dataQuality: Record<string, string>;
  symbol?: string;
  accountId?: string;
  affectedAccountIds?: string[];
  domain: CompleteRiskContext;
};

export type PositionContext = NonNullable<SecurityContext['positions']>[number];
