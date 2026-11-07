import { expect, it } from 'vitest';
import type { ArenaProtocol } from '@thesis-ledger/schemas';
import {
  arenaMetrics,
  benchmarkNav,
  equalWeightEntry,
} from '../../src/model-arena/arena-performance.js';
it('同一组收盘点逐笔核对回撤、费用、换手；缺一日即退出区间比较', () => {
  const fills = [
    { quantity: '10', price: '10', fee: '1' },
    { quantity: '10', price: '9', fee: '1' },
  ];
  expect(arenaMetrics('100', ['110', '90'], fills)).toMatchObject({
    returnRatio: '-0.1',
    drawdown: '0.18181818181818181818',
    tradeFees: '2',
    turnover: '1.9',
  });
  expect(arenaMetrics('100', [null, '90'], fills)).toMatchObject({
    returnRatio: null,
    turnover: null,
    validCloses: 1,
    endNav: '90',
  });
});
it('等权基准冻结首个开盘，按手数费用建仓；持仓缺行动覆盖退出当日估值', () => {
  const date = new Date('2026-11-02T01:30:00Z');
  const p = {
    initialCash: '1000',
    instruments: [{ symbol: 'A.US' }],
    fees: { buyBps: 0, sellBps: 0, slippageBps: 0, minimum: '1' },
  } as ArenaProtocol;
  const entry = equalWeightEntry(p, date, [
    {
      symbol: 'A.US',
      openAt: date.toISOString(),
      price: '10',
      lot: '10',
      tick: '0.01',
      sourceRef: 'open',
      sellable: '0',
      buyBlocked: null,
      sellBlocked: null,
    },
  ]);
  expect(entry?.[0]).toMatchObject({ quantity: '90', fee: '1', cashDelta: '-901' });
  const facts = [
    {
      kind: 'daily_bar' as const,
      ref: 'close',
      symbol: 'A.US',
      date: '2026-11-02',
      open: '10',
      close: '12',
      availableAt: date.toISOString(),
      observedAt: date.toISOString(),
    },
  ];
  expect(
    benchmarkNav('1000', entry, facts, '2026-11-02', date, { 'A.US': ['cash', 'split'] }),
  ).toBe('1179');
  expect(benchmarkNav('1000', entry, facts, '2026-11-02', date, {})).toBeNull();
});
