import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { controlledHash, controlledFingerprint } from './ai-controlled-config-contract.mjs';
import { createLocalApi } from './market-route-failover-acceptance.mjs';
import { readFundTarget, fundProviderState } from './fund-calibration-target.mjs';
import { fundPolicyFingerprint } from './fund-nav-route-case.mjs';
import { sourceState } from '../../thesis-ledger-infra/scripts/research-dual-read.mjs';
import { marketRouteKeyIdV3 } from '../packages/schemas/dist/index.js';

const key = {
  kind: 'bar',
  market: 'CN',
  assetType: 'ETF',
  capability: 'DAILY_BAR',
  timeframe: '1d',
  adjustment: 'qfq',
};
const target = { providerId: 'hithink', upstreamSource: 'fund-market-historical', routeIndex: 0 };
const sourcePaths = [
  'api/data_app.py',
  'api/thesis_ledger_chart_v3.py',
  'src/services/thesis_ledger_provider_runtime.py',
  'src/services/thesis_ledger_bar_route_execution.py',
  'data_provider/thesis_ledger_sources/hithink.py',
];
const hashes = () =>
  Object.fromEntries(
    sourcePaths.map((path) => [
      path,
      controlledHash(readFileSync(new URL(`../../daily-stock-analysis/${path}`, import.meta.url))),
    ]),
  );
const inputHashes = () =>
  Object.fromEntries(
    ['market-route-cold.runtime.py', 'market-route-cold-acceptance.mjs'].map((path) => [
      path,
      controlledHash(readFileSync(new URL(path, import.meta.url))),
    ]),
  );

export function verifyColdPrimary(plan, result) {
  assert.equal(result.status, 200);
  assert(result.wholeProcessMs > 0 && result.wholeProcessMs <= 5000, '整个新进程超过主源 5 秒上限');
  assert(result.requestMs >= 0 && result.processRuntimeMs >= result.requestMs);
  assert(result.wholeProcessMs >= result.processRuntimeMs);
  assert.equal(result.runtimeInitiallyAbsent, true);
  assert.equal(result.lifespanStarted, false);
  assert.deepEqual(result.modelModulesLoaded, []);
  assert.deepEqual(result.sourceHashes, plan.sourceHashes, 'DSA 关键产物未匹配');
  const body = result.body;
  assert.equal(body.contractVersion, 3);
  assert.equal(body.purpose, 'interactive-chart');
  assert.equal(body.symbol, '510300.SH');
  assert.equal(body.requestId, plan.request.requestId);
  assert.deepEqual(body.routeKey, key);
  assert.deepEqual(body.provenance, { ...target, effectivePolicyRevision: plan.policyRevision });
  assert.deepEqual(
    body.bars.map((row) => row.timestamp.slice(0, 10)),
    ['2024-07-15', '2024-07-16', '2024-07-17', '2024-07-18', '2024-07-19'],
  );
  assert(body.bars.every((row) => row.completionStatus === 'complete' && row.close > 0));
  assert.match(body.inputFingerprint, /^[a-f0-9]{64}$/);
  assert(body.sourcePriceBasis);
}

export async function prepareColdPrimary() {
  const api = createLocalApi('http://127.0.0.1:3000');
  const [policy, providers] = await Promise.all([
    api.get('/api/market-data/policy'),
    api.get('/api/market-data/providers'),
  ]);
  assert.equal(policy.syncState, 'applied');
  assert.equal(policy.effectiveStale, false);
  assert.equal(policy.dsaRevision, policy.revision);
  const selected = policy.routes.find(
    (row) => marketRouteKeyIdV3(row.key) === marketRouteKeyIdV3(key),
  );
  assert(selected, '精确路由未选中');
  assert.deepEqual(selected.targets, [
    { providerId: target.providerId, upstreamSource: target.upstreamSource },
  ]);
  assert.equal(
    providers.providers.find((row) => row.providerId === target.providerId)?.enabled,
    true,
  );
  const baseline = readFundTarget();
  assert.equal(baseline.state.protection.database, 'thesis_ledger');
  assert.equal(baseline.state.protection.owner, 'thesis_ledger');
  assert.equal(baseline.state.protection.activeBacktests, 0);
  assert(Object.values(baseline.state.counters).every((value) => value === 0));
  const value = {
    version: 1,
    baseline,
    policyRevision: policy.revision,
    policyFingerprint: fundPolicyFingerprint(policy),
    providers: fundProviderState(providers.providers),
    inputHashes: inputHashes(),
    sourceHashes: hashes(),
    request: {
      contractVersion: 3,
      purpose: 'interactive-chart',
      requestId: randomUUID(),
      symbol: '510300.SH',
      routeKey: key,
      routeTarget: target,
      start: '2024-07-15',
      end: '2024-07-19',
    },
  };
  return { ...value, fingerprint: controlledFingerprint(value) };
}

export async function applyColdPrimary(plan) {
  const { fingerprint, ...value } = plan;
  assert.equal(plan.version, 1);
  assert.equal(fingerprint, controlledFingerprint(value));
  const before = await prepareColdPrimary();
  for (const field of [
    'baseline',
    'policyRevision',
    'policyFingerprint',
    'providers',
    'inputHashes',
    'sourceHashes',
  ])
    assert.deepEqual(before[field], plan[field]);
  assert.deepEqual({ ...before.request, requestId: plan.request.requestId }, plan.request);
  const state = sourceState();
  const program = readFileSync(new URL('./market-route-cold.runtime.py', import.meta.url), 'utf8');
  const started = performance.now();
  const processResult = spawnSync(
    'docker',
    ['exec', '-i', '-w', '/app', state.containers.dsa.Id, 'python', '-c', program],
    {
      input: JSON.stringify(plan.request),
      encoding: 'utf8',
      timeout: 20000,
      maxBuffer: 2 * 1024 * 1024,
    },
  );
  const wholeProcessMs = performance.now() - started;
  const lines = (processResult.stdout ?? '')
    .split('\n')
    .filter((line) => line.startsWith('ROUTE_COLD_RESULT='));
  const result = {
    plan,
    processStatus: processResult.status,
    wholeProcessMs,
    passed: false,
    timedOut: processResult.error?.code === 'ETIMEDOUT',
  };
  if (processResult.status === 0 && lines.length === 1) {
    result.observation = {
      ...JSON.parse(lines[0].slice('ROUTE_COLD_RESULT='.length)),
      wholeProcessMs,
    };
    try {
      verifyColdPrimary(plan, result.observation);
      result.passed = true;
    } catch (error) {
      result.failure = error.message;
    }
  } else result.failure = '专用冷态进程失败或超时，保留有限回执，不输出 SDK 日志或凭据';
  const after = await prepareColdPrimary();
  result.after = {
    baseline: after.baseline,
    policyRevision: after.policyRevision,
    policyFingerprint: after.policyFingerprint,
    providers: after.providers,
  };
  try {
    for (const field of Object.keys(result.after))
      assert.deepEqual(result.after[field], plan[field]);
    result.protectionPassed = true;
  } catch {
    result.passed = false;
    result.protectionFailure = '原数据/来源/路由保护变化，禁止自动覆盖';
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2);
    assert(
      args.length === 0 ||
        (args.length === 3 &&
          args[0] === '--apply' &&
          args[2] === '--authorized-route-cold-primary'),
    );
    const result =
      args.length === 0
        ? await prepareColdPrimary()
        : await applyColdPrimary(JSON.parse(readFileSync(args[1], 'utf8')));
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    if (result.passed === false) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`冷态预检停止：${String(error.message).slice(0, 1000)}\n`);
    process.exitCode = 1;
  }
}
