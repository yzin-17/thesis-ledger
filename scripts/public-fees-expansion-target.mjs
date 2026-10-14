import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';

// 只临时切换一条公共收费路由；目标任务终止后按当前修订恢复，保留其他配置。
const market = process.argv.includes('--us-read') ? 'US' : 'HK';
const key = { kind: 'data', market, assetType: 'STOCK', capability: 'HISTORICAL_PUBLIC_FEES' };
const identity = (value) =>
  JSON.stringify(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
const target = {
  providerId: `official-${market.toLowerCase()}-rules`,
  upstreamSource: `${market.toLowerCase()}-stock-public-fees`,
};
async function api(path, body) {
  const response = await fetch(`http://127.0.0.1:3000${path}`, {
    method: body ? 'PUT' : 'GET',
    headers: { 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(120000),
  });
  const value = await response.json();
  assert(response.ok, `${path}: ${response.status}: ${JSON.stringify(value).slice(0, 1000)}`);
  return value;
}
const original = await api('/api/market-data/policy');
const selected = [
  ...original.routes.filter((route) => identity(route.key) !== identity(key)),
  { key, targets: [target] },
];
const update = (current, routes) =>
  api('/api/market-data/policy', {
    contractVersion: 3,
    consumer: 'thesis-ledger',
    requestId: randomUUID(),
    revision: current.revision + 1,
    enabled: current.enabled,
    routes,
  });
await update(original, selected);
try {
  assert.equal((await api('/api/market-data/policy')).syncState, 'applied');
  if (market === 'HK') {
    const child = spawnSync(
      process.execPath,
      ['scripts/multimarket-rules-target.mjs', '--expanded-fees', '--broker-costs', '--run'],
      { stdio: 'inherit', timeout: 300000 },
    );
    assert.equal(child.status, 0, child.error?.message ?? '港股目标未成功');
  } else {
    const modelRunId = process.argv
      .find((arg) => arg.startsWith('--model-run='))
      ?.slice('--model-run='.length);
    assert(modelRunId, '美股读取验收需要已有归一化任务 --model-run=<任务ID>');
    const saved = await api(`/api/v1/backtests/runs/${modelRunId}`);
    assert(saved.result?.executionModelDisclosure?.model, '已有任务没有冻结执行模型');
    // 请求使用容器已有Data Token，仅读HTTP；凭证不进入输出，不修改数据库或文件。
    const program = `
      import assert from 'node:assert/strict';
      import { combinePublicFeesExecutionModelV3 } from './apps/server/dist/src/backtest/backtest-public-fees-model-v3.js';
      const wire = { contractVersion: 3, consumer: 'thesis-ledger', requestId: 'p6-us-expanded-fees-read',
        routeKey: ${JSON.stringify(key)}, routeTarget: { ...${JSON.stringify(target)}, routeIndex: 0 },
        symbol: 'GME.US', range: { start: '2024-05-10', end: '2024-05-24' } };
      const r = await fetch(new URL('/api/v3/thesis-ledger/market/public-fees', process.env.DSA_BASE_URL), {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + process.env.THESIS_LEDGER_DSA_TOKEN },
        body: JSON.stringify(wire), signal: AbortSignal.timeout(120000) });
      const response = await r.json(); assert.equal(r.status, 200);
      assert(response.segments.every(s => s.charges.some(c => c.code === 'tradingActivityFee' && c.basis === 'actualShares')));
      const model = ${JSON.stringify(saved.result.executionModelDisclosure.model)};
      assert.throws(() => combinePublicFeesExecutionModelV3(model, response), /实际股数公共收费不能绑定归一化数量/);
      console.log(JSON.stringify({ httpStatus: r.status, response, normalizedConsumerRejected: true,
        referenceRunId: ${JSON.stringify(modelRunId)}, actualSharesExecutionQualified: false }));
    `;
    const child = spawnSync(
      'docker',
      ['exec', '-i', 'thesis-ledger-dev-backtest-worker-1', 'node', '--input-type=module', '-'],
      { input: program, encoding: 'utf8', timeout: 150000, maxBuffer: 2 * 1024 * 1024 },
    );
    assert.equal(child.status, 0, child.stderr);
    process.stdout.write(child.stdout);
  }
} finally {
  const current = await api('/api/market-data/policy');
  const chosen = current.routes.find((route) => identity(route.key) === identity(key));
  if (JSON.stringify(chosen?.targets) === JSON.stringify([target])) {
    await update(current, [
      ...current.routes.filter((route) => identity(route.key) !== identity(key)),
      ...original.routes.filter((route) => identity(route.key) === identity(key)),
    ]);
    console.error(JSON.stringify({ stage: 'original-fee-route-restored', market }));
  } else throw new Error('其他操作已修改收费路由；保留现态，不覆盖');
}
