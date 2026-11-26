import { expect, it } from 'vitest';
import { expressionChildren, strategyRuleExpressions } from '../src/backtest-expression-children.js';
import type { BacktestStrategy, Expression } from '../src/backtest-strategy.js';

it('根清单包含保护启用条件及每张委托的价格路径', () => {
  const held = { type: 'positionState', field: 'isOpen' } as const;
  const value = { type: 'constant', value: '10' } as const;
  const roots = strategyRuleExpressions({
    entry: held, exit: held,
    tradePlan: { stages: [], initialStop: {
      kind: 'percent', percent: '0.05', activation: { kind: 'condition', condition: held },
    } },
    execution: { mode: 'exchange', timing: 'dailyBarOrders', orders: [
      { id: 'entry', action: { kind: 'entry' }, order: { kind: 'limit', price: value }, validity: { kind: 'DAY' } },
      { id: 'exit', action: { kind: 'exit' }, order: { kind: 'market' }, validity: { kind: 'DAY' } },
    ] },
  } satisfies Pick<BacktestStrategy, 'entry' | 'exit' | 'tradePlan' | 'execution'>);
  expect(roots.map((root) => root.path.join('.'))).toEqual([
    'entry', 'exit', 'tradePlan.initialStop.activation.condition', 'execution.orders.0.order.price',
  ]);
  expect(roots.at(-1)?.expression).toBe(value);
});

it('递归遍历保留事件捕获和低点取样的实际子树', () => {
  const price = { type: 'series', sourceId: 'main', field: 'low' } as const;
  const sample = { type: 'indicator', name: 'RSI', input: price, params: { period: 14 } } as const;
  const capture = { type: 'confirmedPivot', side: 'low', leftBars: 2, rightBars: 2,
    offset: 0, input: price, sample } as const;
  const always = { type: 'positionState', field: 'isOpen' } as const;
  const event: Expression = { type: 'sequence', trigger: always, confirm: always,
    invalidation: always, capture, within: 10, allowSameBar: false, repeat: true };
  const seen: Expression[] = [];
  const visit = (node: Expression) => { seen.push(node); expressionChildren(node).forEach(visit); };
  visit(event);
  expect(seen).toContain(capture);
  expect(seen).toContain(sample);
  expect(seen.filter((node) => node === price)).toHaveLength(2);
});
