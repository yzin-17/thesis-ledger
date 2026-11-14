// 功能验收专用资料适配器；真实历史价格与受控执行条件分别记录。
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { arenaPublicFees, DecimalValue } from '../../packages/domain/dist/index.js';

export function historyObservation(capture) {
  assert.equal(capture.status, 'captured');
  assert.equal(capture.providerId, 'futu');
  const value = capture.value;
  assert.equal(value.timestampConvention, 'interval-start');
  assert.equal(value.symbol, 'AAPL.US');
  const rows = value.rows.filter(row => row.complete === true).map(row => ({ ...row,
    availableAt: new Date(Date.parse(row.timestamp) + 60000).toISOString() }));
  assert.equal(rows.length, 390, '需要完整常规时段分钟资料');
  const firstAt = rows[0].availableAt;
  const endAt = rows.at(-1).availableAt;
  const fixture = { kind: 'controlled-functional-execution', historicalPitCertified: false,
    description: '执行状态、交易日历、交易单位及结算条件为隔离功能样本；未认证历史可交易性',
    priceSource: 'futu', capturedAt: value.observedAt, responseSha256: value.responseSha256 };
  function observe(p, at) {
    const row = rows.find(item => item.availableAt === at);
    assert(row, '没有恰好在此时刻结束的真实分钟');
    const quote = { symbol: value.symbol, price: String(row.close), marketTime: at, observedAt: at,
      sourceRef: 'futu-history:' + value.responseSha256, evidence: { ...fixture, sourceTimestamp: row.timestamp, row },
      tradingDate: capture.date, positionAvailableOn: '2026-11-16', cashAvailableOn: '2026-11-16',
      lot: '1', tick: '0.01', priceStep: price => DecimalValue.from(price).compareTo('1') >= 0 ? '0.01' : '0.0001',
      buyBlocked: null, sellBlocked: null, statutoryBuyFee: () => '0',
      statutorySellFee: (amount, quantity = '1', price = amount) => arenaPublicFees([
        { code: 'secFee', side: 'sell', basis: 'turnover', currency: 'USD', rate: '0.0000206' },
      ], 'sell', 'USD', quantity, price) };
    const session = { market: 'US', state: 'open', tradingDayState: 'open', date: capture.date,
      evaluatedAt: at, reason: null, sessions: [{ tradingDate: capture.date,
        startAt: rows[0].timestamp, endAt }] };
    return { at, session, prices: new Map([[value.symbol, quote.price]]), evidence: { ...fixture },
      context: { at, tradingDate: capture.date, fees: p.fees, maxPositionBps: p.maxPositionBps,
        maxActiveSymbols: p.resources.maxActiveSymbols, allowedSymbols: new Set([value.symbol]), quotes: [quote],
        expiresAt: () => endAt, newId: randomUUID } };
  }
  return { firstAt, rows, fixture, observe,
    next: async (_p, after, target) => {
      const row = rows.find(item => item.availableAt > after && item.availableAt <= target);
      assert(row, '真实分钟窗口已结束'); return row.availableAt;
    },
    tool: async (p, request, _signal, at) => {
      if (request.name === 'search_instruments') return { items: [{ symbol: 'AAPL.US', assetType: 'STOCK', name: 'Apple' }] };
      if (request.symbol !== 'AAPL.US') throw new Error('isolated_history_symbol_unavailable');
      if (request.name === 'quote') {
        const read = observe(p, at), q = read.context.quotes[0];
        return { symbol: q.symbol, price: q.price, marketTime: at, asOf: at, evidence: q.evidence,
          execution: { status: 'available', scope: 'controlled-functional-execution', historicalPitCertified: false } };
      }
      if (request.name === 'bars' && request.timeframe === '1m') return {
        symbol: 'AAPL.US', timeframe: '1m', source: 'futu', asOf: at,
        rows: rows.filter(row => row.availableAt <= at).slice(-(request.limit ?? 5)), ...fixture };
      throw new Error('isolated_tool_unavailable');
    } };
}
