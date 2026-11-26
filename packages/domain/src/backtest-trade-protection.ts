import { DecimalValue as D } from './decimal.js';
import {
  getSeries,
  numericExpressionKey,
  evaluateBooleanExpression,
} from './backtest-simulation-evaluator.js';
import { isAvailableForDecisionAt } from './backtest-observation-clock.js';
import type {
  BacktestTradePlan,
  TradePlanProtectionActivationFields,
} from './backtest-trade-plan-contract.js';
import type { NumericExpression, BooleanExpression } from './backtest-strategy.js';
import type { SimulationExpressionContext } from './backtest-simulation.js';

export function tradePlanAtrExpression(source: {
  sourceId: string;
  period: number;
}): NumericExpression {
  return {
    type: 'indicator',
    name: 'ATR',
    input: { type: 'series', sourceId: source.sourceId, field: 'close' },
    params: { period: source.period },
  };
}

export function tradePlanIndicatorExpressions(
  plan: BacktestTradePlan | undefined,
): NumericExpression[] {
  const expressions: NumericExpression[] = [];
  if (plan?.initialStop?.kind === 'entryAtr')
    expressions.push(tradePlanAtrExpression(plan.initialStop));
  if (plan?.trailing?.kind === 'currentAtr')
    expressions.push(tradePlanAtrExpression(plan.trailing));
  return expressions;
}

export function tradePlanProtectionCondition(
  rule: TradePlanProtectionActivationFields | undefined,
) {
  return rule?.activation?.kind === 'condition' ? rule.activation.condition : undefined;
}

export function tradePlanProtectionRules(plan: BacktestTradePlan | undefined) {
  return (['initialStop', 'trailing'] as const).flatMap((key) => {
    const rule = plan?.[key];
    const expression = tradePlanProtectionCondition(rule);
    const path = ['tradePlan', key, 'activation', 'condition'];
    return expression ? [{ key, expression, path }] : [];
  });
}

/** 条件只负责启用，已启用状态不再读取条件，不会因后来的缺失而撤销。 */
export function protectionArmed(
  armed: boolean | undefined,
  condition: BooleanExpression | undefined,
  context: SimulationExpressionContext,
  ruleId?: string,
): boolean {
  if (armed || !condition) return true;
  const value = evaluateBooleanExpression(condition, context);
  if (ruleId) context.observeRule?.({ ruleId, evaluation: value, applicable: true, tick: context.tick });
  return (
    value.status === 'available' &&
    isAvailableForDecisionAt(value, context.tick.occurredAt) &&
    value.value
  );
}

/** 当前收盘的可见 ATR；缺失不能跨期沿用旧 ATR 更新保护。 */
export function currentTradePlanAtr(
  source: { sourceId: string; period: number },
  context: SimulationExpressionContext,
): D | undefined {
  const series = getSeries(
    context.indicatorSeries,
    numericExpressionKey(tradePlanAtrExpression(source)),
  );
  const point = series?.points.find(
    (p) => Date.parse(p.occurredAt) === Date.parse(context.tick.occurredAt),
  );
  if (
    !point ||
    Date.parse(point.valueOccurredAt ?? point.occurredAt) !== Date.parse(context.tick.occurredAt) ||
    point.status !== 'available' ||
    point.value === undefined ||
    !isAvailableForDecisionAt(point, context.tick.occurredAt)
  )
    return;
  const atr = D.from(point.value);
  return atr.isPositive() ? atr : undefined;
}

export function trailingProtectionLine(
  trailing: NonNullable<BacktestTradePlan['trailing']>,
  highClose: D,
  context: SimulationExpressionContext,
  diagnostics: string[],
): D | undefined {
  if (trailing.kind !== 'currentAtr')
    return highClose.times(D.from('1').minus(trailing.drawdownPercent));
  const atr = currentTradePlanAtr(trailing, context);
  if (!atr) {
    diagnostics.push(`${context.tick.occurredAt}:TRADE_PLAN_CURRENT_ATR_UNAVAILABLE`);
    return;
  }
  const line = highClose.minus(atr.times(trailing.multiple));
  if (line.isPositive()) return line;
  diagnostics.push(`${context.tick.occurredAt}:TRADE_PLAN_CURRENT_ATR_LINE_NON_POSITIVE`);
  return;
}
