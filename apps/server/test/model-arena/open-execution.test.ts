import { expect, it } from 'vitest';
import type { ArenaProtocol, ArenaDecision, ArenaBook } from '@thesis-ledger/schemas';
import {
  executeAtArenaOpen,
  type OpeningFact,
} from '../../src/model-arena/arena-open-execution.js';
const at = '2026-11-06T01:30:00.000Z';
const p = { fees: { buyBps: 10, sellBps: 10, minimum: '1', slippageBps: 0 } } as ArenaProtocol;
const book: ArenaBook = {
  asOf: '2026-11-05T08:00:00.000Z',
  cash: '1000',
  nav: '2000',
  positions: [{ symbol: 'A.US', quantity: '100', close: '10' }],
};
const fact = (symbol: string, price: string): OpeningFact => ({
  symbol,
  openAt: at,
  price,
  lot: '10',
  tick: '0.01',
  buyBlocked: null,
  sellBlocked: null,
  sellable: '100',
  sourceRef: 'qualified-open',
});
const decision = (entries: object[]) => ({ actions: entries }) as ArenaDecision;
it('隔夜跳空仍持有原股数，观望不成交', () => {
  expect(
    executeAtArenaOpen(
      p,
      book,
      decision([
        { symbol: 'A.US', action: 'hold' },
        { symbol: 'B.US', action: 'observe' },
      ]),
      at,
      [fact('A.US', '20')],
    ),
  ).toMatchObject({ cash: '1000', fills: [] });
});
it('按下一开盘先卖后买，扣费、向下取整，缺价与停牌分别留因', () => {
  const actions = decision([
    { symbol: 'A.US', action: 'target', weightBps: 0 },
    { symbol: 'B.US', action: 'target', weightBps: 10000 },
    { symbol: 'C.US', action: 'target', weightBps: 0 },
    { symbol: 'D.US', action: 'target', weightBps: 0 },
  ]);
  const result = executeAtArenaOpen(p, book, actions, at, [
    fact('A.US', '20'),
    fact('B.US', '15'),
    { ...fact('C.US', '15'), buyBlocked: 'suspended' },
  ]);
  expect(result.fills.map((f) => [f.side, f.quantity, f.fee])).toEqual([
    ['sell', '100', '2'],
    ['buy', '190', '2.85'],
  ]);
  expect(result.cash).toBe('145.15');
  expect(result.reasons).toMatchObject({ 'C.US': 'suspended', 'D.US': 'opening_evidence_missing' });
});
it('不足以全买时各标的同比缩量，保留余款；未来开盘事实不会产生交易', () => {
  const p2 = { fees: { ...p.fees, minimum: '10' } } as ArenaProtocol;
  const empty = { ...book, positions: [], cash: '1000', nav: '1000' };
  const actions = decision(
    ['A.US', 'B.US'].map((symbol) => ({ symbol, action: 'target', weightBps: 5000 })),
  );
  const facts = [fact('A.US', '10'), fact('B.US', '10')];
  expect(executeAtArenaOpen(p2, empty, actions, at, facts)).toMatchObject({
    cash: '180',
    fills: [{ quantity: '40' }, { quantity: '40' }],
  });
  expect(executeAtArenaOpen(p2, empty, actions, '2026-11-09T01:30:00.000Z', facts).fills).toEqual(
    [],
  );
});
it('买入滑点向不利方向取价格档，超出涨停边界的当轮目标不成交', () => {
  const protocol = { ...p, fees: { ...p.fees, slippageBps: 11 } };
  const input = { ...book, cash: '1000', nav: '1000', positions: [] };
  const order = decision([{ symbol: 'A.US', action: 'target', weightBps: 5000 }]);
  const opening = { ...fact('A.US', '10'), tick: '0.05' };
  expect(executeAtArenaOpen(protocol, input, order, at, [opening])).toMatchObject({
    cash: '496.5',
    fills: [{ price: '10.05', quantity: '50', fee: '1' }],
  });
  expect(
    executeAtArenaOpen(protocol, input, order, at, [{ ...opening, upperLimit: '10' }]),
  ).toMatchObject({ cash: '1000', fills: [], reasons: { 'A.US': 'price_limit' } });
});
