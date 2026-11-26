import { describe, expect, it } from 'vitest';
import {
  evaluateBooleanExpression,
  evaluateNumericExpression,
  type BooleanExpression,
  type NumericExpression,
  type BacktestSeriesPoint,
  numericExpressionKey,
} from '@thesis-ledger/domain';
import { strategySchema } from '@thesis-ledger/schemas';
import {
  at,
  series,
  constant,
  breakout,
  definition,
  inputPoints,
  context,
} from './numeric-expression.fixtures.js';

const compare = (operator: 'lt' | 'gt' | 'eq', value: string): BooleanExpression => ({
  type: 'compare',
  operator,
  left: series('high'),
  right: constant(value),
});
const sequence: Extract<BooleanExpression, { type: 'sequence' }> = {
  type: 'sequence',
  trigger: compare('eq', '1'),
  confirm: compare('eq', '2'),
  invalidation: compare('lt', '0'),
  within: 5,
  allowSameBar: false,
  repeat: true,
};
const data = (values: string[]): BacktestSeriesPoint[] =>
  inputPoints(values.length).map((point, index) => ({ ...point, value: values[index]! }));
const result = (expression: BooleanExpression, values: string[]) =>
  evaluateBooleanExpression(expression, context(expression, data(values)));

describe('有限事件与冻结取样', () => {
  it('第 1 根开始，后续五根内的第 6 根可确认，第 7 根过期', () => {
    expect(definition(sequence).entry).toEqual(sequence);
    expect(result(sequence, ['1', '0', '0', '0', '0', '2'])).toMatchObject({
      status: 'available',
      value: true,
    });
    expect(result(sequence, ['1', '0', '0', '0', '0', '0', '2'])).toMatchObject({
      status: 'available',
      value: false,
    });
  });

  it('失效优先于确认；失效后旧开始不可再用，新开始可重新激活', () => {
    expect(result(sequence, ['1', '-1', '2'])).toMatchObject({ value: false });
    expect(result(sequence, ['1', '-1', '2', '1', '2'])).toMatchObject({ value: true });
    expect(result({ ...sequence, invalidation: compare('eq', '2') }, ['1', '2'])).toMatchObject({
      value: false,
    });
  });

  it('同根确认与一次／重复由配置决定', () => {
    const same = { ...sequence, confirm: compare('eq', '1') };
    expect(result(same, ['1'])).toMatchObject({ value: false });
    expect(result({ ...same, allowSameBar: true }, ['1'])).toMatchObject({ value: true });
    expect(result({ ...sequence, repeat: false }, ['1', '2', '1', '2'])).toMatchObject({
      value: false,
    });
    expect(result(sequence, ['1', '2', '1', '2'])).toMatchObject({ value: true });
  });

  it('确认使用触发时冻结值，后续更高输入不会改写捕获价', () => {
    const expression: BooleanExpression = {
      ...sequence,
      capture: series('high'),
      confirm: {
        type: 'compare',
        operator: 'gt',
        left: series('high'),
        right: {
          type: 'arithmetic',
          operator: 'multiply',
          left: { type: 'eventValue' },
          right: constant('1.5'),
        },
      },
    };
    expect(definition(expression).entry).toEqual(expression);
    expect(result(expression, ['1', '2'])).toMatchObject({ value: true });
    expect(result(expression, ['1', '1.4'])).toMatchObject({ value: false });
  });

  it('缺值取消等待，不以旧事件在后续生成信号', () => {
    const points = data(['1', '0', '2']);
    points[1] = { occurredAt: at(1), availableAt: at(1), status: 'unavailable' };
    expect(evaluateBooleanExpression(sequence, context(sequence, points))).toMatchObject({
      value: false,
    });
  });

  it('捕获值不可越出序列作用域，也不能嵌套序列或对捕获值做历史预计算', () => {
    const base = definition(breakout);
    for (const entry of [
      { type: 'compare', operator: 'gt', left: series('high'), right: { type: 'eventValue' } },
      { ...sequence, confirm: sequence },
      {
        ...sequence,
        capture: series('high'),
        confirm: {
          type: 'compare',
          operator: 'gt',
          left: series('high'),
          right: { type: 'lag', periods: 1, input: { type: 'eventValue' } },
        },
      },
    ])
      expect(strategySchema.safeParse({ ...base, entry }).success).toBe(false);
  });
});

describe('摆动点确认与确认时点', () => {
  const pivot: Extract<NumericExpression, { type: 'confirmedPivot' }> = {
    type: 'confirmedPivot',
    side: 'low',
    leftBars: 2,
    rightBars: 2,
    offset: 0,
    input: series('high'),
  };
  it('右侧两根尚未完成时不可用，完成后才返回低点值', () => {
    const points = data(['5', '4', '1', '3', '4']);
    expect(evaluateNumericExpression(pivot, context(pivot, points.slice(0, 4))).status).toBe(
      'unavailable',
    );
    const evaluation = context(pivot, points);
    expect(evaluateNumericExpression(pivot, evaluation)).toMatchObject({
      status: 'available',
      value: '1',
    });
    expect(
      evaluation.indicatorSeries.get(numericExpressionKey(pivot))?.points.at(-1)?.valueOccurredAt,
    ).toBe(at(2));
  });

  it('可分别读取两个已确认事件，不把前一根行情误当上一个摆动点', () => {
    const points = data(['5', '4', '2', '4', '5', '3', '1', '4', '5']);
    expect(evaluateNumericExpression(pivot, context(pivot, points))).toMatchObject({ value: '1' });
    const previous = { ...pivot, offset: 1 as const };
    expect(evaluateNumericExpression(previous, context(previous, points))).toMatchObject({
      value: '2',
    });
  });

  it('sample 在摆动点原时点取值，不在确认时点取样；相同低点不算严格摆动', () => {
    const sampled = {
      ...pivot,
      sample: { type: 'lag' as const, periods: 1, input: series('high') },
    };
    expect(
      evaluateNumericExpression(sampled, context(sampled, data(['5', '4', '1', '3', '4']))),
    ).toMatchObject({ value: '4' });
    expect(
      evaluateNumericExpression(pivot, context(pivot, data(['5', '4', '1', '1', '4']))).status,
    ).toBe('unavailable');
  });
});
