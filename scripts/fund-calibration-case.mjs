import assert from 'node:assert/strict';
import { fundNavSchema } from '../packages/schemas/dist/index.js';
import {
  assertFundCalibrationPlan,
  assertFundCaseAccount,
  assertFundCaseLedger,
  fundCaseChannel,
} from './fund-calibration-guards.mjs';
import { fundPolicyFingerprint, fundSymbol, restoreFundNavPolicy } from './fund-nav-route-case.mjs';

export const cashInput = (plan, accountId, key, direction) => ({
  command: 'CREATE_CASH_FLOW',
  ...commandBase(plan, accountId, key),
  payload: {
    direction,
    category: direction === 'INFLOW' ? 'DEPOSIT' : 'WITHDRAWAL',
    amount: '1000',
    currency: 'CNY',
    note: '专用验收记账，不涉及资金转移',
  },
});
export const executionInput = (plan, accountId, key, side) => ({
  command: 'CREATE_EXECUTION',
  ...commandBase(plan, accountId, key),
  side,
  payload: {
    symbol: fundSymbol,
    quantity: '100',
    price: '1.25',
    currency: 'CNY',
    capabilityVerification: 'UNVERIFIED',
    charges: [],
    note: '专用验收记账，不是证券委托',
  },
});
const commandBase = (plan, accountId, key) => ({
  accountId,
  occurredAt: new Date().toISOString(),
  timePrecision: 'INSTANT',
  sourceTimezone: 'Asia/Shanghai',
  economicOrderKey: key,
  actorId: plan.caseId,
  source: { category: 'MANUAL', channel: fundCaseChannel, externalId: `${plan.caseId}:${key}` },
});

export async function findOwnedFundAccount(api, plan, record) {
  const rows = await api.get('/api/v1/accounts?includeInactive=true');
  const matches = rows.filter((row) => row.name === plan.accountName);
  assert(matches.length <= 1, '自有账户名称重复，禁止接管');
  if (record.account) {
    assert(matches.length === 1 && matches[0].id === record.account.id);
    assertFundCaseAccount(matches[0], plan, record.account.id);
  } else if (matches.length) {
    assert(record.accountCreationStarted, '没有本案例创建请求，禁止采用同名账户');
    assertFundCaseAccount(matches[0], plan, matches[0].id);
    record.account = matches[0];
  }
  return matches[0];
}

const ensureCommand = async (api, plan, record, checkpoint, key, path, build) => {
  if (!record.commands[key]) {
    record.commands[key] = { input: build(plan, record.account.id) };
    await checkpoint(record);
  }
  const saved = record.commands[key];
  if (!saved.result) {
    saved.result = await api.post(path, saved.input);
    await checkpoint(record);
  }
};

export async function settleOwnedFundCase(api, plan, record, runOwned, checkpoint) {
  const account = await findOwnedFundAccount(api, plan, record);
  if (!account) return;
  let state = await runOwned('inspect', record);
  assertFundCaseAccount(state.account, plan, account.id);
  assertFundCaseLedger(state.events, plan);
  assert(
    (state.quantity === 0 && [0, 1000].includes(state.cashValue)) ||
      (state.quantity === 100 && state.cashValue === 875),
    '自有余额超出本案例，停止清理',
  );
  if (state.quantity === 100) {
    assert(state.account.active, '有余额但账户停用，禁止自动启用');
    await ensureCommand(
      api,
      plan,
      record,
      checkpoint,
      'sell',
      '/api/v1/ledger/executions',
      (p, id) => executionInput(p, id, 'sell', 'SELL'),
    );
    state = await runOwned('inspect', record);
    assert(state.quantity === 0 && state.cashValue === 1000);
  }
  if (state.cashValue === 1000) {
    await ensureCommand(
      api,
      plan,
      record,
      checkpoint,
      'withdraw',
      '/api/v1/ledger/cash-flows',
      (p, id) => cashInput(p, id, 'withdraw', 'OUTFLOW'),
    );
    state = await runOwned('inspect', record);
  }
  assert(state.quantity === 0 && state.cashValue === 0, '自有账户未结清，禁止标记清理完成');
  if (state.account.active) {
    const inactive = await api.delete(`/api/v1/accounts/${account.id}`);
    assertFundCaseAccount(inactive, plan, account.id);
    assert.equal(inactive.active, false);
  }
  record.settled = true;
  await checkpoint(record);
}

export async function executeOwnedFundCase(api, plan, runOwned, verifyProtection, checkpoint) {
  assertFundCalibrationPlan(plan);
  const record = {
    format: plan.format,
    plan,
    phase: 'prepared',
    commands: {},
    dataGetReservations: 0,
  };
  const save = async (phase) => {
    record.phase = phase;
    await checkpoint(record);
  };
  const original = await api.get('/api/market-data/policy');
  assert.equal(original.revision, plan.routePlan.baseline.revision);
  assert.equal(fundPolicyFingerprint(original), plan.routePlan.baselineFingerprint);
  assert(
    !(await api.get('/api/v1/accounts?includeInactive=true')).some(
      (a) => a.name === plan.accountName,
    ),
  );
  await save('prepared');
  let failure;
  try {
    await api.put('/api/market-data/policy', {
      ...plan.routePlan.temporary,
      expectedRevision: plan.routePlan.baseline.revision,
    });
    const selected = await api.get('/api/market-data/policy');
    assert(
      selected.syncState === 'applied' &&
        selected.effectiveStale === false &&
        selected.revision === plan.routePlan.temporary.revision &&
        selected.dsaRevision === selected.revision,
    );
    assert.equal(fundPolicyFingerprint(selected), plan.routePlan.temporaryFingerprint);
    await save('routes-applied');
    record.dataGetReservations += 1;
    await checkpoint(record);
    record.latestRaw = await api.get(`/api/market/${fundSymbol}/fund-nav`);
    await checkpoint(record);
    const latest = fundNavSchema.parse(record.latestRaw);
    assert(
      latest.symbol === fundSymbol &&
        latest.provider === 'efinance' &&
        latest.unitNav > 0 &&
        latest.freshness === 'delayed' &&
        latest.servedFromCache !== true &&
        latest.fallbackUsed !== true,
    );
    assert(Date.parse(latest.navDate) <= Date.now());
    record.latest = latest;
    record.valuationDate = latest.navDate.slice(0, 10);
    await save('source-ready');
    if (plan.writes.confirmAsset) {
      record.identity = await api.post(
        `/api/market-data/instruments/${plan.identity.instrument.id}/confirm`,
        {},
      );
      assert(
        record.identity.asset.symbol === fundSymbol &&
          record.identity.asset.identityStatus === 'confirmed',
      );
      await save('asset-confirmed');
      record.identityProtection = await verifyProtection(record);
      assert(record.identityProtection.passed);
    }
    record.accountCreationStarted = true;
    await checkpoint(record);
    record.account = await api.post('/api/v1/accounts', {
      name: plan.accountName,
      ...plan.writes.account,
    });
    assertFundCaseAccount(record.account, plan, record.account.id);
    await save('account-created');
    await ensureCommand(
      api,
      plan,
      record,
      checkpoint,
      'deposit',
      '/api/v1/ledger/cash-flows',
      (p, id) => cashInput(p, id, 'deposit', 'INFLOW'),
    );
    await ensureCommand(
      api,
      plan,
      record,
      checkpoint,
      'buy',
      '/api/v1/ledger/executions',
      (p, id) => executionInput(p, id, 'buy', 'BUY'),
    );
    record.dataGetReservations += 1;
    await save('estimate-started');
    record.estimate = await runOwned('estimate', record);
    assert(record.estimate.observations.length === 1);
    await save('estimated');
    await settleOwnedFundCase(api, plan, record, runOwned, checkpoint);
    record.dataGetReservations += 2;
    await save('calibration-started');
    record.calibration = await runOwned('calibrate', record);
    assert(
      record.calibration.originalSnapshotUnchanged && record.calibration.observations.length === 2,
    );
    assert(record.dataGetReservations <= plan.writes.serverFundDataGetsAtMost);
    await save('calibrated');
  } catch (error) {
    failure = error;
    record.failure = {
      phase: record.phase,
      message: error.message,
      ...(error.fundEvidence ? { evidence: error.fundEvidence } : {}),
    };
  } finally {
    try {
      await settleOwnedFundCase(api, plan, record, runOwned, checkpoint);
    } catch (error) {
      record.cleanupFailure = error.message;
      failure ??= error;
    }
    try {
      record.restored = await restoreFundNavPolicy(api, plan.routePlan);
    } catch (error) {
      record.restoreFailure = error.message;
      failure ??= error;
    }
    await save(record.restored ? 'routes-restored' : 'recovery-required');
  }
  if (failure) throw failure;
  record.protection = await verifyProtection(record);
  assert(record.protection.passed);
  // 份额、现金均为零，仅本次账户为 Web 查看临时启用；finish 必须再次结清停用。
  const active = await api.post(`/api/v1/accounts/${record.account.id}/reactivate`, {});
  assertFundCaseAccount(active, plan, record.account.id);
  assert.equal(active.active, true);
  await save('awaiting-web');
  return record;
}
