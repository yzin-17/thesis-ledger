import { evaluateChipRule } from './chip-rules.js';
import { evaluateIndicatorRule } from './indicator-rules.js';
import { evaluatePortfolioRule } from './portfolio-rules.js';
import { evaluatePriceRule } from './price-rules.js';
import type { CompleteRiskContext, RiskEvent, RiskRule } from './types.js';

export * from './types.js';
export * from './statistics.js';
export * from './price-rules.js';
export * from './indicator-rules.js';
export * from './chip-rules.js';
export * from './portfolio-rules.js';

const ruleEvaluators: Partial<Record<RiskRule['kind'], (rule: RiskRule, context: CompleteRiskContext) => RiskEvent | null>> = {
  'fixed-stop': evaluatePriceRule,
  'cost-stop': evaluatePriceRule,
  'take-profit': evaluatePriceRule,
  'price-above': evaluatePriceRule,
  'price-below': evaluatePriceRule,
  'position-concentration': evaluatePriceRule,
  'trailing-stop': evaluatePriceRule,
  ma: evaluateIndicatorRule,
  rsi: evaluateIndicatorRule,
  macd: evaluateIndicatorRule,
  atr: evaluateIndicatorRule,
  volume: evaluateIndicatorRule,
  'chip-peak': evaluateChipRule,
  'chip-ratio': evaluateChipRule,
  'chip-migration': evaluateChipRule,
  drawdown: evaluatePortfolioRule,
  'sector-concentration': evaluatePortfolioRule,
  'asset-concentration': evaluatePortfolioRule,
  'volatility-exposure': evaluatePortfolioRule,
  correlation: evaluatePortfolioRule,
};

export const evaluateCompleteRule = (
  rule: RiskRule,
  context: CompleteRiskContext,
): RiskEvent | null => {
  if (!Object.hasOwn(ruleEvaluators, rule.kind)) return null;
  return ruleEvaluators[rule.kind]?.(rule, context) ?? null;
};
