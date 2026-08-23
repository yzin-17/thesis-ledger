import type { Portfolio, PortfolioMode } from '../portfolio/portfolio.types.js';

export type { Portfolio, PortfolioMode };

export interface RiskRuleRecord {
  id: string;
  version: number;
  kind: string;
  scope: 'security' | 'account' | 'portfolio';
  severity: 'info' | 'warning' | 'error' | 'critical';
  threshold: number;
  enabled: boolean;
  symbol: string | null;
  accountId: string | null;
  effectiveAt: string;
}

export interface RiskEventRecord {
  id: string;
  ruleId: string;
  ruleVersion: number;
  severity: string;
  message: string;
  symbol: string | null;
  marketTime: string | null;
  evaluatedAt: string;
  context: Record<string, unknown>;
}

export interface NotificationRecord {
  id: string;
  eventId: string;
  channel: string;
  severity: string;
  status: string;
  attemptCount: number;
  scheduledAt: string;
  lastError: string | null;
}

export interface RiskAuditRecord {
  id: string;
  action: string;
  ruleVersion: number;
  createdAt: string;
}

export interface RiskContext {
  symbol: string;
  accountId: string;
  mode: 'actual' | 'shadow';
  costPrice: number;
  price?: number;
  weight?: number;
  marketTime: string;
  dataQuality: { portfolio: 'partial' | 'fresh' };
}

export interface CreateRiskRuleInput {
  kind: string;
  scope: 'security' | 'account' | 'portfolio';
  severity: 'info' | 'warning' | 'error' | 'critical';
  threshold: number;
  enabled: boolean;
  symbol?: string;
  accountId?: string;
}
