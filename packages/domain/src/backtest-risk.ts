import { DecimalValue } from './decimal.js';
import type { StrategySchemaV2 } from './backtest-v2.js';

export interface RiskEvaluationFact {
  value: string;
  occurredAt: string;
  availableAt: string;
  completed: boolean;
  status?: 'available' | 'unavailable';
  reason?: string;
}

export interface RiskPosition {
  quantity: string;
  averageCost: string;
  holdingPeriods: number;
  occurredAt?: string;
  availableAt?: string;
}

export interface RiskEvaluationInput {
  runId: string;
  executionSymbol: string;
  rules: StrategySchemaV2['risk'];
  position: RiskPosition;
  evaluation: RiskEvaluationFact;
  evaluationAt: string;
}

export interface RiskIntent {
  intentId: string;
  signalId: string;
  executionSymbol: string;
  side: 'sell';
  reason: 'risk';
  trigger: 'fixedStop' | 'fixedTakeProfit' | 'maxHoldingPeriod';
  occurredAt: string;
  availableAt: string;
  inputFacts: readonly string[];
}

export interface RiskAvailable {
  status: 'available';
  triggeredRules: readonly RiskIntent['trigger'][];
  intent?: RiskIntent;
  occurredAt: string;
  availableAt: string;
  inputFacts: readonly string[];
}

export interface RiskUnavailable {
  status: 'unavailable';
  reasonCode: 'FACT_UNAVAILABLE' | 'FUTURE_DATA' | 'EVALUATION_INCOMPLETE' | 'NO_POSITION';
  reason: string;
  inputFacts: readonly string[];
}

export interface RiskRejected {
  status: 'rejected';
  reasonCode: 'INVALID_TIME' | 'INVALID_DECIMAL' | 'INVALID_PARAMETER' | 'UNSUPPORTED_RISK';
  reason: string;
  inputFacts: readonly string[];
}

export type RiskResult = RiskAvailable | RiskUnavailable | RiskRejected;

const instant = (value: string) => Date.parse(value);
const facts = (...values: string[]) => [...new Set(values)].sort();

const reject = (
  reasonCode: RiskRejected['reasonCode'],
  reason: string,
  inputFacts: readonly string[],
): RiskRejected => ({ status: 'rejected', reasonCode, reason, inputFacts: facts(...inputFacts) });

const unavailable = (
  reasonCode: RiskUnavailable['reasonCode'],
  reason: string,
  inputFacts: readonly string[],
): RiskUnavailable => ({
  status: 'unavailable',
  reasonCode,
  reason,
  inputFacts: facts(...inputFacts),
});

const parse = (value: string, label: string): DecimalValue | RiskRejected => {
  try {
    return DecimalValue.from(value);
  } catch {
    return reject('INVALID_DECIMAL', `${label} 不是规范十进制值`, [`${label}=${value}`]);
  }
};

const isDecimal = (value: DecimalValue | RiskRejected): value is DecimalValue =>
  value instanceof DecimalValue;

const validateTime = (value: string, label: string): RiskRejected | undefined =>
  Number.isFinite(instant(value))
    ? undefined
    : reject('INVALID_TIME', `${label} 时间无效`, [`${label}=${value}`]);

const validateEvaluation = (
  input: RiskEvaluationInput,
): RiskRejected | RiskUnavailable | undefined => {
  const invalidEvaluation = validateTime(input.evaluationAt, 'evaluationAt');
  if (invalidEvaluation) return invalidEvaluation;
  for (const [label, value] of [
    ['evaluation.occurredAt', input.evaluation.occurredAt],
    ['evaluation.availableAt', input.evaluation.availableAt],
  ] as const) {
    const invalid = validateTime(value, label);
    if (invalid) return invalid;
  }
  if (input.evaluation.status === 'unavailable') {
    return unavailable(
      'FACT_UNAVAILABLE',
      input.evaluation.reason ?? 'evaluation fact unavailable',
      ['evaluation.status=unavailable'],
    );
  }
  if (!input.evaluation.completed) {
    return unavailable('EVALUATION_INCOMPLETE', 'evaluation tick 尚未完成', [
      'evaluation.completed=false',
    ]);
  }
  if (instant(input.evaluation.availableAt) < instant(input.evaluation.occurredAt)) {
    return reject('INVALID_TIME', 'evaluation.availableAt 不能早于 occurredAt', [
      `evaluation.occurredAt=${input.evaluation.occurredAt}`,
      `evaluation.availableAt=${input.evaluation.availableAt}`,
    ]);
  }
  if (
    instant(input.evaluation.occurredAt) > instant(input.evaluationAt) ||
    instant(input.evaluation.availableAt) > instant(input.evaluationAt)
  ) {
    return unavailable('FUTURE_DATA', 'evaluation fact 在 evaluationAt 后才可用', [
      `evaluation.occurredAt=${input.evaluation.occurredAt}`,
      `evaluation.availableAt=${input.evaluation.availableAt}`,
      `evaluationAt=${input.evaluationAt}`,
    ]);
  }
  return undefined;
};

const validateRule = (rule: unknown): RiskRejected | undefined => {
  if (!rule || typeof rule !== 'object' || !('type' in rule)) {
    return reject('UNSUPPORTED_RISK', '风险规则类型不受支持', ['risk.type=unknown']);
  }
  if (rule.type === 'maxHoldingPeriod') {
    return 'periods' in rule &&
      typeof rule.periods === 'number' &&
      Number.isInteger(rule.periods) &&
      rule.periods > 0
      ? undefined
      : reject('INVALID_PARAMETER', 'maxHoldingPeriod.periods 必须为正整数', ['risk.periods']);
  }
  if (rule.type !== 'fixedStop' && rule.type !== 'fixedTakeProfit') {
    return reject('UNSUPPORTED_RISK', `不支持风险规则：${String(rule.type)}`, [
      `risk.type=${String(rule.type)}`,
    ]);
  }
  if (!('percent' in rule) || typeof rule.percent !== 'string') {
    return reject('INVALID_PARAMETER', `${rule.type}.percent 缺失`, [`risk.type=${rule.type}`]);
  }
  const percent = parse(rule.percent, `${rule.type}.percent`);
  if (!isDecimal(percent)) return percent;
  return !percent.isPositive() || percent.compareTo('1') > 0
    ? reject('INVALID_PARAMETER', `${rule.type}.percent 必须在 (0, 1] 内`, [
        `risk.percent=${rule.percent}`,
      ])
    : undefined;
};

interface ValidPosition {
  quantity: DecimalValue;
  averageCost: DecimalValue;
}

const validatePosition = (
  input: RiskEvaluationInput,
): ValidPosition | RiskRejected | RiskUnavailable => {
  const quantity = parse(input.position.quantity, 'position.quantity');
  const averageCost = parse(input.position.averageCost, 'position.averageCost');
  if (!isDecimal(quantity)) return quantity;
  if (!isDecimal(averageCost)) return averageCost;
  if (
    quantity.isNegative() ||
    averageCost.isNegative() ||
    !Number.isInteger(input.position.holdingPeriods) ||
    !Number.isFinite(input.position.holdingPeriods) ||
    input.position.holdingPeriods < 0
  ) {
    return reject('INVALID_PARAMETER', '持仓数量、平均成本和持有周期不能为负数', ['position']);
  }
  if (!quantity.isZero() && !averageCost.isPositive()) {
    return reject('INVALID_PARAMETER', '有持仓时平均成本必须为正数', ['position.averageCost']);
  }
  for (const [label, value] of [
    ['position.occurredAt', input.position.occurredAt],
    ['position.availableAt', input.position.availableAt],
  ] as const) {
    if (!value) continue;
    const invalid = validateTime(value, label);
    if (invalid) return invalid;
    if (instant(value) > instant(input.evaluationAt)) {
      return unavailable('FUTURE_DATA', `${label} 在 evaluationAt 后才可用`, [
        `${label}=${value}`,
        `evaluationAt=${input.evaluationAt}`,
      ]);
    }
  }
  if (
    input.position.occurredAt &&
    input.position.availableAt &&
    instant(input.position.availableAt) < instant(input.position.occurredAt)
  ) {
    return reject('INVALID_TIME', 'position.availableAt 不能早于 occurredAt', [
      `position.occurredAt=${input.position.occurredAt}`,
      `position.availableAt=${input.position.availableAt}`,
    ]);
  }
  return { quantity, averageCost };
};

const validateRules = (rules: RiskEvaluationInput['rules']): RiskRejected | undefined => {
  for (const rule of rules) {
    const invalid = validateRule(rule);
    if (invalid) return invalid;
  }
  return undefined;
};

const riskInputFacts = (input: RiskEvaluationInput) =>
  facts(
    `evaluation.occurredAt=${input.evaluation.occurredAt}`,
    `evaluation.availableAt=${input.evaluation.availableAt}`,
    `position.quantity=${input.position.quantity}`,
    `position.averageCost=${input.position.averageCost}`,
    ...(input.position.occurredAt ? [`position.occurredAt=${input.position.occurredAt}`] : []),
    ...(input.position.availableAt ? [`position.availableAt=${input.position.availableAt}`] : []),
  );

const consumedAvailableAt = (input: RiskEvaluationInput) =>
  [input.evaluation.availableAt, input.position.availableAt]
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => instant(right) - instant(left))[0] ?? input.evaluationAt;

const triggeredRulesAt = (
  input: RiskEvaluationInput,
  averageCost: DecimalValue,
  price: DecimalValue | undefined,
) => {
  const triggeredRules: RiskIntent['trigger'][] = [];
  for (const rule of input.rules) {
    if (rule.type === 'maxHoldingPeriod') {
      if (input.position.holdingPeriods >= rule.periods) triggeredRules.push(rule.type);
      continue;
    }
    const percent = DecimalValue.from(rule.percent);
    const threshold =
      rule.type === 'fixedStop'
        ? averageCost.times(DecimalValue.from('1').minus(percent))
        : averageCost.times(DecimalValue.from('1').plus(percent));
    const triggered =
      rule.type === 'fixedStop'
        ? price!.compareTo(threshold) <= 0
        : price!.compareTo(threshold) >= 0;
    if (triggered) triggeredRules.push(rule.type);
  }
  return triggeredRules;
};

const riskAvailable = (
  input: RiskEvaluationInput,
  triggeredRules: RiskIntent['trigger'][],
  inputFacts: readonly string[],
  availableAt: string,
): RiskAvailable => {
  if (triggeredRules.length === 0) {
    return {
      status: 'available',
      triggeredRules,
      occurredAt: input.evaluation.occurredAt,
      availableAt,
      inputFacts,
    };
  }
  const trigger = triggeredRules[0]!;
  const signalId = `${input.runId}:risk:${input.executionSymbol}:${input.evaluation.occurredAt}:${trigger}`;
  return {
    status: 'available',
    triggeredRules,
    intent: {
      intentId: `${signalId}:intent`,
      signalId,
      executionSymbol: input.executionSymbol,
      side: 'sell',
      reason: 'risk',
      trigger,
      occurredAt: input.evaluation.occurredAt,
      availableAt,
      inputFacts,
    },
    occurredAt: input.evaluation.occurredAt,
    availableAt,
    inputFacts,
  };
};

export const evaluateRiskAt = (input: RiskEvaluationInput): RiskResult => {
  const timing = validateEvaluation(input);
  if (timing) return timing;
  const position = validatePosition(input);
  if ('status' in position) return position;
  const invalidRule = validateRules(input.rules);
  if (invalidRule) return invalidRule;
  if (position.quantity.isZero()) {
    return unavailable('NO_POSITION', '当前没有多头持仓', ['position.quantity=0']);
  }
  const needsPrice = input.rules.some(
    (rule) => rule.type === 'fixedStop' || rule.type === 'fixedTakeProfit',
  );
  const price = needsPrice ? parse(input.evaluation.value, 'evaluation.value') : undefined;
  if (price && !isDecimal(price)) return price;
  if (price && !price.isPositive())
    return reject('INVALID_PARAMETER', '风险评估值必须为正数', ['evaluation.value']);
  const inputFacts = riskInputFacts(input);
  const availableAt = consumedAvailableAt(input);
  return riskAvailable(
    input,
    triggeredRulesAt(input, position.averageCost, price),
    inputFacts,
    availableAt,
  );
};
