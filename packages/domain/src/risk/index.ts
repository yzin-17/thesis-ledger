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

export const evaluateCompleteRule = (
  rule: RiskRule,
  context: CompleteRiskContext,
): RiskEvent | null => {
  switch (rule.kind) {
    case 'fixed-stop':
    case 'cost-stop':
    case 'take-profit':
    case 'price-above':
    case 'price-below':
    case 'position-concentration':
    case 'trailing-stop':
      return evaluatePriceRule(rule, context);
    case 'ma':
    case 'rsi':
    case 'macd':
    case 'atr':
    case 'volume':
      return evaluateIndicatorRule(rule, context);
    case 'chip-peak':
    case 'chip-ratio':
    case 'chip-migration':
      return evaluateChipRule(rule, context);
    case 'drawdown':
    case 'sector-concentration':
    case 'asset-concentration':
    case 'volatility-exposure':
    case 'correlation':
      return evaluatePortfolioRule(rule, context);
    default:
      return null;
  }
};
