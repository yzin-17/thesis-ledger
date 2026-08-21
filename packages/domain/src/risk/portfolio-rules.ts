import { concentratedExposure, currentDrawdown, pearsonCorrelation } from './statistics.js';
import {
  completeRiskEvent,
  riskParameter,
  type CompleteRiskContext,
  type RiskEvent,
  type RiskRule,
} from './types.js';

export const evaluatePortfolioRule = (
  rule: RiskRule,
  context: CompleteRiskContext,
): RiskEvent | null => {
  if (rule.kind === 'drawdown') {
    const value = currentDrawdown(context.portfolioValues ?? []);
    return value === null
      ? null
      : completeRiskEvent(rule, context, value, value < -Math.abs(rule.threshold), {
          observations: context.portfolioValues?.length ?? 0,
        });
  }
  if (rule.kind === 'sector-concentration' || rule.kind === 'asset-concentration') {
    if (!context.positions?.length) return null;
    const key = rule.kind === 'sector-concentration' ? 'sector' : 'assetType';
    const result = concentratedExposure(
      context.positions.map((position) => ({
        symbol: position.symbol,
        ...(position[key] === undefined ? {} : { key: position[key] }),
        weight: position.weight,
      })),
      rule.threshold,
    );
    const top = result.exposures[0];
    return top
      ? completeRiskEvent(
          rule,
          context,
          top.weight,
          top.triggered,
          { coverage: result.coverage, missingCount: result.missingCount },
          { topGroup: top.key, missingSymbols: result.missingSymbols.join(',') },
        )
      : null;
  }
  if (rule.kind === 'volatility-exposure') {
    if (!context.positions?.length) return null;
    const assetThreshold = riskParameter(rule, 'assetThreshold', 0.3);
    const known = context.positions.filter((position) => position.volatility !== undefined);
    if (!known.length) return null;
    const value = known.reduce(
      (sum, position) => sum + (position.volatility! > assetThreshold ? position.weight : 0),
      0,
    );
    return completeRiskEvent(rule, context, value, value > rule.threshold, {
      assetThreshold,
      coverage: known.reduce((sum, position) => sum + position.weight, 0),
    });
  }
  if (rule.kind === 'correlation') {
    const entries = Object.entries(context.returns ?? {});
    if (entries.length < 2) return null;
    let maximum: number | null = null;
    for (let left = 0; left < entries.length; left += 1) {
      for (let right = left + 1; right < entries.length; right += 1) {
        const correlation = pearsonCorrelation(entries[left]![1], entries[right]![1]);
        if (correlation !== null && (maximum === null || correlation > maximum))
          maximum = correlation;
      }
    }
    return maximum === null
      ? null
      : completeRiskEvent(rule, context, maximum, maximum > rule.threshold, {
          seriesCount: entries.length,
        });
  }
  return null;
};
