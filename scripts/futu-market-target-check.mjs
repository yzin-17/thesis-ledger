#!/usr/bin/env node
/** 临时选择富途指定能力路由，验收产品读取并按 CAS 复原既有策略。 */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import { quoteSchema, barSeriesSchema, marketRouteKeyIdV3, securityStaticInfoResponseSchema } from '../packages/schemas/dist/index.js';

const execute = process.argv.includes('--run');
const mode = process.env.FUTU_ACCEPTANCE_MODE ?? 'price';
assert.ok(['price', 'static'].includes(mode), '验收模式必须为 price 或 static');
const base = process.env.FUTU_ACCEPTANCE_API_URL ?? 'http://127.0.0.1:3000';
const output = path.resolve(process.env.FUTU_ACCEPTANCE_ARTIFACT_DIR ?? '.recovery-artifacts/futu-2026-10-09');
const samples = [
  { market: 'HK', assetType: 'STOCK', symbol: '00700.HK', start: '2026-10-01', end: '2026-10-08' },
  { market: 'HK', assetType: 'ETF', symbol: '02800.HK', start: '2026-10-01', end: '2026-10-08' },
  { market: 'US', assetType: 'STOCK', symbol: 'AAPL.US', start: '2026-09-30', end: '2026-10-07' },
  { market: 'US', assetType: 'ETF', symbol: 'SPY.US', start: '2026-09-30', end: '2026-10-07' },
];
const target = { providerId: 'futu', upstreamSource: 'futu' };
const previousFailures = process.env.FUTU_ACCEPTANCE_ONLY_FAILED_FROM;
const failureKeys = previousFailures ? new Set(JSON.parse(await readFile(previousFailures, 'utf8'))
  .filter((result) => result.status === 'failed')
  .map((result) => `${result.kind}:${result.symbol}:${result.adjustment ?? ''}`)) : null;
async function api(url, body, method = 'GET') {
  const response = await fetch(base + url, { method, signal: AbortSignal.timeout(25000),
    ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) });
  const value = await response.json();
  assert.ok(response.ok, `${method} ${url}: ${response.status} ${JSON.stringify(value)}`);
  return value;
}
async function receipt(name, value) {
  await writeFile(path.join(output, name + '.json'), JSON.stringify(value, null, 2) + '\n');
}
const policy = await api('/api/market-data/policy');
const routes = structuredClone(policy.routes);
const selected = [];
for (const sample of samples) {
  const key = { kind: 'data', market: sample.market, assetType: sample.assetType,
    capability: mode === 'static' ? 'SECURITY_STATIC_INFO' : 'REALTIME_QUOTE' };
  selected.push({ key, targets: [target] });
  if (mode === 'static') continue;
  for (const adjustment of ['none', 'qfq', 'hfq']) {
    selected.push({ key: { ...key, kind: 'bar', capability: 'DAILY_BAR', timeframe: '1d', adjustment }, targets: [target] });
  }
}
for (const route of selected) {
  const index = routes.findIndex((current) => marketRouteKeyIdV3(current.key) === marketRouteKeyIdV3(route.key));
  if (index < 0) routes.push(route); else routes[index] = route;
}
if (!execute) {
  console.log(JSON.stringify({ execute: false, mode, base, output, samples, temporaryRoutes: selected.length }));
  process.exit(0);
}
await mkdir(output, { recursive: true });
await receipt('policy-before', policy);
const results = [];
let attempted = false;
const writePolicy = (revision, nextRoutes) => api('/api/market-data/policy', {
  contractVersion: 3, consumer: 'thesis-ledger', requestId: randomUUID(), revision,
  enabled: policy.enabled, routes: nextRoutes,
}, 'PUT');
try {
  assert.equal(policy.syncState, 'applied');
  attempted = true;
  await writePolicy(policy.revision + 1, routes);
  const active = await api('/api/market-data/policy');
  assert.equal(active.revision, policy.revision + 1);
  assert.equal(active.syncState, 'applied');
  assert.deepEqual(active.routes, routes);
  await receipt('policy-active', active);
  for (const sample of samples) {
    if (mode === 'static') {
      try {
        const query = new URLSearchParams({ symbol: sample.symbol, assetType: sample.assetType });
        const raw = await api(`/api/market-data/security-static-info?${query}`);
        await receipt('static-' + sample.symbol, raw);
        const info = securityStaticInfoResponseSchema.parse(raw);
        assert.equal(info.symbol, sample.symbol);
        assert.equal(info.assetType, sample.assetType);
        assert.equal(info.policyRevision, active.revision);
        results.push({ kind: 'static', symbol: sample.symbol, status: 'passed', sharesPerLot: info.sharesPerLot });
      } catch (error) {
        results.push({ kind: 'static', symbol: sample.symbol, status: 'failed', message: String(error) });
      }
      continue;
    }
    if (!failureKeys || failureKeys.has(`quote:${sample.symbol}:`)) {
    try {
      const raw = await api(`/api/market/${sample.symbol}/quote?assetType=${sample.assetType}`);
      await receipt('quote-' + sample.symbol, raw);
      const quote = quoteSchema.parse(raw);
      assert.equal(quote.symbol, sample.symbol);
      assert.equal(quote.provider, 'futu');
      assert.equal(quote.upstreamSource, 'futu');
      results.push({ kind: 'quote', symbol: sample.symbol, status: 'passed', marketTime: quote.marketTime });
    } catch (error) {
      results.push({ kind: 'quote', symbol: sample.symbol, status: 'failed', message: String(error) });
    }
    }
    for (const adjustment of ['none', 'qfq', 'hfq']) {
      if (failureKeys && !failureKeys.has(`bars:${sample.symbol}:${adjustment}`)) continue;
      try {
        const query = new URLSearchParams({ assetType: sample.assetType, timeframe: '1d', adjustment,
          start: sample.start, end: sample.end, acceptance: 'interactive', refresh: '1' });
        const raw = await api(`/api/market/${sample.symbol}/bars?${query}`);
        await receipt('bars-' + sample.symbol + '-' + adjustment, raw);
        const series = barSeriesSchema.parse(raw);
        assert.equal(series.identity.symbol, sample.symbol);
        assert.equal(series.identity.assetType, sample.assetType);
        assert.equal(series.identity.adjustment, adjustment);
        assert.equal(series.provenance.providerId, 'futu');
        assert.equal(series.provenance.upstreamSource, 'futu');
        assert.ok(series.points.length > 0);
        const dates = series.points.map((point) => point.timestamp.slice(0, 10));
        assert.deepEqual(dates, [...new Set(dates)].sort());
        assert.ok(dates.every((date) => date >= sample.start && date <= sample.end));
        results.push({ kind: 'bars', symbol: sample.symbol, adjustment, status: 'passed', rows: dates.length });
      } catch (error) {
        results.push({ kind: 'bars', symbol: sample.symbol, adjustment, status: 'failed', message: String(error) });
      }
    }
  }
  await receipt('results', results);
  assert.equal(results.filter((result) => result.status === 'failed').length, 0, '产品读取存在失败，详见 results.json');
  if (process.argv.includes('--hold-for-browser')) {
    console.log('浏览器验收窗口已就绪；收到换行或三分钟后按 CAS 恢复原路由。');
    const input = createInterface({ input: process.stdin });
    await new Promise(resolve => {
      const timer = setTimeout(resolve, 180000);
      input.once('line', () => { clearTimeout(timer); resolve(); });
      input.once('close', () => { clearTimeout(timer); resolve(); });
    });
    input.close();
  }
} finally {
  if (attempted) {
    const current = await api('/api/market-data/policy');
    if (current.revision === policy.revision + 1) {
      assert.deepEqual(current.routes, routes, '当前策略不是本次写入，不能覆盖');
      await writePolicy(current.revision + 1, policy.routes);
    } else {
      assert.equal(current.revision, policy.revision, '存在并行策略修订，停止自动复原');
    }
    const restored = await api('/api/market-data/policy');
    assert.deepEqual(restored.routes, policy.routes);
    assert.equal(restored.enabled, policy.enabled);
    assert.equal(restored.syncState, 'applied');
    await receipt('policy-restored', restored);
  }
  await receipt('results', results);
  console.log(JSON.stringify({ output, passed: results.filter((result) => result.status === 'passed').length,
    failed: results.filter((result) => result.status === 'failed').length }));
}
