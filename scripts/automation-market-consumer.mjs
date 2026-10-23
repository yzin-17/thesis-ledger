import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fundNavSchema } from '../packages/schemas/dist/index.js';
import { controlledFingerprint, controlledHash } from './ai-controlled-config-contract.mjs';
import { assertFundPrivatePath } from './fund-calibration-acceptance.mjs';
import {
  createFundCalibrationPlan,
  assertFundCalibrationPlan,
  assertFundCaseAccount,
} from './fund-calibration-guards.mjs';
import { cashInput, executionInput, settleOwnedFundCase } from './fund-calibration-case.mjs';
import {
  fundTargetApi,
  fundProviderState,
  readFundTarget,
  runFundOwned,
  verifyFundProtection,
} from './fund-calibration-target.mjs';
import { fundPolicyFingerprint, restoreFundNavPolicy } from './fund-nav-route-case.mjs';
import {
  officialJobId,
  readAutomationConsumer,
  assertAutomationReady,
  verifyAutomationConsumer,
} from './automation-market-consumer-contract.mjs';

const inputs = [
  'automation-market-consumer.mjs',
  'automation-market-consumer-contract.mjs',
  'fund-calibration-case.mjs',
  'fund-calibration-target.mjs',
  'fund-calibration-runtime.cjs',
  'fund-calibration-guards.mjs',
  'fund-nav-route-case.mjs',
];
const inputHashes = () =>
  Object.fromEntries(
    inputs.map((path) => [path, controlledHash(readFileSync(new URL(path, import.meta.url)))]),
  );

export async function prepareAutomationConsumer() {
  const api = fundTargetApi();
  const [policy, providers, catalog] = await Promise.all([
    api.get('/api/market-data/policy'),
    api.get('/api/market-data/providers'),
    api.get('/api/market-data/routes/capabilities?contractVersion=3'),
  ]);
  const baseline = readFundTarget(),
    automation = readAutomationConsumer();
  assert.equal(baseline.state.protection.database, 'thesis_ledger');
  assert.equal(baseline.state.protection.owner, 'thesis_ledger');
  assert.equal(baseline.state.protection.activeBacktests, 0);
  assert(Object.values(baseline.state.counters).every((value) => value === 0));
  assertAutomationReady(automation);
  const fundPlan = createFundCalibrationPlan(
    policy,
    providers.providers,
    catalog,
    baseline.identity,
    baseline,
    resolve(new URL('..', import.meta.url).pathname),
  );
  assert.equal(fundPlan.writes.confirmAsset, false, '本案不再确认或接管目录身份');
  const plan = {
    ...fundPlan,
    automation,
    providerState: fundProviderState(providers.providers),
    inputHashes: inputHashes(),
    consumer: 'automation-official-reconcile',
    targetWritten: false,
  };
  return { ...plan, fingerprint: controlledFingerprint(plan) };
}

function validate(plan) {
  const { fingerprint, ...source } = plan;
  assert.equal(fingerprint, controlledFingerprint(source));
  assertFundCalibrationPlan(plan);
  assert.equal(plan.consumer, 'automation-official-reconcile');
  assert.equal(plan.writes.confirmAsset, false);
  assertAutomationReady(plan.automation);
  assert.deepEqual(plan.inputHashes, inputHashes());
  assertFundPrivatePath(plan.output);
}

async function runManagedOnce() {
  const response = await fetch(`http://127.0.0.1:3000/api/v1/automations/${officialJobId}/run`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(process.env.SERVER_API_TOKEN
        ? { authorization: `Bearer ${process.env.SERVER_API_TOKEN}` }
        : {}),
    },
    body: '{}',
    signal: AbortSignal.timeout(120000),
  });
  const body = await response.json();
  assert.equal(response.status, 201);
  assert.equal(body.skipped, false);
  assert.equal(body.output.scanned, 1);
  assert.deepEqual(body.output.pending, []);
  assert.equal(body.output.reconciled.length, 1);
  return body;
}

export async function executeAutomationConsumer(plan) {
  validate(plan);
  assert(!existsSync(plan.output), '案例已开始；只能恢复，禁止重复任务或来源执行');
  assert.deepEqual(readFundTarget(), plan.baseline);
  assert.deepEqual(readAutomationConsumer(), plan.automation);
  mkdirSync(plan.output, { recursive: false, mode: 0o700 });
  const record = { plan, phase: 'prepared', commands: {}, dataGetReservations: 0 };
  const checkpoint = () =>
    writeFileSync(
      resolve(plan.output, 'automation-record.json'),
      JSON.stringify(record, null, 2) + '\n',
      { mode: 0o600 },
    );
  const api = fundTargetApi(plan, () => record);
  checkpoint();
  const command = async (key, path, input) => {
    record.commands[key] = { input };
    checkpoint();
    record.commands[key].result = await api.post(path, input);
    checkpoint();
  };
  try {
    const current = await api.get('/api/market-data/policy');
    assert.equal(current.revision, plan.routePlan.baseline.revision);
    assert.equal(fundPolicyFingerprint(current), plan.routePlan.baselineFingerprint);
    await api.put('/api/market-data/policy', {
      ...plan.routePlan.temporary,
      expectedRevision: plan.routePlan.baseline.revision,
    });
    const selected = await api.get('/api/market-data/policy');
    assert.equal(selected.syncState, 'applied');
    assert.equal(selected.effectiveStale, false);
    assert.equal(selected.dsaRevision, plan.routePlan.temporary.revision);
    assert.equal(fundPolicyFingerprint(selected), plan.routePlan.temporaryFingerprint);
    record.phase = 'routes-applied';
    checkpoint();
    record.dataGetReservations++;
    checkpoint();
    record.latest = fundNavSchema.parse(await api.get('/api/market/161725.OF/fund-nav'));
    assert.equal(record.latest.symbol, '161725.OF');
    assert.equal(record.latest.provider, 'efinance');
    assert.equal(record.latest.fallbackUsed, false);
    assert.equal(record.latest.freshness, 'delayed');
    assert(record.latest.unitNav > 0 && Date.parse(record.latest.navDate) <= Date.now());
    record.valuationDate = record.latest.navDate.slice(0, 10);
    record.accountCreationStarted = true;
    checkpoint();
    record.account = await api.post('/api/v1/accounts', {
      name: plan.accountName,
      ...plan.writes.account,
    });
    assertFundCaseAccount(record.account, plan, record.account.id);
    checkpoint();
    await command(
      'deposit',
      '/api/v1/ledger/cash-flows',
      cashInput(plan, record.account.id, 'deposit', 'INFLOW'),
    );
    await command(
      'buy',
      '/api/v1/ledger/executions',
      executionInput(plan, record.account.id, 'buy', 'BUY'),
    );
    record.dataGetReservations++;
    record.phase = 'estimate-started';
    checkpoint();
    record.estimate = runFundOwned('estimate', record);
    checkpoint();
    await settleOwnedFundCase(api, plan, record, runFundOwned, checkpoint);
    record.prepared = readAutomationConsumer(record.account.id);
    assertAutomationReady(record.prepared, record.account.id, record.estimate.estimate.id);
    assert.deepEqual(record.prepared.job, plan.automation.job);
    assert.deepEqual(record.prepared.runs, plan.automation.runs);
    assert.deepEqual(record.prepared.leases, plan.automation.leases);
    record.phase = 'automation-request-started';
    checkpoint();
    record.automationResponse = await runManagedOnce();
    checkpoint();
    record.automationAfter = readAutomationConsumer(record.account.id);
    record.acceptance = verifyAutomationConsumer(
      plan.automation,
      record.prepared,
      record.automationAfter,
      record,
    );
    record.phase = 'automation-verified';
    checkpoint();
  } catch (error) {
    record.failure = {
      phase: record.phase,
      message: error.message,
      ...(error.fundEvidence ? { evidence: error.fundEvidence } : {}),
    };
    checkpoint();
  } finally {
    try {
      await settleOwnedFundCase(api, plan, record, runFundOwned, checkpoint);
    } catch (error) {
      record.cleanupFailure = error.message;
    }
    try {
      record.restored = await restoreFundNavPolicy(api, plan.routePlan);
    } catch (error) {
      record.restoreFailure = error.message;
    }
    try {
      record.protection = verifyFundProtection(plan, readFundTarget(record.account?.id), false);
      assert.deepEqual(
        fundProviderState((await api.get('/api/market-data/providers')).providers),
        plan.providerState,
      );
    } catch (error) {
      record.protectionFailure = error.message;
    }
    record.phase =
      record.failure || record.cleanupFailure || record.restoreFailure || record.protectionFailure
        ? 'recovery-required'
        : 'awaiting-web';
    checkpoint();
  }
  return record;
}

export async function recoverAutomationConsumer(record) {
  validate(record.plan);
  const checkpoint = () =>
    writeFileSync(
      resolve(record.plan.output, 'automation-record.json'),
      JSON.stringify(record, null, 2) + '\n',
      { mode: 0o600 },
    );
  const api = fundTargetApi(record.plan, () => record);
  await settleOwnedFundCase(api, record.plan, record, runFundOwned, checkpoint);
  record.restored = await restoreFundNavPolicy(api, record.plan.routePlan);
  record.protection = verifyFundProtection(record.plan, readFundTarget(record.account?.id), false);
  record.phase = 'recovered';
  checkpoint();
  return record;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2);
    assert(
      args.length === 0 ||
        (args.length === 3 &&
          ['--apply', '--recover'].includes(args[0]) &&
          args[2] === '--authorized-automation-market-consumer'),
    );
    let result;
    if (args.length === 0) result = await prepareAutomationConsumer();
    else {
      const path = resolve(args[1]);
      assertFundPrivatePath(path, true);
      const input = JSON.parse(readFileSync(path, 'utf8'));
      result =
        args[0] === '--apply'
          ? await executeAutomationConsumer(input)
          : await recoverAutomationConsumer(input);
    }
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    if (result.phase === 'recovery-required') process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`Automation 消费验收停止：${String(error.message).slice(0, 1000)}\n`);
    process.exitCode = 1;
  }
}
