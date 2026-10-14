import assert from 'node:assert/strict';
import { test } from 'node:test';
import { additionalCacheDefinitions } from './market-additional-cache-case.mjs';
import { verifyAdditionalCacheValue } from './market-additional-cache-acceptance.mjs';
import { probeTargetHoldings } from './market-cache-target-reader.mjs';

const nav = (day, cached = false) => ({ version: 3, symbol: '000001.OF', unitNav: 1.1,
  navDate: `2024-07-${day}T00:00:00+08:00`, provider: 'akshare',
  fetchedAt: '2026-10-11T00:00:00Z', freshness: 'delayed', servedFromCache: cached });
const history = () => ['15', '16', '17', '18', '19'].map((day) => ({ ...nav(day), freshness: 'stale' }));

test('净值按原delayed披露和有offset日期校验，不要求live或日期短字符串', () => {
  assert.equal(verifyAdditionalCacheValue(additionalCacheDefinitions[0], nav('15')).cached, false);
  assert.equal(verifyAdditionalCacheValue(additionalCacheDefinitions[0], nav('15', true)).cached, true);
  const historical = history().map((point) => ({ ...point, freshness: 'stale' }));
  assert.equal(verifyAdditionalCacheValue(additionalCacheDefinitions[1], historical).points, 5);
  const utc = historical.map((point) => ({ ...point, navDate: new Date(point.navDate).toISOString() }));
  assert.equal(verifyAdditionalCacheValue(additionalCacheDefinitions[1], utc).points, 5);
});

test('历史日期年龄stale与新获取/缓存标记独立，不放宽最新净值或伪造新鲜度', () => {
  const points = history().map((point) => ({ ...point, freshness: 'stale', navDate: point.navDate.replace('+08:00', '+00:00') }));
  const result = verifyAdditionalCacheValue(additionalCacheDefinitions[1], points);
  assert.equal(result.cached, false);
  assert.deepEqual(result.freshness, ['stale']);
  assert.equal(verifyAdditionalCacheValue(additionalCacheDefinitions[1], points.map((point) => ({ ...point, servedFromCache: true }))).cached, true);
  assert.throws(() => verifyAdditionalCacheValue(additionalCacheDefinitions[1], history().map((point) => ({ ...point, freshness: 'delayed' }))), /日期年龄状态/);
  assert.throws(() => verifyAdditionalCacheValue(additionalCacheDefinitions[1], points.map((point) => ({ ...point, freshness: 'unavailable' }))));
});

test('拒绝陈旧、混用缓存标记、其他来源或错误基金窗口', () => {
  assert.throws(() => verifyAdditionalCacheValue(additionalCacheDefinitions[0], { ...nav('15'), freshness: 'stale' }));
  assert.throws(() => verifyAdditionalCacheValue(additionalCacheDefinitions[0], { ...nav('15'), provider: 'efinance' }));
  const mixed = history(); mixed[0].servedFromCache = true;
  assert.throws(() => verifyAdditionalCacheValue(additionalCacheDefinitions[1], mixed), /标记不一致/);
  const wrong = history(); wrong[4].navDate = '2024-07-20T00:00:00+08:00';
  assert.throws(() => verifyAdditionalCacheValue(additionalCacheDefinitions[1], wrong));
});

test('筹码沿原模型校验，不伪造不存在的freshness字段', () => {
  const raw = { version: 3, symbol: '600519.SH', averageCost: 100, profitRatio: .5,
    range70: [90, 110], range90: [80, 120], concentration: .2, provider: 'akshare',
    engineVersion: 'fixture', calculatedAt: '2026-10-11T00:00:00Z' };
  assert.equal(verifyAdditionalCacheValue(additionalCacheDefinitions[3], raw).cached, false);
});

test('目标持仓完成证明保持原Reader层，不伪造Server HTTP完成', () => {
  const row = (value) => JSON.stringify({ timestamp: '2026-10-11T00:00:00Z', ...value });
  const log = ['started', 'settled'].map((stage) => row({ operation: 'dsa.cache-request',
    transportId: 'control', traceId: 'one', category: 'control', attempt: 1, method: 'POST',
    path: '/api/v3/thesis-ledger/market/cache-context', stage, ...(stage === 'settled' ? { outcome: 'response' } : {}) }));
  log.push(row({ operation: 'market.cache-target-reader', stage: 'completed', capability: 'FUND_HOLDINGS', traceId: 'one' }));
  log.push('CACHE_READER_RESULT=[{"rejected":true}]');
  const spawn = (command, args, options) => {
    assert.equal(command, 'docker'); assert(args.includes('exec') && args.includes('node'));
    assert.deepEqual(JSON.parse(options.input), { phase: 'disabled', traces: ['one'], symbol: '000001.OF' });
    return { status: 0, stdout: log.join('\n') };
  };
  assert.deepEqual(probeTargetHoldings('disabled', ['one'], spawn), { capability: 'FUND_HOLDINGS',
    layer: 'target-original-reader', dataAttempts: 0, controlAttempts: 1, dataByPath: {}, rejected: true });
});
