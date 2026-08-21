export type Severity = 'info' | 'warning' | 'error' | 'critical';
export type RuleScope = 'security' | 'account' | 'portfolio';
export type RuleKind =
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

export interface RiskRule {
  id: string;
  version: number;
  kind: RuleKind;
  scope: RuleScope;
  severity: Severity;
  threshold: number;
  enabled: boolean;
  symbol?: string;
  accountId?: string;
  parameters?: Record<string, unknown>;
}

export interface RiskEvaluationContext {
  value: number;
  reference?: number;
  symbol?: string;
  accountId?: string;
  marketTime: string;
  inputs: Record<string, number>;
  metadata?: Record<string, string | number | boolean>;
}

export interface RiskEvent {
  id: string;
  ruleId: string;
  triggered: boolean;
  severity: Severity;
  message: string;
  evaluatedAt: string;
  context: RiskEvaluationContext;
}

export interface V01RiskContext {
  symbol: string;
  price?: number;
  costPrice?: number;
  weight?: number;
  marketTime: string;
}

export interface CompleteRiskContext extends V01RiskContext {
  holdingPeak?: number;
  portfolioValues?: readonly number[];
  indicators?: Readonly<Record<string, number>>;
  chip?: {
    mainPeak?: number;
    profitRatio: number;
    concentration: number;
    previousMainPeaks?: readonly number[];
    engineVersion: string;
    calculatedAt: string;
  };
  positions?: readonly {
    symbol: string;
    weight: number;
    sector?: string;
    assetType?: string;
    volatility?: number;
  }[];
  returns?: Readonly<Record<string, readonly number[]>>;
  dataQuality?: Readonly<Record<string, string>>;
}

export const riskParameter = (rule: RiskRule, name: string, fallback: number) => {
  const value = rule.parameters?.[name];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
};

export const riskDirection = (rule: RiskRule, fallback: 'above' | 'below') => {
  const value = rule.parameters?.direction;
  return value === 'above' || value === 'below' ? value : fallback;
};

export const completeRiskEvent = (
  rule: RiskRule,
  context: CompleteRiskContext,
  value: number,
  triggered: boolean,
  inputs: Record<string, number>,
  metadata?: Record<string, string | number | boolean>,
): RiskEvent => ({
  id: `${rule.id}:${context.symbol}:${context.marketTime}`,
  ruleId: rule.id,
  triggered,
  severity: rule.severity,
  message: triggered ? `${rule.kind} 已触发` : `${rule.kind} 未触发`,
  evaluatedAt: new Date().toISOString(),
  context: {
    value,
    reference: rule.threshold,
    symbol: context.symbol,
    marketTime: context.marketTime,
    inputs,
    ...(metadata === undefined ? {} : { metadata }),
  },
});
