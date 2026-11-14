import { expect, it } from 'vitest';
import { arenaCommonMarks, arenaEqualWeightBook } from '../src/arena-live-valuation.js';
import { arenaChartFrames } from '../src/arena-live-chart.js';
import type { ArenaPaperAccount, ArenaPaperQuote } from '../src/arena-live-types.js';
const empty = (): ArenaPaperAccount => ({ revision: 0, cash: '100', positions: [], cashSettlements: [], orders: [], wakeups: [], watchedSymbols: [], fills: [] });

it('单模型独立计算收益和名次，缺价时仍暂停排名', () => {
  const account = empty(); account.cash = '0';
  account.positions = [{ symbol: 'A.US', quantity: '10', acquiredOn: '2026-11-12', availableOn: '2026-11-12' }];
  const agents = [{ id: 'only', account }];
  const marks = arenaCommonMarks(agents, new Map([['A.US', '11']]), '100', []);
  expect(marks).toHaveLength(1); expect(marks[0]).toMatchObject({ nav: '110', returnRatio: '0.1', rank: 1, complete: true });
  expect(arenaCommonMarks(agents, new Map(), '100', marks)[0]).toMatchObject({ nav: null, rank: null, complete: false });
});

it('共同批次缺价时只保留已知净值，全部排名暂停；恢复后保留赛季最大回撤', () => {
  const a = empty(), b = empty();
  a.cash = '0'; a.positions = [{ symbol: 'A.US', quantity: '10', acquiredOn: '2026-11-12', availableOn: '2026-11-12' }];
  const agents = [{ id: 'a', account: a }, { id: 'b', account: b }];
  const first = arenaCommonMarks(agents, new Map([['A.US', '8']]), '100', []);
  expect(first[0]).toMatchObject({ nav: '80', peakNav: '100', drawdown: '0.2', rank: 2 });
  const missing = arenaCommonMarks(agents, new Map(), '100', first);
  expect(missing.map((m) => m.rank)).toEqual([null, null]);
  expect(missing[0]).toMatchObject({ nav: null, drawdown: '0.2', complete: false });
  const recovered = arenaCommonMarks(agents, new Map([['A.US', '10']]), '100', missing);
  expect(recovered.map((m) => m.rank)).toEqual([1, 1]);
  expect(recovered[0]?.drawdown).toBe('0.2');
});
it('固定篮子按滑点、整手和费用建立，保留余款和原始成交证据', () => {
  const q: ArenaPaperQuote = { symbol: 'A.US', price: '10', lot: '1', tick: '0.01', marketTime: '2026-11-12T15:00:00Z',
    observedAt: '2026-11-12T15:00:01Z', tradingDate: '2026-11-12', positionAvailableOn: '2026-11-13', cashAvailableOn: '2026-11-13',
    sourceRef: 'fixture', evidence: { controlled: true }, buyBlocked: null, sellBlocked: null,
    statutoryBuyFee: () => '1', statutorySellFee: () => '1' };
  const book = arenaEqualWeightBook('100', 10000, [q], { buyBps: 0, sellBps: 0, minimum: '1', slippageBps: 100 }, q.observedAt, () => 'id');
  expect(book.positions[0]?.quantity).toBe('9');
  expect(book.cash).toBe('7.1');
  expect(book.fills[0]).toMatchObject({ price: '10.1', fee: '2', evidence: { controlled: true } });
});
it('图表抽样保留各模型极值和独立缺口边界', () => {
  const frames = Array.from({ length: 5000 }, (_, i) => {
    let secondNav: string | null = '100';
    if (i >= 2000 && i <= 2010 || i === 2050) secondNav = null;
    else if (i === 3456) secondNav = '1';
    return { at: String(i), marks: [
      { agentId: 'a', nav: i === 2345 ? '999999' : '100' },
      { agentId: 'b', nav: secondNav },
    ], benchmarks: [] };
  });
  const sampled = arenaChartFrames(frames, 100);
  for (const at of ['0', '4999', '2345', '3456', '1999', '2000', '2010', '2011', '2049', '2050', '2051'])
    expect(sampled.some((f) => f.at === at)).toBe(true);
});
