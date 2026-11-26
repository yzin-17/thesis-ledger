import type { BooleanExpression as B, NumericExpression as N } from './backtest-strategy.js';
import type { BacktestTradePlan } from './backtest-trade-plan-contract.js';

const value = (value: string): N => ({ type: 'constant', value });
const series = (field: 'open' | 'high' | 'low' | 'close' | 'volume', sourceId = 'd'): N => ({ type: 'series', sourceId, field });
const compare = (operator: 'gt' | 'gte' | 'lt' | 'lte', left: N, right: N): B => ({ type: 'compare', operator, left, right });
const indicator = (name: 'MA' | 'EMA' | 'Highest' | 'RSI', period: number, input: N): N => ({ type: 'indicator', name, input, params: { period } });
const arithmetic = (operator: 'divide' | 'subtract' | 'multiply', left: N, right: N): N => ({ type: 'arithmetic', operator, left, right });

/** 文档示例，不读取用户文本，也不装配本次业务策略。参数故意区别于验收样本。 */
export function backtestGenerationExamplesV6() {
  const close = series('close');
  const priorHigh: N = { type: 'lag', periods: 1, input: indicator('Highest', 12, series('high')) };
  const width = arithmetic('divide', { type: 'rolling', statistic: 'standardDeviation', periods: 12,
    ddof: 0, input: close }, indicator('MA', 12, close));
  const gap: N = { type: 'absolute', input: arithmetic('subtract', arithmetic('divide',
    series('open'), { type: 'lag', periods: 1, input: close }), value('1')) };
  const cumulative: N = { type: 'cumulative', statistic: 'sum', anchorAt: '2026-01-05T15:00:00+08:00', input: series('volume') };
  return {
    flat: { type: 'not', expression: { type: 'positionState', field: 'isOpen' } },
    count: compare('gte', { type: 'countTrue', periods: 7,
      condition: compare('gt', close, series('open')) }, value('4')),
    consecutive: { type: 'consecutive', periods: 2, condition: compare('gt', close, indicator('EMA', 12, close)) },
    mixedComparisonBoundaries: { type: 'all', conditions: [
      compare('lte', width, { type: 'rolling', statistic: 'quantile', periods: 40, quantile: '0.25', input: width }),
      compare('lt', gap, value('0.03')),
    ] },
    latestHour: compare('gt', series('close', 'h'), indicator('MA', 4, series('close', 'h'))),
    previousDailyCumulative: compare('gt', cumulative, { type: 'lag', periods: 1, input: cumulative }),
    frozenBreakout: { type: 'sequence', trigger: compare('gt', close, priorHigh), capture: priorHigh,
      confirm: compare('gt', close, arithmetic('multiply', { type: 'eventValue' }, value('1.03'))),
      invalidation: compare('lt', close, { type: 'eventValue' }), within: 6, allowSameBar: false, repeat: true },
    sessionDeviation: compare('lt', { type: 'absolute', input: arithmetic('subtract',
      arithmetic('divide', series('close', 'm'), { type: 'sessionValue', sourceId: 'm', field: 'vwap' }), value('1')) }, value('0.015')),
  } satisfies Record<string, B>;
}

export function backtestProtectionExamplesV6() {
  const immediate = {
    version: 1,
    evaluation: 'barClose',
    stages: [],
    initialStop: { kind: 'percent', percent: '0.08', activation: { kind: 'immediate' } },
  } satisfies BacktestTradePlan;
  return {
    immediate,
    afterHoldingTwoBars: {
      ...immediate,
      initialStop: {
        ...immediate.initialStop,
        activation: {
          kind: 'condition',
          condition: compare('gte', { type: 'positionState', field: 'holdingPeriods' }, value('2')),
        },
      },
    },
  } satisfies Record<string, BacktestTradePlan>;
}
