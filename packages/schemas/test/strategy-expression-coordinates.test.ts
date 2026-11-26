import { expect, it } from 'vitest';
import {
  strategySchema,
  type BacktestStrategy,
  type NumericExpression,
} from '../src/backtest-strategy.js';
import { priceResearchStrategyIssues } from '../src/backtest-price-research-strategy.js';
import fixture from '../fixtures/strategy-authoring.exchange.json';

const price = (sourceId = 'primary'): NumericExpression => ({
  type: 'series',
  sourceId,
  field: 'close',
});
const constant = (value: string): NumericExpression => ({ type: 'constant', value });
const strategy = (entry: unknown) =>
  strategySchema.parse({
    ...fixture,
    schemaVersion: 'strategy-definition-v1',
    signalSources: fixture.signalSources.map((source) => ({
      ...source,
      priceCoordinate: 'research',
    })),
    entry,
  }) as BacktestStrategy;
const compare = (left: NumericExpression, right: NumericExpression) => ({
  type: 'compare',
  operator: 'gt',
  left,
  right,
});

it('同坐标的事件冻结值保留价格单位，不能误报为实际价格常量', () => {
  const entry = {
    type: 'sequence',
    trigger: compare(price(), { ...price(), field: 'open' }),
    capture: price(),
    confirm: compare(price(), { type: 'eventValue' }),
    invalidation: compare(price(), {
      type: 'arithmetic',
      operator: 'multiply',
      left: { type: 'eventValue' },
      right: constant('0.98'),
    }),
    within: 5,
    allowSameBar: false,
    repeat: true,
  };
  expect(priceResearchStrategyIssues(strategy(entry))).toEqual([]);
  const changed = strategy(entry);
  changed.signalSources.push({
    ...changed.signalSources[0]!,
    id: 'actual',
    priceCoordinate: 'actual',
  });
  changed.entry = { ...entry, capture: price('actual') } as BacktestStrategy['entry'];
  expect(priceResearchStrategyIssues(changed).map((issue) => issue.path.join('.'))).toContain(
    'entry.confirm',
  );
});

it('标准差和同坐标价差与零比较无需实际价格，非零平移不能冒充尺度不变', () => {
  const nodes: NumericExpression[] = [
    { type: 'rolling', statistic: 'standardDeviation', periods: 20, ddof: 0, input: price() },
    {
      type: 'absolute',
      input: {
        type: 'arithmetic',
        operator: 'subtract',
        left: price(),
        right: { ...price(), field: 'open' },
      },
    },
  ];
  for (const node of nodes) {
    expect(priceResearchStrategyIssues(strategy(compare(node, constant('0'))))).toEqual([]);
    expect(priceResearchStrategyIssues(strategy(compare(node, constant('10'))))).not.toEqual([]);
  }
  const translated: NumericExpression = {
    type: 'absolute',
    input: { type: 'arithmetic', operator: 'subtract', left: price(), right: constant('100') },
  };
  expect(priceResearchStrategyIssues(strategy(compare(translated, constant('0'))))).not.toEqual([]);
});
