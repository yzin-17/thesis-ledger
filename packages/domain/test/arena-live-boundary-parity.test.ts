import { expect, it } from 'vitest';
import { arenaSubmitDecision } from '../src/arena-live-submit.js';
import { arenaMatchOrders } from '../src/arena-live-match-orders.js';
import { arenaEqualWeightBook } from '../src/arena-live-valuation.js';
import type { ArenaPaperContext, ArenaPaperQuote, ArenaPaperAccount, ArenaPaperDecision } from '../src/arena-live-types.js';

it.each(['upperLimit', 'lowerLimit'] as const)('策略和等权基准在 %s 等值边界采用相同成交判断', limit => {
  const at = '2026-11-23T02:00:00Z', later = '2026-11-23T02:01:00Z';
  const q: ArenaPaperQuote = { symbol: '510300.SH', price: '10', lot: '100', tick: '0.01',
    marketTime: at, observedAt: at, tradingDate: '2026-11-23', positionAvailableOn: '2026-11-24',
    cashAvailableOn: '2026-11-23', sourceRef: 'controlled', evidence: {}, buyBlocked: null, sellBlocked: null,
    statutoryBuyFee: () => '0', statutorySellFee: () => '0', [limit]: '10' };
  const empty: ArenaPaperAccount = { revision: 0, cash: '10000', positions: [], cashSettlements: [],
    orders: [], wakeups: [], watchedSymbols: [], fills: [] };
  const c: ArenaPaperContext = { at, tradingDate: '2026-11-23', quotes: [q],
    fees: { buyBps: 0, sellBps: 0, minimum: '0', slippageBps: 0 }, maxPositionBps: 10000,
    maxActiveSymbols: 10, allowedSymbols: new Set([q.symbol]), newId: () => 'controlled',
    expiresAt: () => '2026-11-23T07:00:00Z' };
  const d: ArenaPaperDecision = { summary: '边界一致', cancelOrderIds: [], watchedSymbols: [],
    wakeups: [{ kind: 'fill', symbol: q.symbol }], orders: [{ clientId: 'buy', symbol: q.symbol,
      side: 'buy', kind: 'market', quantity: '100', price: null, expiresOn: null, exitGroup: null }] };
  const booked = arenaSubmitDecision(empty, 0, d, c);
  const strategy = arenaMatchOrders(booked, { ...c, at: later, quotes: [{ ...q, marketTime: later, observedAt: later }] }, true);
  const benchmark = arenaEqualWeightBook(empty.cash, 10000, [q], c.fees, later, c.newId);
  expect(strategy.fills).toEqual([]);
  expect(benchmark.fills).toEqual([]);
});
