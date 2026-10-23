import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import {
  benchmarkArguments,
  assertBenchmarkPlan,
  assertBenchmarkHistory,
  restoreBenchmarkPolicy,
} from './fund-error-benchmark.mjs';

const uuid = '11111111-1111-4111-8111-111111111111';
const key = {
  kind: 'data',
  market: 'CN',
  assetType: 'MUTUAL_FUND',
  capability: 'FUND_NAV_HISTORY',
};
const target = { providerId: 'efinance', upstreamSource: 'eastmoney' };
const plan = () => ({
  format: 'fund-error-benchmark-v1',
  caseId: uuid,
  original: {
    contractVersion: 3,
    consumer: 'thesis-ledger',
    requestId: uuid,
    revision: 160,
    enabled: true,
    routes: [],
  },
  temporary: {
    contractVersion: 3,
    consumer: 'thesis-ledger',
    requestId: uuid,
    revision: 161,
    enabled: true,
    routes: [{ key, targets: [target] }],
  },
  source: {
    path: fileURLToPath(
      new URL(
        '../.recovery-artifacts/fund-disclosure-20261021-36449592/recovery.json',
        import.meta.url,
      ),
    ),
    sha256: 'a'.repeat(64),
  },
});
const point = {
  version: 3,
  symbol: '161725.OF',
  unitNav: 0.53,
  navDate: '2026-10-19T00:00:00Z',
  provider: 'efinance',
  fetchedAt: '2026-10-21T01:00:00Z',
  freshness: 'delayed',
  fallbackUsed: false,
  servedFromCache: false,
};
test('默认只读且执行或恢复都需明确标志', () => {
  assert.deepEqual(benchmarkArguments([]), { mode: 'plan' });
  assert.throws(() => benchmarkArguments(['--execute', 'x']));
  assert.equal(
    benchmarkArguments(['--recover', 'x', '--authorized-fund-error-benchmark']).mode,
    'recover',
  );
});
test('有限计划只增加一条精确历史来源', () => {
  assertBenchmarkPlan(plan());
  const wrong = structuredClone(plan());
  wrong.temporary.routes[0].targets[0].providerId = 'akshare';
  assert.throws(() => assertBenchmarkPlan(wrong));
  const extra = structuredClone(plan());
  extra.temporary.routes.push(extra.temporary.routes[0]);
  assert.throws(() => assertBenchmarkPlan(extra));
});
test('历史输入只接受一个精确日期且正数可用的无回退实源点', () => {
  assert.equal(assertBenchmarkHistory([point])[0].unitNav, 0.53);
  for (const changed of [
    { unitNav: 0 },
    { freshness: 'unavailable' },
    { navDate: '2026-10-20T00:00:00Z' },
    { symbol: '000001.OF' },
    { servedFromCache: true },
    { fallbackUsed: true },
  ])
    assert.throws(() => assertBenchmarkHistory([{ ...point, ...changed }]));
  assert.throws(() => assertBenchmarkHistory([]));
  assert.throws(() => assertBenchmarkHistory([point, point]));
  assert.equal(assertBenchmarkHistory([{ ...point, freshness: 'stale' }]).length, 1);
});
test('成功或失败后的撤回均只恢复自有临时政策，重复恢复不写', async () => {
  const p = plan();
  let state = { ...p.temporary, syncState: 'applied', dsaRevision: 161, effectiveStale: false },
    writes = 0;
  const api = async (method, path, body) => {
    assert.equal(path, '/api/market-data/policy');
    if (method === 'PUT') {
      writes++;
      assert.equal(body.expectedRevision, 161);
      state = { ...body, syncState: 'applied', dsaRevision: body.revision, effectiveStale: false };
    }
    return state;
  };
  assert.deepEqual(await restoreBenchmarkPolicy(api, p), {
    revision: 162,
    routes: 0,
    originalRouteChoicesRestored: true,
  });
  await restoreBenchmarkPolicy(api, p);
  assert.equal(writes, 1);
});
test('并行政策或未知请求身份阻止恢复覆盖', async () => {
  const p = plan();
  let writes = 0;
  for (const patch of [{ revision: 162 }, { requestId: '22222222-2222-4222-8222-222222222222' }])
    await assert.rejects(
      restoreBenchmarkPolicy(async (method) => {
        if (method === 'PUT') writes++;
        return { ...p.temporary, ...patch };
      }, p),
    );
  assert.equal(writes, 0);
});
