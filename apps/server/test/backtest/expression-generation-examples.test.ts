import { expect, it } from 'vitest';
import { evaluateNumericExpression, evaluateBooleanExpression } from '@thesis-ledger/domain';
import { numericExpressionSchema } from '@thesis-ledger/schemas';
import { discoveryExpressionExamples } from '../../src/strategy-optimization/strategy-discovery-generation-prompt.js';
import { context, inputPoints } from './numeric-expression.fixtures.js';

it('模型实际示例的前窗最高排除当根，也不同于只取前一根high', () => {
  const sample = discoveryExpressionExamples('primary');
  const points = inputPoints(21).map((point, i) => ({
    ...point,
    value: i === 19 ? '90' : i === 20 ? '110' : '100',
  }));
  const node = sample.previousWindowHigh;
  expect(numericExpressionSchema.parse(node)).toEqual(node);
  expect(evaluateNumericExpression(node, context(node, points))).toMatchObject({ value: '100' });
  const entry = {
    type: 'compare' as const,
    operator: 'gt' as const,
    left: { type: 'series' as const, sourceId: 'primary', field: 'close' as const },
    right: node,
  };
  expect(evaluateBooleanExpression(entry, context(entry, points, '95'))).toMatchObject({
    value: false,
  });
  const changed = {
    ...entry,
    right: {
      type: 'lag' as const,
      periods: 1,
      input: { type: 'series' as const, sourceId: 'primary', field: 'high' as const },
    },
  };
  expect(evaluateBooleanExpression(changed, context(changed, points, '95'))).toMatchObject({
    value: true,
  });
});

it('模型示例区分价格低点和对应RSI，单调close不会被用来替代low找低点', () => {
  const examples = discoveryExpressionExamples('primary');
  const lows = [...Array<number>(15).fill(100), 5, 4, 1, 3, 4];
  const points = inputPoints(lows.length).map((point, index) => ({
    ...point,
    value: String(lows[index]),
  }));
  const closes = points.map((point, index) => ({ ...point, value: String(100 + index) }));
  for (const node of [examples.priceLow, examples.rsiAtPriceLow])
    expect(numericExpressionSchema.parse(node)).toEqual(node);
  expect(
    evaluateNumericExpression(
      examples.priceLow,
      context(examples.priceLow, points, '119', { low: points, close: closes }),
    ),
  ).toMatchObject({ value: '1' });
  expect(
    evaluateNumericExpression(
      examples.rsiAtPriceLow,
      context(examples.rsiAtPriceLow, points, '119', { low: points, close: closes }),
    ),
  ).toMatchObject({ value: '100' });
});
