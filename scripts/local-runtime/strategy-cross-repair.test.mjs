import assert from 'node:assert/strict';
import { test } from 'node:test';
import { repairPriceCrosses } from './strategy-cross-repair.mjs';

const price = { type: 'series', sourceId: 'price', field: 'close' };
const ema = { type: 'indicator', name: 'EMA', input: price, params: { period: 20 } };
const asset = { symbol: '00700.HK', market: 'HK', assetType: 'stock' };
const strategy = () => ({
  schemaVersion: '2', name: '方向核验', description: '价格上穿均线买入，下穿均线卖出。',
  executionInstrument: asset, primaryTimeframe: '1d', signalSources: [{ id: 'price', asset, timeframe: '1d', series: ['close'] }],
  entry: { type: 'cross', direction: 'above', left: ema, right: price },
  exit: { type: 'cross', direction: 'below', left: ema, right: price },
  sizing: { type: 'percentOfEquity', percent: '0.5' }, risk: [{ type: 'fixedStop', percent: '0.03' }, { type: 'maxHoldingPeriod', periods: 10 }],
  execution: { mode: 'exchange', timing: 'nextEligibleBarOpen', orderType: 'market', timeInForce: 'DAY' }, cost: { commissionRate: '0', slippageRate: '0' },
});
test('修复仅交换明确错误的左右项，保留全部其他字段与原输入', () => {
  const raw = strategy(), original = structuredClone(raw);
  const { after, changedPaths } = repairPriceCrosses(raw);
  assert.deepEqual(raw, original);
  assert.deepEqual(changedPaths, ['entry', 'exit']);
  assert.deepEqual(after.entry, { ...raw.entry, left: price, right: ema });
  assert.deepEqual(after.exit, { ...raw.exit, left: price, right: ema });
  assert.deepEqual({ ...after, entry: raw.entry, exit: raw.exit }, raw);
});
test('正确或无明确价格均线说明时拒绝自动修改；不按趋势名称猜测', () => {
  const raw = strategy();
  assert.throws(() => repairPriceCrosses({ ...raw, description: '趋势策略' }));
  const { after } = repairPriceCrosses(raw);
  assert.throws(() => repairPriceCrosses(after));
});
