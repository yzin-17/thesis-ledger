import assert from 'node:assert/strict';
import { stripVTControlCharacters } from 'node:util';
import { setTimeout as waitForLog } from 'node:timers/promises';

const controlPath = '/api/v3/thesis-ledger/market/cache-context';
const dataPaths = new Set(['/api/v3/thesis-ledger/market/fund-nav',
  '/api/v3/thesis-ledger/market/fund-nav/history', '/api/v3/thesis-ledger/market/fund-holdings',
  '/api/v3/thesis-ledger/market/chip']);

export class CacheObservationPending extends Error {
  constructor(message) { super(message); this.name = 'CacheObservationPending'; }
}
const requireComplete = (condition, message) => {
  if (!condition) throw new CacheObservationPending(message);
};

/** 只重读本次日志以等待收集完成；不重新发起消费或数据请求。 */
export async function readCompletedCacheRequests(readLog, traces, consumerPath, wait = waitForLog) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try { return countObservedCacheRequests(await readLog(), traces, consumerPath); }
    catch (error) {
      if (!(error instanceof CacheObservationPending) || attempt === 4) throw error;
      await wait(250);
    }
  }
}

/** 原缓存HTTP尝试证据；没有本次消费完成和完整控制观察时不证明零。 */
export function countObservedCacheRequests(log, traces, consumerPath) {
  assert(traces.length > 0 && new Set(traces).size === traces.length, '验收trace必须非空且唯一');
  const completed = new Set();
  const transports = new Map();
  for (const raw of log.split('\n')) {
    const line = stripVTControlCharacters(raw);
    const start = line.indexOf('{"timestamp"');
    if (start < 0) continue;
    let item;
    try { item = JSON.parse(line.slice(start)); } catch { continue; }
    if (!traces.includes(item.traceId)) continue;
    if (item.operation === 'http.request' && item.path === consumerPath) completed.add(item.traceId);
    if (consumerPath === 'target-original-holdings-reader' && item.operation === 'market.cache-target-reader' &&
      item.capability === 'FUND_HOLDINGS' && item.stage === 'completed') completed.add(item.traceId);
    if (item.operation !== 'dsa.cache-request') continue;
    assert(typeof item.transportId === 'string' && item.transportId.length > 0 &&
      Number.isInteger(item.attempt) && item.attempt >= 1 && item.attempt <= 2,
    '传输ID或有界attempt无效');
    assert((item.category === 'control' && item.method === 'POST' && item.path === controlPath) ||
      (item.category === 'data' && item.method === 'GET' && dataPaths.has(item.path)),
    '控制/数据传输类别与实际路径不一致');
    assert(item.stage === 'started' || item.stage === 'settled', '传输观察阶段无效');
    const identity = JSON.stringify([item.traceId, item.category, item.method, item.path, item.attempt]);
    const record = transports.get(item.transportId) ?? { identity, item, stages: new Set() };
    assert(record.identity === identity && !record.stages.has(item.stage), '传输ID冲突或观察阶段重复');
    if (item.stage === 'settled') {
      requireComplete(record.stages.has('started'), '传输开始/结束观察不完整');
      assert(item.outcome === 'response' || item.outcome === 'error', '传输结束缺少结果');
    }
    record.stages.add(item.stage);
    transports.set(item.transportId, record);
  }
  requireComplete(traces.every((trace) => completed.has(trace)), '缺少本次消费完成日志，不能证明零请求');
  requireComplete([...transports.values()].every((record) => record.stages.size === 2), '传输开始/结束观察不完整');
  requireComplete(traces.every((trace) => [...transports.values()].some(({ item }) =>
    item.traceId === trace && item.category === 'control')), '缺少本次控制观察，不能证明零数据请求');
  const records = [...transports.values()].map(({ item }) => item);
  const dataByPath = {};
  for (const item of records) if (item.category === 'data') dataByPath[item.path] = (dataByPath[item.path] ?? 0) + 1;
  return { dataAttempts: records.filter((item) => item.category === 'data').length,
    controlAttempts: records.filter((item) => item.category === 'control').length, dataByPath };
}
