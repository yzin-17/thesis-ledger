import { DecimalValue as D } from './decimal.js';
import { finishBacktestComputation } from './backtest-computation.js';
import type { BacktestAnalyticsResult } from './backtest-result-analytics.js';
import type { BacktestMetric } from './backtest-contract.js';

export const RESEARCH_ANALYTICS_VERSION = 'research-analytics-v2' as const;
type ActivityFill = { quantity: string; price: string; occurredAt?: string };
type NotionalConversion = (notional: string, fill: ActivityFill) => BacktestMetric;

/** 只消费已经形成的成交；申请、费用和公司行动不进入成交额。 */
export function* researchTradeActivitySteps(
  fills: readonly ActivityFill[],
  initialCash: string | BacktestMetric,
  convertNotional?: NotionalConversion,
): Generator<void, { tradedNotional: BacktestMetric; turnoverRate: BacktestMetric }, void> {
  let notional = D.from('0');
  for (const fill of fills) {
    yield;
    const quantity = D.from(fill.quantity);
    const price = D.from(fill.price);
    if (!quantity.isPositive() || !price.isPositive()) throw new Error('成交数量和价格必须为正');
    const amount = quantity.times(price).toString();
    const converted = convertNotional?.(amount, fill) ?? { status: 'available', value: amount };
    if (converted.status !== 'available' || converted.value === undefined)
      return { tradedNotional: converted, turnoverRate: converted };
    notional = notional.plus(converted.value);
  }
  const capitalMetric: BacktestMetric = typeof initialCash === 'string'
    ? { status: 'available', value: initialCash } : initialCash;
  if (capitalMetric.status !== 'available' || capitalMetric.value === undefined)
    return { tradedNotional: { status: 'available', value: notional.toString() }, turnoverRate: capitalMetric };
  const capital = D.from(capitalMetric.value);
  return {
    tradedNotional: { status: 'available', value: notional.toString() },
    turnoverRate: capital.isPositive()
      ? { status: 'available', value: notional.dividedBy(capital).toString() }
      : { status: 'unavailable', reason: 'INITIAL_CAPITAL_NOT_POSITIVE' },
  };
}

export const researchTradeActivity = (...input: Parameters<typeof researchTradeActivitySteps>) => finishBacktestComputation(researchTradeActivitySteps(...input));

/** 新分析移除旧金额别名；其余分析结果与原始历史读取相互独立。 */
export function* researchAnalyticsV2Steps(
  analytics: BacktestAnalyticsResult,
  fills: readonly ActivityFill[],
  initialCash: string | BacktestMetric,
  convertNotional?: NotionalConversion,
) {
  const metrics = { ...analytics.metrics };
  delete metrics.turnover;
  return { analyticsVersion: RESEARCH_ANALYTICS_VERSION,
    metrics: { ...metrics, ...(yield* researchTradeActivitySteps(fills, initialCash, convertNotional)) } };
}

export const researchAnalyticsV2 = (...input: Parameters<typeof researchAnalyticsV2Steps>) => finishBacktestComputation(researchAnalyticsV2Steps(...input));
