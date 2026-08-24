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
  accountName?: string;
  assetName?: string;
  positionId?: string;
  quantity?: number;
  positionUpdatedAt?: string;
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
  accountId?: string;
  accountName?: string;
  assetName?: string;
  positionId?: string;
  quantity?: number;
  positionUpdatedAt?: string;
  price?: number;
  costPrice?: number;
  weight?: number;
  accountWeight?: number;
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

const riskRuleKindLabels: Readonly<Record<string, string>> = {
  'price-below': '价格低于',
  'price-above': '价格高于',
  'cost-stop': '成本止损',
  'take-profit': '止盈',
  'position-concentration': '持仓集中度',
  'fixed-stop': '固定止损',
  'trailing-stop': '移动止损',
  drawdown: '回撤',
  ma: '均线',
  rsi: 'RSI',
  macd: 'MACD',
  atr: 'ATR',
  volume: '成交量',
  'chip-peak': '筹码峰',
  'chip-ratio': '筹码比例',
  'chip-migration': '筹码迁移',
  'sector-concentration': '行业集中度',
  'asset-concentration': '资产集中度',
  'volatility-exposure': '波动暴露',
  correlation: '组合相关性',
};

const percentageRuleKinds: ReadonlySet<string> = new Set([
  'cost-stop',
  'take-profit',
  'position-concentration',
  'trailing-stop',
]);

export const riskRuleKindLabel = (kind: string) => riskRuleKindLabels[kind] ?? kind;

export const formatRiskRuleThreshold = (kind: string, threshold: number) => {
  const percentage = percentageRuleKinds.has(kind);
  const value = percentage ? threshold * 100 : threshold;
  const formatted = percentage
    ? value.toLocaleString('zh-CN')
    : value.toLocaleString('zh-CN', { maximumFractionDigits: 6 });
  return percentage ? `${formatted}%` : formatted;
};

export const formatRiskEventName = (
  rule: Pick<RiskRule, 'kind' | 'threshold'>,
  context: {
    symbol?: string;
    accountId?: string;
    accountName?: string;
    assetName?: string;
  },
) => {
  let target = '组合';
  if (context.symbol === '@portfolio') {
    target = '组合';
  } else if (context.symbol?.startsWith('@account:')) {
    target = context.accountName ?? '指定账户';
  } else {
    const targetParts: string[] = [];
    if (context.symbol) targetParts.push(context.symbol);
    if (context.assetName && context.assetName !== context.symbol)
      targetParts.push(context.assetName);
    if (context.accountName) targetParts.push(context.accountName);
    else if (context.accountId) targetParts.push('指定账户');
    if (targetParts.length > 0) target = targetParts.join(' · ');
  }
  return `${target} · ${riskRuleKindLabel(rule.kind)} ${formatRiskRuleThreshold(rule.kind, rule.threshold)}`;
};

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
  id: `${rule.id}:${context.accountId ?? 'all'}:${context.symbol}:${context.marketTime}`,
  ruleId: rule.id,
  triggered,
  severity: rule.severity,
  message: `${formatRiskEventName(rule, context)} ${triggered ? '已触发' : '未触发'}`,
  evaluatedAt: new Date().toISOString(),
  context: {
    value,
    reference: rule.threshold,
    ...(context.accountId === undefined ? {} : { accountId: context.accountId }),
    ...(context.accountName === undefined ? {} : { accountName: context.accountName }),
    ...(context.assetName === undefined ? {} : { assetName: context.assetName }),
    ...(context.positionId === undefined ? {} : { positionId: context.positionId }),
    ...(context.quantity === undefined ? {} : { quantity: context.quantity }),
    ...(context.positionUpdatedAt === undefined
      ? {}
      : { positionUpdatedAt: context.positionUpdatedAt }),
    symbol: context.symbol,
    marketTime: context.marketTime,
    inputs,
    ...(metadata === undefined ? {} : { metadata }),
  },
});
