import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emaSeries, verifyDefinition, verifyFills } from './strategy-cross-live-verification.mjs';

function definition() {
  const price = { type: 'series', field: 'close', sourceId: 'price' };
  const ema = { type: 'indicator', name: 'EMA', input: price, params: { period: 20 } };
  return {
    schemaVersion: '3', primaryTimeframe: '1d', executionInstrument: { symbol: '00700.HK', market: 'HK', assetType: 'stock' },
    signalSources: [{ id: 'price', priceCoordinate: 'research' }],
    entry: { type: 'cross', direction: 'above', left: price, right: ema },
    exit: { type: 'cross', direction: 'below', left: price, right: ema },
    sizing: { type: 'percentOfEquity', percent: '0.5' },
    risk: [{ type: 'fixedStop', percent: '0.03' }, { type: 'maxHoldingPeriod', periods: 10 }],
    execution: { timing: 'nextEligibleBarOpen' }, cost: { commissionRate: '0', slippageRate: '0' },
  };
}

test('独立验收拒绝原反向条件，并接受交换主语与方向的等价表达', () => {
  const d = definition();
  assert.equal(verifyDefinition(d).entry.priceDirection, 'above');
  for (const path of ['entry', 'exit']) [d[path].left, d[path].right] = [d[path].right, d[path].left];
  assert.throws(() => verifyDefinition(d), /反向/);
  d.entry.direction = 'below'; d.exit.direction = 'above';
  assert.equal(verifyDefinition(d).exit.priceDirection, 'below');
});

test('独立 EMA 使用前20个收盘均值预热，之后应用2/21平滑系数', () => {
  const values = emaSeries([...Array(20).fill(100), 121]);
  assert.equal(values[18], null);
  assert.equal(values[19], 100);
  assert.equal(values[20], 102);
});

test('允许原样保留无动作的空计划，但拒绝额外计划动作', () => {
  const d = { ...definition(), tradePlan: { version: 1, evaluation: 'barClose', stages: [] } };
  assert.equal(verifyDefinition(d).entry.priceDirection, 'above');
  const changed = { ...d, tradePlan: { ...d.tradePlan, stages: [{ id: 'extra-action' }] } };
  assert.throws(() => verifyDefinition(changed), /计划动作/);
});

test('逐笔验收拒绝同日成交、错误开盘价和反向信号', () => {
  const bars = Array.from({ length: 26 }, (_, i) => {
    let close = 100;
    if (i === 21 || i === 23) close = 90;
    else if (i === 22) close = 110;
    return { occurredAt: new Date(Date.UTC(2026, 0, i + 1)).toISOString(), open: '100', close: String(close) };
  });
  const fills = [
    { fillId: 'buy', occurredAt: bars[23].occurredAt, side: 'buy', reason: 'signal', price: '100' },
    { fillId: 'sell', occurredAt: bars[24].occurredAt, side: 'sell', reason: 'signal', price: '100' },
  ];
  assert.equal(verifyFills(bars, fills).signalFills, 2);
  assert.throws(() => verifyFills(bars, [{ ...fills[0], occurredAt: bars[22].occurredAt }, fills[1]]), /交叉/);
  assert.throws(() => verifyFills(bars, [{ ...fills[0], price: '99' }, fills[1]]), /开盘价/);
  assert.throws(() => verifyFills(bars, [{ ...fills[0], side: 'sell' }, fills[1]]), /交叉/);
});

test('风险卖出须独立达到止损或持有期条件', () => {
  const bars = Array.from({ length: 30 }, (_, i) => {
    let close = 100;
    if ([21, 23, 24, 26].includes(i)) close = 90;
    else if ([22, 25].includes(i)) close = 110;
    return { occurredAt: new Date(Date.UTC(2026, 0, i + 1)).toISOString(), open: '100', close: String(close) };
  });
  const fills = [
    { occurredAt: bars[23].occurredAt, side: 'buy', reason: 'signal', price: '100' },
    { occurredAt: bars[24].occurredAt, side: 'sell', reason: 'signal', price: '100' },
    { occurredAt: bars[26].occurredAt, side: 'buy', reason: 'signal', price: '100' },
    { occurredAt: bars[27].occurredAt, side: 'sell', reason: 'risk', price: '100' },
  ];
  assert.equal(verifyFills(bars, fills).evidence.at(-1).riskTrigger, 'fixedStop');
  bars[26].close = '100';
  assert.throws(() => verifyFills(bars, fills), /未达到/);
});
