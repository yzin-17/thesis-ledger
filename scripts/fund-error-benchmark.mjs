import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { marketRouteKeyIdV3, fundNavHistorySchema } from '../packages/schemas/dist/index.js';
import { sourceState } from '../../thesis-ledger-infra/scripts/research-dual-read.mjs';
import { sql } from '../../thesis-ledger-infra/scripts/research-state-backup.mjs';
import { readFundTarget, fundProviderState } from './fund-calibration-target.mjs';
import { fundPolicyFingerprint } from './fund-nav-route-case.mjs';
import {
  disclosurePolicy,
  assertQualifiedDisclosureSource,
} from './fund-disclosure-acceptance-guards.mjs';
import { disclosurePrivatePath, disclosurePointsSql } from './fund-disclosure-acceptance.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const format = 'fund-error-benchmark-v1',
  authorization = '--authorized-fund-error-benchmark';
const key = {
  kind: 'data',
  market: 'CN',
  assetType: 'MUTUAL_FUND',
  capability: 'FUND_NAV_HISTORY',
};
const target = { providerId: 'efinance', upstreamSource: 'eastmoney' };
const historyPath =
  '/api/market/161725.OF/fund-nav/history?start=2026-10-19&end=2026-10-19&limit=1';
const sourcePath = resolve(
  root,
  '.recovery-artifacts/fund-disclosure-20261021-36449592/recovery.json',
);
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const inputs = () =>
  Object.fromEntries(
    ['fund-error-benchmark.mjs', 'fund-error-benchmark-runtime.cjs'].map((n) => [
      n,
      digest(readFileSync(new URL(n, import.meta.url))),
    ]),
  );
const load = (path) => JSON.parse(readFileSync(disclosurePrivatePath(path, true)));
const current = () => {
  const s = sourceState();
  return { ...readFundTarget(), points: sql(s.containers.postgres.Id, disclosurePointsSql()) };
};
export function benchmarkArguments(args) {
  if (!args.length) return { mode: 'plan' };
  if (args.length === 2 && args[0] === '--plan-file') return { mode: 'plan', path: args[1] };
  assert(
    args.length === 3 && ['--execute', '--recover'].includes(args[0]) && args[2] === authorization,
  );
  return { mode: args[0].slice(2), path: args[1] };
}
export function assertBenchmarkPlan(plan) {
  assert.equal(plan.format, format);
  assert.match(plan.caseId, /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
  const original = disclosurePolicy(plan.original),
    temporary = disclosurePolicy(plan.temporary);
  assert(original.enabled);
  assert(!original.routes.some((r) => marketRouteKeyIdV3(r.key) === marketRouteKeyIdV3(key)));
  assert.equal(temporary.revision, original.revision + 1);
  assert.equal(
    fundPolicyFingerprint(temporary),
    fundPolicyFingerprint({
      ...original,
      routes: [...original.routes, { key, targets: [target] }],
    }),
  );
  assert.equal(plan.source.path, sourcePath);
  assert.match(plan.source.sha256, /^[0-9a-f]{64}$/);
}
export function assertBenchmarkHistory(raw) {
  const points = fundNavHistorySchema.parse(raw);
  assert.equal(points.length, 1);
  const p = points[0];
  assert(
    p.symbol === '161725.OF' &&
      p.provider === 'efinance' &&
      p.unitNav > 0 &&
      p.navDate.slice(0, 10) === '2026-10-19',
  );
  assert(['delayed', 'stale'].includes(p.freshness));
  assert(p.fallbackUsed === false && p.servedFromCache === false);
  return points;
}
export async function restoreBenchmarkPolicy(api, plan) {
  assertBenchmarkPlan(plan);
  const state = await api('GET', '/api/market-data/policy');
  if (fundPolicyFingerprint(state) !== fundPolicyFingerprint(plan.original)) {
    assert.equal(state.revision, plan.temporary.revision);
    assert.equal(state.requestId, plan.temporary.requestId);
    assert.equal(fundPolicyFingerprint(state), fundPolicyFingerprint(plan.temporary));
    await api('PUT', '/api/market-data/policy', {
      ...plan.original,
      revision: state.revision + 1,
      requestId: randomUUID(),
      expectedRevision: state.revision,
    });
  }
  const after = await api('GET', '/api/market-data/policy');
  assert.equal(fundPolicyFingerprint(after), fundPolicyFingerprint(plan.original));
  assert(
    after.syncState === 'applied' && !after.effectiveStale && after.dsaRevision === after.revision,
  );
  return {
    revision: after.revision,
    routes: after.routes.length,
    originalRouteChoicesRestored: true,
  };
}
async function main() {
  const args = benchmarkArguments(process.argv.slice(2));
  let record;
  const api = async (method, path, body) => {
    if (method === 'GET')
      assert(
        [
          '/api/market-data/policy',
          '/api/market-data/providers',
          '/api/market-data/routes/capabilities?contractVersion=3',
          historyPath,
        ].includes(path),
      );
    else assert(method === 'PUT' && path === '/api/market-data/policy');
    const response = await fetch('http://127.0.0.1:3000' + path, {
      method,
      signal: AbortSignal.timeout(30000),
      headers: {
        'content-type': 'application/json',
        ...(process.env.SERVER_API_TOKEN
          ? { authorization: `Bearer ${process.env.SERVER_API_TOKEN}` }
          : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const raw = await response.json();
    if (path === historyPath) {
      record.historyHttpStatus = response.status;
      record.historyRaw = raw;
      save();
    }
    assert(response.ok, `基金误差基准 ${method} ${path.split('?')[0]} 返回 ${response.status}`);
    return raw;
  };
  let output;
  const save = () => {
    const next = resolve(output, `recovery-${randomUUID()}.next`);
    writeFileSync(next, JSON.stringify(record, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    renameSync(next, resolve(output, 'recovery.json'));
  };
  if (args.mode === 'plan') {
    const source = load(sourcePath);
    assertQualifiedDisclosureSource(source);
    assert.equal(source.plan.adjustedPriceCase, true);
    const [state, p, catalog] = await Promise.all([
      api('GET', '/api/market-data/policy'),
      api('GET', '/api/market-data/providers'),
      api('GET', '/api/market-data/routes/capabilities?contractVersion=3'),
    ]);
    assert(
      state.syncState === 'applied' &&
        !state.effectiveStale &&
        state.dsaRevision === state.revision,
    );
    const provider = p.providers.find((x) => x.providerId === 'efinance');
    assert(provider?.enabled && provider.configured);
    const choices = catalog.entries.filter(
      (x) =>
        marketRouteKeyIdV3(x.key) === marketRouteKeyIdV3(key) &&
        x.target.providerId === 'efinance' &&
        x.target.upstreamSource === 'eastmoney',
    );
    assert(choices.length === 1 && choices[0].state === 'ready');
    const original = disclosurePolicy(state),
      plan = {
        format,
        caseId: randomUUID(),
        original,
        temporary: disclosurePolicy({
          ...original,
          revision: original.revision + 1,
          requestId: randomUUID(),
          routes: [...original.routes, { key, targets: [target] }],
        }),
        source: { path: sourcePath, sha256: digest(readFileSync(sourcePath)) },
        baseline: current(),
        providers: fundProviderState(p.providers),
        inputHashes: inputs(),
      };
    assertBenchmarkPlan(plan);
    if (args.path)
      writeFileSync(disclosurePrivatePath(args.path), JSON.stringify(plan, null, 2) + '\n', {
        mode: 0o600,
        flag: 'wx',
      });
    console.log(
      JSON.stringify({
        mode: 'read-only-plan',
        caseId: plan.caseId,
        policy: state.revision,
        historyRequests: 1,
        historyDate: '2026-10-19',
        priceDataRequests: 0,
        accountWrites: 0,
        targetWritten: false,
        path: args.path,
      }),
    );
    return;
  }
  const prepared = load(args.path),
    plan = args.mode === 'execute' ? prepared : prepared.plan;
  assertBenchmarkPlan(plan);
  output = disclosurePrivatePath(
    resolve(
      root,
      '.recovery-artifacts',
      `fund-error-benchmark-20261021-${plan.caseId.slice(0, 8)}`,
    ),
  );
  if (args.mode === 'execute') {
    assert.deepEqual(plan.inputHashes, inputs());
    assert.deepEqual(current(), plan.baseline);
    assert(!existsSync(output));
    assert.equal(digest(readFileSync(sourcePath)), plan.source.sha256);
    assertQualifiedDisclosureSource(load(sourcePath));
    mkdirSync(output, { mode: 0o700 });
    record = { plan, phase: 'prepared', historyGetsReserved: 0 };
    save();
  } else {
    assert.equal(resolve(args.path), resolve(output, 'recovery.json'));
    assert((lstatSync(output).mode & 0o077) === 0);
    record = prepared;
  }
  let failure;
  if (args.mode === 'execute')
    try {
      assert.deepEqual(
        fundProviderState((await api('GET', '/api/market-data/providers')).providers),
        plan.providers,
      );
      const state = await api('GET', '/api/market-data/policy');
      assert.equal(state.revision, plan.original.revision);
      assert.equal(fundPolicyFingerprint(state), fundPolicyFingerprint(plan.original));
      await api('PUT', '/api/market-data/policy', {
        ...plan.temporary,
        expectedRevision: plan.original.revision,
      });
      const applied = await api('GET', '/api/market-data/policy');
      assert(
        applied.syncState === 'applied' &&
          !applied.effectiveStale &&
          applied.dsaRevision === plan.temporary.revision &&
          applied.revision === plan.temporary.revision,
      );
      assert.equal(fundPolicyFingerprint(applied), fundPolicyFingerprint(plan.temporary));
      record.historyGetsReserved = 1;
      record.phase = 'history-started';
      save();
      record.history = assertBenchmarkHistory(await api('GET', historyPath));
      record.phase = 'history-returned';
      save();
      const s = sourceState();
      assert.deepEqual(s.state.identities, plan.baseline.state.identities);
      const result = spawnSync(
        'docker',
        [
          'exec',
          '-i',
          s.containers['thesis-ledger'].Id,
          'node',
          '-e',
          readFileSync(new URL('fund-error-benchmark-runtime.cjs', import.meta.url), 'utf8'),
        ],
        {
          input: JSON.stringify({ format, source: load(sourcePath), history: record.history }),
          encoding: 'utf8',
          timeout: 60000,
          maxBuffer: 4 * 1024 * 1024,
        },
      );
      const line = (result.stdout ?? '')
        .split('\n')
        .find((x) => x.startsWith('FUND_ERROR_RESULT=') || x.startsWith('FUND_ERROR_FAILURE='));
      assert(line, '纯计算缺少回执');
      record.calculation = JSON.parse(line.slice(line.indexOf('=') + 1));
      save();
      assert.equal(result.status, 0, '保留基准计算失败回执');
    } catch (error) {
      failure = error;
      record.failure = error.message;
      save();
    }
  try {
    record.restored = await restoreBenchmarkPolicy(api, plan);
    save();
  } catch (error) {
    failure ??= error;
    record.restoreFailure = error.message;
    save();
  }
  try {
    assert.deepEqual(current(), plan.baseline);
    assert.deepEqual(
      fundProviderState((await api('GET', '/api/market-data/providers')).providers),
      plan.providers,
    );
    record.protection = {
      passed: true,
      originalTables: 13,
      retainedResults: 57,
      allExistingPointsUnchanged: true,
      modelRequests: 0,
    };
  } catch (error) {
    failure ??= error;
    record.protectionFailure = error.message;
  }
  record.phase = failure ? 'recovery-required' : args.mode === 'recover' ? 'recovered' : 'passed';
  save();
  if (failure) throw failure;
  if (args.mode === 'execute')
    writeFileSync(resolve(output, 'report.json'), JSON.stringify(record, null, 2) + '\n', {
      mode: 0o600,
      flag: 'wx',
    });
  console.log(
    JSON.stringify({
      phase: record.phase,
      output,
      historyGets: record.historyGetsReserved,
      estimatedNav: record.calculation?.estimatedNav,
      officialNav: record.calculation?.officialNav,
      absoluteError: record.calculation?.absoluteError,
      relativeAbsoluteError: record.calculation?.relativeAbsoluteError,
      restored: record.restored,
      projectModelRequests: 0,
    }),
  );
}
if (process.argv[1] === fileURLToPath(import.meta.url))
  await main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
