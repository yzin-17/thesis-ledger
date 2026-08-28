import { crossed, ratioThreshold } from './statistics.js';
import {
  completeRiskEvent,
  riskDirection,
  type CompleteRiskContext,
  type RiskEvent,
  type RiskRule,
} from './types.js';

export const evaluateIndicatorRule = (
  rule: RiskRule,
  context: CompleteRiskContext,
): RiskEvent | null => {
  if (rule.kind === 'ma') {
    const price = context.price;
    const ma = context.indicators?.ma;
    if (price === undefined || ma === undefined) return null;
    const targetDirection = riskDirection(rule, 'below');
    const previousPrice = context.indicators?.previousPrice;
    const previousMa = context.indicators?.previousMa;
    const triggered =
      previousPrice === undefined || previousMa === undefined
        ? targetDirection === 'above'
          ? price > ma
          : price < ma
        : crossed(previousPrice, previousMa, price, ma, targetDirection);
    return completeRiskEvent(
      rule,
      context,
      price - ma,
      triggered,
      { price, ma },
      { direction: targetDirection },
    );
  }
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
    );
  }
  if (rule.kind === 'macd') {
    const dif = context.indicators?.dif;
    const dea = context.indicators?.dea;
    if (dif === undefined || dea === undefined) return null;
    const targetDirection = riskDirection(rule, 'below');
    const previousDif = context.indicators?.previousDif;
    const previousDea = context.indicators?.previousDea;
    const triggered =
      previousDif === undefined || previousDea === undefined
        ? targetDirection === 'above'
          ? dif > dea
          : dif < dea
        : crossed(previousDif, previousDea, dif, dea, targetDirection);
    return completeRiskEvent(
      rule,
      context,
      dif - dea,
      triggered,
      { dif, dea },
      { direction: targetDirection },
    );
  }
  if (rule.kind === 'atr') {
    const result = ratioThreshold(context.indicators?.atr, context.price, rule.threshold);
    return result === null
      ? null
      : completeRiskEvent(rule, context, result.ratio, result.triggered, {
          atr: context.indicators!.atr!,
          price: context.price!,
        });
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
