import { DecimalValue } from './decimal.js';

export type StrategyMonitoringEvaluationState =
  | 'triggered'
  | 'not_triggered'
  | 'unavailable'
  | 'not_applicable';

export type StrategyMonitoringRule = {
  sourceKey: string;
  sourceRiskIndex: number;
  semanticVersion: 'strategy-monitoring-v1';
  kind: 'cost-stop' | 'take-profit' | 'max-holding-period';
  label: string;
  metric: 'priceToAverageCostReturn' | 'holdingPeriods';
  operator: 'lte' | 'gte';
  threshold: string;
  evaluationTimeframe: string;
  costBasisPolicy: 'account-projection-average-cost-including-known-fees';
};

export type StrategyMonitoringCoverageItem = {
  source: string;
  category: 'risk' | 'exit' | 'sizing' | 'entry';
  status: 'mapped' | 'not_risk' | 'unsupported';
  reason: string;
};

export type StrategyMonitoringPlan = {
  semanticVersion: 'strategy-monitoring-v1';
  strategyVersionId?: string;
  strategyHash: string;
  planHash: string;
  executionSymbol: string;
  evaluationTimeframe: string;
  rules: StrategyMonitoringRule[];
  coverage: {
    riskTotal: number;
    riskMapped: number;
    items: StrategyMonitoringCoverageItem[];
  };
};

export type StrategyMonitoringEvaluation = {
  sourceKey: string;
  state: StrategyMonitoringEvaluationState;
  value?: string;
  threshold: string;
  reason?: string;
  occurredAt?: string;
  availableAt?: string;
};

type V2RiskInput =
  | { type: 'fixedStop'; percent: string }
  | { type: 'fixedTakeProfit'; percent: string }
  | { type: 'maxHoldingPeriod'; periods: number }
  | { type: string; [key: string]: unknown };

type StrategyMonitoringInput = {
  executionInstrument: { symbol: string };
  primaryTimeframe: string;
  risk: readonly V2RiskInput[];
  entry?: unknown;
  exit?: unknown;
  sizing?: unknown;
};

const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, stableValue(entry)]),
  );
};

export const canonicalStrategyMonitoringJson = (value: unknown) => JSON.stringify(stableValue(value));

// Stable non-cryptographic fingerprint for pure domain use. Persistence/API layers
// use SHA-256 when a cryptographic content hash is required.
export const strategyMonitoringFingerprint = (value: unknown) => {
  const text = canonicalStrategyMonitoringJson(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a32:${hash.toString(16).padStart(8, '0')}`;
};

const negate = (value: string) => {
  const parsed = DecimalValue.from(value);
  return parsed.isZero() ? '0' : DecimalValue.from('0').minus(parsed).toString();
};

const riskRule = (
  risk: V2RiskInput,
  index: number,
  timeframe: string,
): StrategyMonitoringRule | null => {
  if (risk.type === 'fixedStop' && typeof risk.percent === 'string') {
    return {
      sourceKey: `risk:${index}:fixedStop`,
      sourceRiskIndex: index,
      semanticVersion: 'strategy-monitoring-v1',
      kind: 'cost-stop',
      label: '成本止损',
      metric: 'priceToAverageCostReturn',
      operator: 'lte',
      threshold: negate(risk.percent),
      evaluationTimeframe: timeframe,
      costBasisPolicy: 'account-projection-average-cost-including-known-fees',
    };
  }
  if (risk.type === 'fixedTakeProfit' && typeof risk.percent === 'string') {
    return {
      sourceKey: `risk:${index}:fixedTakeProfit`,
      sourceRiskIndex: index,
      semanticVersion: 'strategy-monitoring-v1',
      kind: 'take-profit',
      label: '成本止盈',
      metric: 'priceToAverageCostReturn',
      operator: 'gte',
      threshold: DecimalValue.from(risk.percent).toString(),
      evaluationTimeframe: timeframe,
      costBasisPolicy: 'account-projection-average-cost-including-known-fees',
    };
  }
  const holdingPeriods = risk.periods;
  if (
    risk.type === 'maxHoldingPeriod' &&
    typeof holdingPeriods === 'number' &&
    Number.isInteger(holdingPeriods) &&
    holdingPeriods > 0
  ) {
    return {
      sourceKey: `risk:${index}:maxHoldingPeriod`,
      sourceRiskIndex: index,
      semanticVersion: 'strategy-monitoring-v1',
      kind: 'max-holding-period',
      label: '最大持有周期',
      metric: 'holdingPeriods',
      operator: 'gte',
      threshold: String(holdingPeriods),
      evaluationTimeframe: timeframe,
      costBasisPolicy: 'account-projection-average-cost-including-known-fees',
    };
  }
  return null;
};

export const compileStrategyMonitoringPlan = (
  strategy: StrategyMonitoringInput,
  strategyHash: string,
  strategyVersionId?: string,
): StrategyMonitoringPlan => {
  const rules: StrategyMonitoringRule[] = [];
  const items: StrategyMonitoringCoverageItem[] = [];
  for (const [index, risk] of strategy.risk.entries()) {
    const compiled = riskRule(risk, index, strategy.primaryTimeframe);
    if (compiled) {
      rules.push(compiled);
      items.push({
        source: `risk:${index}:${risk.type}`,
        category: 'risk',
        status: 'mapped',
        reason: `已映射为${compiled.label}`,
      });
    } else {
      items.push({
        source: `risk:${index}:${risk.type}`,
        category: 'risk',
        status: 'unsupported',
        reason: '该风险类型尚未映射为实际监控规则',
      });
    }
  }
  items.push(
    { source: 'entry', category: 'entry', status: 'not_risk', reason: '入场条件不是风险监控规则' },
    { source: 'sizing', category: 'sizing', status: 'not_risk', reason: '仓位配置不是风险触发规则' },
    {
      source: 'exit',
      category: 'exit',
      status: 'unsupported',
      reason: '技术离场表达式首版不映射为实际风险监控规则',
    },
  );
  const base = {
    semanticVersion: 'strategy-monitoring-v1' as const,
    ...(strategyVersionId === undefined ? {} : { strategyVersionId }),
    strategyHash,
    executionSymbol: strategy.executionInstrument.symbol,
    evaluationTimeframe: strategy.primaryTimeframe,
    rules,
    coverage: { riskTotal: strategy.risk.length, riskMapped: rules.length, items },
  };
  return { ...base, planHash: strategyMonitoringFingerprint(base) };
};

export type StrategyMonitoringContext = {
  quantity?: string;
  price?: string;
  averageCost?: string;
  holdingPeriods?: number;
  occurredAt?: string;
  availableAt?: string;
};

const evaluationBase = (
  rule: StrategyMonitoringRule,
  context: StrategyMonitoringContext,
) => ({
  sourceKey: rule.sourceKey,
  threshold: rule.threshold,
  ...(context.occurredAt === undefined ? {} : { occurredAt: context.occurredAt }),
  ...(context.availableAt === undefined ? {} : { availableAt: context.availableAt }),
});

export const evaluateStrategyMonitoringRule = (
  rule: StrategyMonitoringRule,
  context: StrategyMonitoringContext,
): StrategyMonitoringEvaluation => {
  const base = evaluationBase(rule, context);
  if (context.quantity === undefined) {
    return { ...base, state: 'unavailable', reason: '缺少实际持仓数量' };
  }
  let quantity: DecimalValue;
  try {
    quantity = DecimalValue.from(context.quantity);
  } catch {
    return { ...base, state: 'unavailable', reason: '实际持仓数量无效' };
  }
  if (!quantity.isPositive()) return { ...base, state: 'not_applicable', reason: '当前无有效持仓' };

  if (rule.metric === 'holdingPeriods') {
    if (context.holdingPeriods === undefined || !Number.isInteger(context.holdingPeriods)) {
      return { ...base, state: 'unavailable', reason: '缺少可验证的持有周期起点' };
    }
    const value = String(context.holdingPeriods);
    const triggered = DecimalValue.from(value).compareTo(rule.threshold) >= 0;
    return { ...base, state: triggered ? 'triggered' : 'not_triggered', value };
  }

  if (context.price === undefined) return { ...base, state: 'unavailable', reason: '缺少已完成评价时点价格' };
  if (context.averageCost === undefined)
    return { ...base, state: 'unavailable', reason: '缺少账户投影平均成本' };
  let price: DecimalValue;
  let averageCost: DecimalValue;
  try {
    price = DecimalValue.from(context.price);
    averageCost = DecimalValue.from(context.averageCost);
  } catch {
    return { ...base, state: 'unavailable', reason: '价格或平均成本无效' };
  }
  if (!averageCost.isPositive()) return { ...base, state: 'unavailable', reason: '平均成本必须大于零' };
  const value = price.dividedBy(averageCost).minus('1').toString();
  const comparison = DecimalValue.from(value).compareTo(rule.threshold);
  const triggered = rule.operator === 'lte' ? comparison <= 0 : comparison >= 0;
  return { ...base, state: triggered ? 'triggered' : 'not_triggered', value };
};

export const evaluateStrategyMonitoringPlan = (
  plan: StrategyMonitoringPlan,
  context: StrategyMonitoringContext,
) => plan.rules.map((rule) => evaluateStrategyMonitoringRule(rule, context));
