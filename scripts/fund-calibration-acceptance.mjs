import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createFundCalibrationPlan,
  assertFundCalibrationPlan,
} from './fund-calibration-guards.mjs';
import { executeOwnedFundCase, settleOwnedFundCase } from './fund-calibration-case.mjs';
import { restoreFundNavPolicy } from './fund-nav-route-case.mjs';
import {
  fundTargetApi,
  fundProviderState,
  readFundTarget,
  runFundOwned,
  verifyFundProtection,
} from './fund-calibration-target.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const privateRoot = resolve(root, '.recovery-artifacts');
const authorization = '--authorized-owned-fund-calibration';
const inputs = [
  'fund-calibration-acceptance.mjs',
  'fund-calibration-case.mjs',
  'fund-calibration-guards.mjs',
  'fund-calibration-runtime.cjs',
  'fund-calibration-target.mjs',
  'fund-nav-route-case.mjs',
];
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const inputHashes = () =>
  Object.fromEntries(
    inputs.map((file) => [file, sha256(readFileSync(new URL(file, import.meta.url)))]),
  );

export function fundCalibrationArguments(args) {
  if (args.length === 0) return { mode: 'plan' };
  if (args.length === 2 && args[0] === '--plan-file') return { mode: 'plan', output: args[1] };
  assert.equal(args.at(-1), authorization, '执行、恢复或收尾必须有本案例精确授权');
  if (args.length === 3 && ['--execute', '--recover'].includes(args[0]))
    return { mode: args[0].slice(2), input: args[1] };
  assert(args.length === 5 && args[0] === '--finish' && args[2] === '--web-evidence');
  return { mode: 'finish', input: args[1], web: args[3] };
}

export function assertFundPrivatePath(path, mustExist = false) {
  assert.equal(path, resolve(path));
  assert(path.startsWith(privateRoot + sep), '回执只能位于本仓私有验收目录');
  for (let current = path; current.startsWith(privateRoot); current = dirname(current)) {
    if (existsSync(current)) assert(!lstatSync(current).isSymbolicLink(), '禁止符号链接跳转');
    if (current === privateRoot) break;
  }
  if (mustExist) assert(existsSync(path));
}

const load = (path) => {
  assertFundPrivatePath(path, true);
  assert(lstatSync(path).isFile());
  return JSON.parse(readFileSync(path, 'utf8'));
};
const outputPath = (plan) => {
  const date = plan.accountName.split('-')[1];
  const expected = resolve(privateRoot, `fund-calibration-${date}-${plan.caseId.slice(0, 8)}`);
  assert.equal(plan.output, expected, '案例输出目录与名称不符');
  assertFundPrivatePath(expected);
  return expected;
};

export function assertFundWebEvidence(evidence, record) {
  assert.equal(evidence.caseId, record.plan.caseId);
  assert.equal(evidence.accountId, record.account.id);
  assert.equal(evidence.officialId, record.calibration.official.id);
  assert.equal(evidence.valuationDate, record.valuationDate);
  assert.equal(evidence.mode, 'actual');
  assert.equal(evidence.dailySeriesObserved, true);
  assert.equal(evidence.officialValueObserved, true);
  assert.equal(evidence.originalPreferenceRestored, true);
  assertFundPrivatePath(evidence.screenshot, true);
  assert(lstatSync(evidence.screenshot).isFile());
  assert.equal(sha256(readFileSync(evidence.screenshot)), evidence.screenshotSha256);
}

async function main() {
  const args = fundCalibrationArguments(process.argv.slice(2));
  if (args.mode === 'plan') {
    const api = fundTargetApi();
    const [state, providers, catalog] = await Promise.all([
      api.get('/api/market-data/policy'),
      api.get('/api/market-data/providers'),
      api.get('/api/market-data/routes/capabilities?contractVersion=3'),
    ]);
    const baseline = readFundTarget();
    assert.equal(baseline.state.protection.database, 'thesis_ledger');
    assert.equal(baseline.state.protection.owner, 'thesis_ledger');
    const plan = {
      ...createFundCalibrationPlan(
        state,
        providers.providers,
        catalog,
        baseline.identity,
        baseline,
        root,
      ),
      inputHashes: inputHashes(),
      providerState: fundProviderState(providers.providers),
      targetWritten: false,
    };
    assertFundCalibrationPlan(plan);
    if (args.output) {
      const path = resolve(args.output);
      assertFundPrivatePath(path);
      writeFileSync(path, JSON.stringify(plan, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
      console.log(
        JSON.stringify({ mode: 'read-only-plan', path, caseId: plan.caseId, targetWritten: false }),
      );
    } else console.log(JSON.stringify(plan, null, 2));
    return;
  }

  let record;
  const prepared = load(resolve(args.input));
  const plan = args.mode === 'execute' ? prepared : prepared.plan;
  assertFundCalibrationPlan(plan);
  assert.deepEqual(plan.inputHashes, inputHashes(), '维护脚本输入已变化，须重新准备预案');
  const output = outputPath(plan);
  if (args.mode === 'execute') {
    assert(!existsSync(output), '案例已开始，不得重复来源执行；请恢复或收尾');
    const now = readFundTarget();
    assert.deepEqual(now, plan.baseline, '目标基线已变化，必须重新只读准备');
    const providers = (await fundTargetApi().get('/api/market-data/providers')).providers;
    assert.deepEqual(fundProviderState(providers), plan.providerState, '来源配置基线已变化');
    const provider = providers.find((row) => row.providerId === 'efinance');
    assert(provider?.enabled && provider.configured);
    assert.equal(provider.configVersion, plan.routePlan.providerConfigVersion);
    mkdirSync(output, { mode: 0o700 });
  } else {
    assert.equal(resolve(args.input), resolve(output, 'recovery.json'));
    assert((lstatSync(output).mode & 0o077) === 0);
    record = prepared;
  }
  const checkpoint = (value) => {
    record = value;
    const next = resolve(output, `recovery-${randomUUID()}.next`);
    writeFileSync(next, JSON.stringify(record, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    renameSync(next, resolve(output, 'recovery.json'));
  };
  const api = fundTargetApi(plan, () => record);
  const verify = async (value) => {
    assert.deepEqual(
      fundProviderState((await api.get('/api/market-data/providers')).providers),
      plan.providerState,
    );
    return verifyFundProtection(plan, readFundTarget(value.account?.id));
  };
  if (args.mode === 'execute') {
    const result = await executeOwnedFundCase(api, plan, runFundOwned, verify, checkpoint);
    console.log(
      JSON.stringify({
        phase: result.phase,
        output,
        accountId: result.account.id,
        officialId: result.calibration.official.id,
        routesRestored: result.restored,
        dataGetsReserved: result.dataGetReservations,
      }),
    );
    return;
  }

  if (args.mode === 'finish') {
    assert.equal(record.phase, 'awaiting-web');
    const web = load(resolve(args.web));
    assertFundWebEvidence(web, record);
    record.web = web;
  }
  let failure;
  try {
    await settleOwnedFundCase(api, plan, record, runFundOwned, checkpoint);
  } catch (error) {
    failure = error;
    record.cleanupFailure = error.message;
  }
  try {
    record.restored = await restoreFundNavPolicy(api, plan.routePlan);
  } catch (error) {
    failure ??= error;
    record.restoreFailure = error.message;
  }
  if (!failure) {
    // 来源未成功时身份可保持原样；确认回执丢失时也保留已声明的事实确认。
    try {
      const after = readFundTarget(record.account?.id);
      const confirmed =
        after.identity.asset.identityStatus === 'confirmed' && plan.writes.confirmAsset;
      record.protection = verifyFundProtection(plan, after, confirmed);
      assert.deepEqual(
        fundProviderState((await api.get('/api/market-data/providers')).providers),
        plan.providerState,
      );
    } catch (error) {
      failure = error;
      record.protectionFailure = error.message;
    }
  }
  record.phase = failure ? 'recovery-required' : args.mode === 'finish' ? 'passed' : 'recovered';
  checkpoint(record);
  if (failure) throw failure;
  if (args.mode === 'finish')
    writeFileSync(resolve(output, 'report.json'), JSON.stringify(record, null, 2) + '\n', {
      mode: 0o600,
      flag: 'wx',
    });
  console.log(
    JSON.stringify({
      phase: record.phase,
      output,
      accountId: record.account?.id,
      routesRestored: record.restored,
      realModelRequests: 0,
    }),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  await main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
