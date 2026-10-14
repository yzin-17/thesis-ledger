import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countObservedCacheRequests, readCompletedCacheRequests, CacheObservationPending } from './market-cache-request-evidence.mjs';

const consumerPath = '/api/market/000001.OF/fund-nav';
const controlPath = '/api/v3/thesis-ledger/market/cache-context';
const dataPath = '/api/v3/thesis-ledger/market/fund-nav';
const line = (value) => '\u001b[32m[Nest] ' + JSON.stringify({ timestamp: '2026-10-11T00:00:00Z', ...value }) + '\u001b[39m';
const complete = (traceId = 'one') => line({ operation: 'http.request', traceId, path: consumerPath });
const transport = (transportId, category, attempt = 1, traceId = 'one') => ['started', 'settled'].map((stage) =>
  line({ operation: 'dsa.cache-request', transportId, category, traceId, attempt, stage,
    method: category === 'control' ? 'POST' : 'GET', path: category === 'control' ? controlPath : dataPath,
    ...(stage === 'settled' ? { outcome: 'response' } : {}) })).join('\n');

test('彩色日志只统计本案例的完整传输，控制和两次数据尝试分开', () => {
  const log = [transport('control', 'control'), transport('first', 'data'), transport('retry', 'data', 2),
    transport('other', 'data', 1, 'outside'), complete()].join('\n');
  assert.deepEqual(countObservedCacheRequests(log, ['one'], consumerPath),
    { dataAttempts: 2, controlAttempts: 1, dataByPath: { [dataPath]: 2 } });
});

test('完整控制和本次消费完成才可证明零数据请求', () => {
  assert.deepEqual(countObservedCacheRequests([transport('control', 'control'), complete()].join('\n'),
    ['one'], consumerPath), { dataAttempts: 0, controlAttempts: 1, dataByPath: {} });
  assert.throws(() => countObservedCacheRequests(complete(), ['one'], consumerPath), /缺少本次控制/);
  assert.throws(() => countObservedCacheRequests(transport('control', 'control'), ['one'], consumerPath), /消费完成/);
});

test('被截断的开始/结束和混用传输ID不能支持成功或零调用', () => {
  const partial = transport('control', 'control').split('\n')[0];
  assert.throws(() => countObservedCacheRequests([partial, complete()].join('\n'), ['one'], consumerPath), /不完整/);
  assert.throws(() => countObservedCacheRequests([transport('same', 'control'), transport('same', 'data'), complete()].join('\n'),
    ['one'], consumerPath), /冲突|重复/);
});

test('错误类别和额外重试不能伪装成控制读取或合法计数', () => {
  assert.throws(() => countObservedCacheRequests([transport('control', 'control'), transport('data', 'data', 3), complete()].join('\n'),
    ['one'], consumerPath), /attempt无效/);
  const invalid = line({ operation: 'dsa.cache-request', traceId: 'one', transportId: 'bad', attempt: 1,
    category: 'control', method: 'GET', path: dataPath, stage: 'started' });
  assert.throws(() => countObservedCacheRequests([invalid, complete()].join('\n'), ['one'], consumerPath), /类别/);
});

test('只等待本trace日志完整，不补发数据请求；迟到日志齐全后保留零调用证明', async () => {
  let reads = 0; const waits = [];
  const result = await readCompletedCacheRequests(() => {
    reads += 1;
    return reads === 1 ? complete() : [transport('control', 'control'), complete()].join('\n');
  }, ['one'], consumerPath, async (ms) => waits.push(ms));
  assert.equal(reads, 2); assert.deepEqual(waits, [250]);
  assert.equal(result.dataAttempts, 0); assert.equal(result.controlAttempts, 1);
});

test('五次读取后仍缺日志失败；完整性等待不能吞掉身份冲突', async () => {
  let reads = 0, waits = 0;
  await assert.rejects(readCompletedCacheRequests(() => { reads += 1; return complete(); },
    ['one'], consumerPath, async () => { waits += 1; }), CacheObservationPending);
  assert.equal(reads, 5); assert.equal(waits, 4);
  reads = 0;
  await assert.rejects(readCompletedCacheRequests(() => { reads += 1;
    return [transport('same', 'control'), transport('same', 'data'), complete()].join('\n');
  }, ['one'], consumerPath, async () => assert.fail('非法观察不能继续等待')), /冲突|重复/);
  assert.equal(reads, 1);
});
