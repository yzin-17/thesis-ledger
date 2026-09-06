import type { Portfolio, PortfolioMode } from '../portfolio/portfolio.types.js';

export type { Portfolio, PortfolioMode };

export type KnownRiskRuleKind =
  | 'fixed-stop'
  | 'cost-stop'
  | 'take-profit'
  | 'price-above'
  | 'price-below'
  | 'position-concentration'
  | 'trailing-stop'
  | 'drawdown'
  | 'ma'
  | 'rsi'
  | 'macd'
  | 'atr'
  | 'volume'
  | 'chip-peak'
  | 'chip-ratio'
  | 'chip-migration'
  | 'sector-concentration'
  | 'asset-concentration'
  | 'volatility-exposure'
  | 'correlation';

export type RiskRuleKind = KnownRiskRuleKind | (string & {});

export type RiskRuleScope = 'security' | 'account' | 'portfolio';
export type RiskRuleSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface RiskRuleRecord {
  id: string;
  version: number;
  kind: RiskRuleKind;
  scope: RiskRuleScope;
  severity: RiskRuleSeverity;
  threshold: number;
  enabled: boolean;
  needsRepair: boolean;
  repairReason: string | null;
  archivedAt: string | null;
  assetName?: string | null;
  symbol: string | null;
  accountId: string | null;
  effectiveAt: string;
}

export interface RiskEventRecord {
  id: string;
  ruleId: string;
  ruleVersion: number;
  mode?: string | null;
  scanId?: string | null;
  triggered?: boolean;
  severity: string;
  message: string;
  symbol: string | null;
  marketTime: string | null;
  evaluatedAt: string;
  context: Record<string, unknown>;
}

export interface RiskTestResult {
  id?: string;
  ruleId?: string;
  triggered: boolean;
  severity?: string;
  message?: string;
  evaluatedAt?: string;
  context?: Record<string, unknown>;
}

export interface RiskTestRecord {
  ruleVersion: number;
  results: RiskTestResult[];
  testedAt: string;
}

export interface RiskScanResult {
  traceId: string;
  scanId: string;
  results: Array<{ ruleId: string; eventId?: string; error?: string }>;
}

export interface NotificationRecord {
  id: string;
  subjectId: string;
  subjectType: string;
  channel: string;
  severity: string;
  status: string;
  attemptCount: number;
  scheduledAt: string;
  lastError: string | null;
}

export interface NotificationRouteRecord {
  channel: string;
  provider: string;
}

export interface NotificationRoutingStatus {
  routes: NotificationRouteRecord[];
}

export type NotificationAvailability = 'available' | 'unconfigured' | 'unknown';

export interface RiskAuditRecord {
  id: string;
  action: string;
  ruleVersion: number;
  createdAt: string;
  actor?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

export interface RiskContext {
  symbol: string;
  accountId: string;
  positionId: string;
  mode: 'actual' | 'shadow';
  costPrice: number;
  quantity: number;
  price?: number;
  weight?: number;
  accountWeight?: number;
  positionUpdatedAt?: string;
  marketTime: string;
  dataQuality: { portfolio: 'partial' | 'fresh'; marketData?: 'stale' };
}

export interface CreateRiskRuleInput {
  kind: RiskRuleKind;
  scope: RiskRuleScope;
  severity: RiskRuleSeverity;
  threshold: number;
  enabled: boolean;
  symbol?: string;
  accountId?: string;
}

export type UpdateRiskRuleInput = Partial<Omit<CreateRiskRuleInput, 'enabled'>> & {
  enabled?: boolean;
};
