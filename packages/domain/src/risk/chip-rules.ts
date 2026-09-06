import {
  completeRiskEvent,
  riskDirection,
  type CompleteRiskContext,
  type RiskEvent,
  type RiskRule,
} from './types.js';

export const evaluateChipRule = (
  rule: RiskRule,
  context: CompleteRiskContext,
): RiskEvent | null => {
  if (rule.kind === 'chip-peak') {
    if (
      context.price === undefined ||
      context.chip === undefined ||
      context.chip.mainPeak === undefined
    )
      return null;
    const value = context.price / context.chip.mainPeak - 1;
    const targetDirection = riskDirection(rule, 'below');
    const triggered =
      targetDirection === 'above'
        ? value > Math.abs(rule.threshold)
        : value < -Math.abs(rule.threshold);
    return completeRiskEvent(
      rule,
      context,
      value,
      triggered,
      { price: context.price, mainPeak: context.chip.mainPeak },
      {
        direction: targetDirection,
        valueMetric: 'chip_main_peak',
        chipEngineVersion: context.chip.engineVersion,
        chipCalculatedAt: context.chip.calculatedAt,
      },
    );
  }
  if (rule.kind === 'chip-ratio') {
    if (context.chip === undefined) return null;
    if (context.chip.calculatedAt.slice(0, 10) !== context.marketTime.slice(0, 10)) return null;
    const metric = rule.parameters?.metric === 'concentration' ? 'concentration' : 'profitRatio';
    const value = context.chip[metric];
    return completeRiskEvent(
      rule,
      context,
      value,
      value > rule.threshold,
      { [metric]: value },
      {
        metric,
        chipEngineVersion: context.chip.engineVersion,
        chipCalculatedAt: context.chip.calculatedAt,
      },
    );
  }
  if (rule.kind === 'chip-migration') {
    const history = context.chip?.previousMainPeaks;
    if (!context.chip || context.chip.mainPeak === undefined || !history?.length) return null;
    const previousPeak = history.at(-1)!;
    if (previousPeak <= 0) return null;
    const value = context.chip.mainPeak / previousPeak - 1;
    const targetDirection = riskDirection(rule, 'below');
    const triggered =
      targetDirection === 'above'
        ? value > Math.abs(rule.threshold)
        : value < -Math.abs(rule.threshold);
    return completeRiskEvent(
      rule,
      context,
      value,
      triggered,
      { previousPeak, mainPeak: context.chip.mainPeak },
      {
        direction: targetDirection,
        chipEngineVersion: context.chip.engineVersion,
        chipCalculatedAt: context.chip.calculatedAt,
      },
    );
  }
  return null;
};
