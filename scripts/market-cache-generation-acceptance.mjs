import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { stripVTControlCharacters } from 'node:util';
import { setTimeout as waitForLog } from 'node:timers/promises';
import { CacheObservationPending } from './market-cache-request-evidence.mjs';
import { parseCurrentQuote } from '../apps/server/dist/src/market/market-current-data.js';
import { createLocalApi } from './market-route-failover-acceptance.mjs';
import { localOrigin } from './market-status-functional-acceptance.mjs';
import { createCacheGenerationCase, executeCacheGenerationCase, restoreCacheGenerationCase,
  cacheRouteKey, quotePath } from './market-cache-generation-case.mjs';

export function countQuoteDataCalls(log, traces) {
  let count = 0;
  const completed = new Set();
  for (const rawLine of log.split('\n')) {
    const line = stripVTControlCharacters(rawLine);
    const start = line.indexOf('{"timestamp"');
    if (start < 0) continue;
    let item;
    try { item = JSON.parse(line.slice(start)); } catch { continue; }
    if (traces.includes(item.traceId) && item.operation === 'http.request' && item.path === quotePath)
      completed.add(item.traceId);
    if (traces.includes(item.traceId) && item.operation === 'market.quote' &&
      item.stage === 'dsa-call' && item.status === 'started') count += 1;
  }
  if (!traces.every((trace) => completed.has(trace)))
    throw new CacheObservationPending('缺少请求完成日志，不能把缺日志算成零数据请求');
  return count;
}

export async function collectQuoteDataCalls(readLog, traces, pause = waitForLog) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try { return countQuoteDataCalls(await readLog(), traces); }
    catch (error) {
      if (!(error instanceof CacheObservationPending) || attempt === 4) throw error;
      await pause(250);
    }
  }
}

export function targetProbe(origin) {
  return async (phase) => {
    const since = new Date(Date.now() - 1000).toISOString();
    const traces = [];
    async function read() {
      const traceId = randomUUID(); traces.push(traceId);
      const response = await fetch(origin + quotePath, { signal: AbortSignal.timeout(10000),
        headers: { 'x-trace-id': traceId,
          ...(process.env.SERVER_API_TOKEN ? { authorization: `Bearer ${process.env.SERVER_API_TOKEN}` } : {}) } });
      assert.equal(response.headers.get('x-trace-id'), traceId, '目标未关联验收trace');
      const raw = await response.json();
      return { status: response.status, raw };
    }
    const first = await read();
    let second;
    if (phase !== 'disabled') {
      assert.equal(first.status, 200, '目标报价未成功');
      second = await read(); assert.equal(second.status, 200);
    } else {
      assert.equal(first.status, 503, '关闭功能必须沿原控制错误返回');
      assert.equal(first.raw.error, 'control-rejected');
    }
    // Docker logs为只读检查；只统计本案例trace的Server数据请求，不称为物理SDK页数。
    const readLog = () => execFileSync('docker', ['logs', '--since', since, 'thesis-ledger-dev-thesis-ledger-1'],
      { encoding: 'utf8', timeout: 10000, maxBuffer: 4 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    const dataCalls = await collectQuoteDataCalls(readLog, traces);
    if (phase === 'disabled') return { rejected: true, status: first.status, dataCalls, traces };
    const one = parseCurrentQuote(first.raw, '600519.SH');
    const two = parseCurrentQuote(second.raw, '600519.SH');
    assert.equal(one.provider, two.provider);
    return { firstCached: one.servedFromCache === true, secondCached: two.servedFromCache === true,
      dataCalls, provider: one.provider, traces };
  };
}

async function main() {
  const args = process.argv.slice(2);
  const origin = localOrigin(process.env.API_BASE_URL ?? 'http://127.0.0.1:3000');
  const api = createLocalApi(origin);
  const recovery = args.indexOf('--recover');
  if (recovery >= 0) {
    assert(args.includes('--authorized-cache-recovery'), '恢复需要本案例明确授权');
    const record = JSON.parse(await fs.readFile(args[recovery + 1], 'utf8'));
    assert(record.origin === origin && record.owned === true, '恢复记录目标或所有权不明，停止覆盖');
    const journal = async (next) => {
      await fs.writeFile(args[recovery + 1] + '.tmp', JSON.stringify({ origin, ...next }, null, 2), { mode: 0o600 });
      await fs.rename(args[recovery + 1] + '.tmp', args[recovery + 1]);
    };
    await restoreCacheGenerationCase(api.recovery, record.plan, journal);
    console.log(JSON.stringify({ phase: 'restored', caseId: record.plan.caseId })); return;
  }
  const plan = createCacheGenerationCase(await api.get('/api/market-data/policy'));
  if (!args.includes('--execute')) {
    console.log(JSON.stringify({ mode: 'read-only-preview', expectedPolicy: plan.baseline.revision,
      revisions: [plan.baseline.revision, plan.temporary.revision, plan.temporary.revision + 1],
      routeKey: cacheRouteKey, symbol: '600519.SH', change: '仅关闭并恢复此功能，目标/顺序不变' })); return;
  }
  assert(args.includes('--authorized-cache-case'), '临时政策变更需要本案例单独授权');
  assert(args.includes(`--expected-policy=${plan.baseline.revision}`), '政策已变化，停止执行');
  const root = await fs.mkdtemp(path.join(tmpdir(), 'tl-cache-generation-'));
  const destination = path.join(root, 'recovery.json');
  let previous = {};
  const journal = async (record) => {
    previous = { ...previous, ...record };
    await fs.writeFile(destination + '.tmp', JSON.stringify({ origin, ...previous }, null, 2), { mode: 0o600 });
    await fs.rename(destination + '.tmp', destination);
  };
  console.log(`恢复记录：${destination}`);
  console.log(JSON.stringify(await executeCacheGenerationCase(api, plan, journal, targetProbe(origin))));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('缓存验收未完成，请核对恢复记录；提交不明或并行修改时停止覆盖。'); process.exitCode = 1; });
}
