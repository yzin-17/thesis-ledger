import { describe, expect, it } from 'vitest';
import {
  evaluateBooleanExpression,
  evaluateNumericExpression,
  strategyRequiredLookback,
  type BooleanExpression,
  type NumericExpression,
  type BacktestSeriesPoint,
} from '@thesis-ledger/domain';
import { strategySchema, priceResearchStrategySummary } from '@thesis-ledger/schemas';
import {
  at,
  series,
  constant,
  breakout,
  definition,
  inputPoints,
  context,
} from './numeric-expression.fixtures.js';

const positive: BooleanExpression = {
  type: 'compare',
  operator: 'gt',
  left: series('high'),
  right: constant('0'),
};
const data = (values: string[]): BacktestSeriesPoint[] =>
  inputPoints(values.length).map((point, index) => ({ ...point, value: values[index]! }));
const evaluate = (expression: NumericExpression, values: string[]) =>
  evaluateNumericExpression(expression, context(expression, data(values)));

describe('逐根条件和窗口统计', () => {
  it('真、假、真、假、真满足五中取三，但不满足连续三根', () => {
    const points = data(['1', '-1', '1', '-1', '1']);
    const count: NumericExpression = { type: 'countTrue', periods: 5, condition: positive };
    const consecutive: BooleanExpression = { type: 'consecutive', periods: 3, condition: positive };
    expect(evaluateNumericExpression(count, context(count, points))).toMatchObject({
      status: 'available',
      value: '3',
    });
    expect(evaluateBooleanExpression(consecutive, context(consecutive, points))).toMatchObject({
      status: 'available',
      value: false,
    });
    const entry: BooleanExpression = {
      type: 'compare',
      operator: 'gte',
      left: count,
      right: constant('3'),
    };
    expect(definition(entry).entry).toEqual(entry);
    expect(priceResearchStrategySummary(definition(entry)).entry).toContain('最近 5 根');
  });

  it('连续确认比较每一根自己的均线，不用当根均线替换历史均线', () => {
    const ma: NumericExpression = {
      type: 'indicator',
      name: 'MA',
      input: series('high'),
      params: { period: 2 },
    };
    const expression: BooleanExpression = {
      type: 'consecutive',
      periods: 3,
      condition: { type: 'compare', operator: 'gt', left: series('high'), right: ma },
    };
    const points = data(['1', '2', '3', '4']);
    expect(strategyRequiredLookback({ entry: expression, exit: positive }).entry).toBe(4);
    expect(evaluateBooleanExpression(expression, context(expression, points))).toMatchObject({
      status: 'available',
      value: true,
    });
    expect(
      evaluateBooleanExpression(expression, context(expression, data(['1', '2', '1', '4']))),
    ).toMatchObject({ status: 'available', value: false });
  });

  it('不足完整窗口或其中一根缺失时不可用', () => {
    const expression: NumericExpression = { type: 'countTrue', periods: 5, condition: positive };
    expect(evaluate(expression, ['1', '1', '1', '1']).status).toBe('unavailable');
    const points = data(['1', '1', '1', '1', '1']);
    points[2] = { occurredAt: at(2), availableAt: at(2), status: 'unavailable' };
    expect(evaluateNumericExpression(expression, context(expression, points)).status).toBe(
      'unavailable',
    );
  });

  it.each([
    ['sum', undefined, undefined, '6'],
    ['standardDeviation', 1, undefined, '1'],
    ['standardDeviation', 0, undefined, '0.81649658092772603273'],
    ['quantile', undefined, '0.25', '1.5'],
    ['quantile', undefined, '0', '1'],
    ['quantile', undefined, '1', '3'],
  ] as const)('%s 明确算法参数并获得独立黄金值 %s %s %s', (statistic, ddof, quantile, value) => {
    const expression: NumericExpression = {
      type: 'rolling',
      statistic,
      periods: 3,
      input: series('high'),
      ...(ddof === undefined ? {} : { ddof }),
      ...(quantile === undefined ? {} : { quantile }),
    };
    const entry: BooleanExpression = {
      type: 'compare',
      operator: 'gte',
      left: expression,
      right: constant('0'),
    };
    expect(definition(entry).entry).toEqual(entry);
    expect(evaluate(expression, ['1', '2', '3'])).toMatchObject({ status: 'available', value });
  });

  it('均值相同但波动不同，标准差和布林带宽不同', () => {
    const std: NumericExpression = {
      type: 'rolling',
      statistic: 'standardDeviation',
      periods: 4,
      ddof: 0,
      input: series('high'),
    };
    expect(evaluate(std, ['1', '1', '1', '1'])).toMatchObject({ value: '0' });
    expect(evaluate(std, ['0', '0', '2', '2'])).toMatchObject({ value: '1' });
  });

  it('锚定累计从指定观测开始，缺锚点覆盖时不伪造累计值', () => {
    const expression: NumericExpression = {
      type: 'cumulative',
      statistic: 'sum',
      anchorAt: at(1),
      input: series('high'),
    };
    expect(evaluate(expression, ['10', '2', '3'])).toMatchObject({
      status: 'available',
      value: '5',
    });
    const uncovered = { ...expression, anchorAt: '2025-01-01T00:00:00Z' };
    expect(evaluate(uncovered, ['10', '2', '3']).status).toBe('unavailable');
  });

  it('标准差自由度、分位参数、动态持仓窗口与未知字段都必须通过正式校验', () => {
    const base = definition(breakout);
    for (const left of [
      { type: 'rolling', statistic: 'standardDeviation', periods: 3, input: series('high') },
      {
        type: 'rolling',
        statistic: 'standardDeviation',
        periods: 1,
        ddof: 1,
        input: series('high'),
      },
      { type: 'rolling', statistic: 'sum', periods: 3, ddof: 0, input: series('high') },
      {
        type: 'rolling',
        statistic: 'quantile',
        periods: 3,
        quantile: '1.01',
        input: series('high'),
      },
      { type: 'countTrue', periods: 3, condition: { type: 'positionState', field: 'isOpen' } },
    ])
      expect(
        strategySchema.safeParse({
          ...base,
          entry: { type: 'compare', operator: 'gt', left, right: constant('0') },
        }).success,
      ).toBe(false);
  });
});
