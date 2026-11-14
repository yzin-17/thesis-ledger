import test from 'node:test';
import assert from 'node:assert/strict';
import { historyObservation } from './arena-us-history-observation.mjs';
import { arenaSubmitDecision, arenaMatchOrders } from '../../packages/domain/dist/index.js';

test('历史资料只在分钟结束后可见，正式撮合保留受控条件标记并使用下一分钟价格', () => {
  const rows = Array.from({ length: 390 }, (_, n) => ({ timestamp: new Date(Date.parse('2026-11-13T14:30:00Z') + n * 60000).toISOString(),
    open: 200, high: 202, low: 198, close: n === 0 ? 200 : 201, complete: true, volume: 10, amount: 2000 }));
  const source = historyObservation({ status: 'captured', providerId: 'futu', date: '2026-11-13', value: {
    symbol: 'AAPL.US', timestampConvention: 'interval-start', rows, observedAt: '2026-11-14T00:00:00Z', responseSha256: 'a'.repeat(64) } });
  const p = { fees: { buyBps: 0, sellBps: 0, minimum: '0', slippageBps: 0 }, maxPositionBps: 10000, resources: { maxActiveSymbols: 50 } };
  assert.throws(() => source.observe(p, '2026-11-13T14:30:00.000Z'));
  const first = source.observe(p, source.firstAt), next = source.observe(p, '2026-11-13T14:32:00.000Z');
  const book = { revision: 0, cash: '100000', positions: [], cashSettlements: [], orders: [], wakeups: [], watchedSymbols: [], fills: [] };
  const submitted = arenaSubmitDecision(book, 0, { summary: '受控功能样本', cancelOrderIds: [], watchedSymbols: ['AAPL.US'],
    orders: [{ clientId: 'buy', symbol: 'AAPL.US', side: 'buy', kind: 'market', quantity: '1', price: null, expiresOn: null, exitGroup: null }],
    wakeups: [{ kind: 'fill', symbol: 'AAPL.US' }] }, first.context);
  assert.equal(arenaMatchOrders(submitted, first.context, true).fills.length, 0);
  const filled = arenaMatchOrders(submitted, next.context, true);
  assert.equal(filled.fills[0].price, '201'); assert.equal(filled.cash, '99799');
  assert.equal(filled.fills[0].evidence.historicalPitCertified, false);
  assert.equal(filled.positions[0].availableOn, '2026-11-16');
  assert.equal(next.context.quotes[0].statutorySellFee('20000'), '0.41');
});
