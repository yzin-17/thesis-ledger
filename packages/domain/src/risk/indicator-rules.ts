import { crossed, ratioThreshold } from './statistics.js';
import {
  completeRiskEvent,
  riskDirection,
  type CompleteRiskContext,
  type RiskEvent,
  type RiskRule,
} from './types.js';

function crossingOrLevel(previousLeft: number | undefined, previousRight: number | undefined, left: number, right: number, direction: 'above' | 'below'): boolean {
  if (previousLeft !== undefined && previousRight !== undefined)
    return crossed(previousLeft, previousRight, left, right, direction);
  if (direction === 'above') return left > right;
  return left < right;
}

function evaluateMovingAverageRule(rule: RiskRule, context: CompleteRiskContext): RiskEvent | null {
  const price = context.price;
  const ma = context.indicators?.ma;
  if (price === undefined || ma === undefined) return null;
  const direction = riskDirection(rule, 'below');
  const triggered = crossingOrLevel(context.indicators?.previousPrice, context.indicators?.previousMa, price, ma, direction);
  return completeRiskEvent(rule, context, price - ma, triggered, { price, ma }, { direction, valueMetric: 'ma_deviation' });
}

function evaluateMacdRule(rule: RiskRule, context: CompleteRiskContext): RiskEvent | null {
  const dif = context.indicators?.dif;
  const dea = context.indicators?.dea;
  if (dif === undefined || dea === undefined) return null;
  const direction = riskDirection(rule, 'below');
  const triggered = crossingOrLevel(context.indicators?.previousDif, context.indicators?.previousDea, dif, dea, direction);
  return completeRiskEvent(rule, context, dif - dea, triggered, { dif, dea }, { direction, valueMetric: 'macd_dea' });
}

export const evaluateIndicatorRule = (
  rule: RiskRule,
  context: CompleteRiskContext,
): RiskEvent | null => {
  if (rule.kind === 'ma') return evaluateMovingAverageRule(rule, context);
  if (rule.kind === 'rsi') {
    const value = context.indicators?.rsi;
    if (value === undefined) return null;
    const targetDirection = riskDirection(rule, 'below');
    return completeRiskEvent(
      rule,
      context,
      value,
      targetDirection === 'above' ? value > rule.threshold : value < rule.threshold,
      { rsi: value },
      { valueMetric: 'rsi' },
    );
  }
  if (rule.kind === 'macd') return evaluateMacdRule(rule, context);
  if (rule.kind === 'atr') {
    const result = ratioThreshold(context.indicators?.atr, context.price, rule.threshold);
    return result === null
      ? null
      : completeRiskEvent(
          rule,
          context,
          result.ratio,
          result.triggered,
          {
            atr: context.indicators!.atr!,
            price: context.price!,
          },
          { valueMetric: 'atr' },
        );
  }
  if (rule.kind === 'volume') {
    const result = ratioThreshold(
      context.indicators?.volume,
      context.indicators?.averageVolume,
      rule.threshold,
    );
    return result === null
      ? null
      : completeRiskEvent(rule, context, result.ratio, result.triggered, {
          volume: context.indicators!.volume!,
          averageVolume: context.indicators!.averageVolume!,
        });
  }
  return null;
};
