import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createFundCalibrationPlan,
  assertFundCaseAccount,
  assertFundAssetTransition,
  assertFundCaseLedger,
  assertFundCalibrationPlan,
  ownedFundProtectionSql,
} from './fund-calibration-guards.mjs';
import { executeOwnedFundCase, executionInput } from './fund-calibration-case.mjs';
import { fundKeys, fundTarget, fundPolicyFingerprint } from './fund-nav-route-case.mjs';
import { assertFundRequest, verifyFundProtection } from './fund-calibration-target.mjs';
import { fundCalibrationArguments, assertFundPrivatePath } from './fund-calibration-acceptance.mjs';

const accountId = '11111111-1111-4111-8111-111111111111';
const initial = {
  contractVersion: 3,
  consumer: 'thesis-ledger',
  requestId: 'fund-calibration-initial',
  revision: 156,
  enabled: true,
  routes: [],
  syncState: 'applied',
  effectiveStale: false,
  dsaRevision: 156,
};
const asset = {
  symbol: '161725.OF',
  assetType: 'fund',
  market: 'OF',
  currency: 'CNY',
  name: '161725.OF',
  identityStatus: 'provider',
  identitySource: 'dsa-fund-nav',
  updatedAt: '2026-10-20T00:00:00Z',
};
const instrument = {
  id: '22222222-2222-4222-8222-222222222222',
  canonicalCode: '161725',
  instrumentType: 'MUTUAL_FUND',
  market: 'OF',
  active: true,
};
const plan = () =>
  createFundCalibrationPlan(
    initial,
    [{ ...fundTarget, configured: true, enabled: true, configVersion: 0 }],
    {
      status: 'complete',
      entries: fundKeys.map((key) => ({ key, target: fundTarget, state: 'ready' })),
    },
    { asset, instrument, association: null },
    {},
    '/workspace/thesis-ledger',
  );

function harness(options = {}) {
  const p = plan(),
    accounts = [],
    events = [],
    calls = [],
    checkpoints = [];
  let state = structuredClone(initial),
    quantity = 0,
    cashValue = 0;
  const api = {
    async get(path) {
      calls.push(['GET', path]);
      if (path.endsWith('/policy')) return state;
      if (path.startsWith('/api/v1/accounts')) return accounts;
      if (path.endsWith('/fund-nav')) {
        if (options.sourceFailure) throw new Error('controlled source failure');
        return {
          version: 3,
          symbol: '161725.OF',
          unitNav: options.invalidSource ? 0 : 0.54,
          navDate: '2026-10-20T00:00:00Z',
          provider: 'efinance',
          fetchedAt: '2026-10-20T12:00:00Z',
          freshness: 'delayed',
          servedFromCache: false,
        };
      }
      throw new Error('未允许的读取');
    },
    async put(path, body) {
      calls.push(['PUT', path]);
      assert.equal(path, '/api/market-data/policy');
      state = { ...body, syncState: 'applied', effectiveStale: false, dsaRevision: body.revision };
    },
    async post(path, body) {
      calls.push(['POST', path]);
      if (path === `/api/v1/accounts/${accountId}/reactivate`) {
        accounts[0].active = true;
        return accounts[0];
      }
      if (path.endsWith('/confirm')) return { asset: { ...asset, identityStatus: 'confirmed' } };
      if (path === '/api/v1/accounts') {
        accounts.push({ id: accountId, ...body, active: true });
        if (options.loseAccountAcknowledgement) throw new Error('controlled response lost');
        return accounts[0];
      }
      events.push({
        sourceChannel: body.source.channel,
        actorId: body.actorId,
        externalId: body.source.externalId,
      });
      if (body.command === 'CREATE_CASH_FLOW')
        cashValue += body.payload.direction === 'INFLOW' ? 1000 : -1000;
      else {
        quantity += body.side === 'BUY' ? 100 : -100;
        cashValue += body.side === 'BUY' ? -125 : 125;
      }
      if (options.loseBuyAcknowledgement && body.side === 'BUY')
        throw new Error('controlled buy acknowledgement lost');
      return { eventIds: [`event-${events.length}`] };
    },
    async delete(path) {
      calls.push(['DELETE', path]);
      assert.equal(path, `/api/v1/accounts/${accountId}`);
      accounts[0].active = false;
      return accounts[0];
    },
  };
  const runOwned = async (phase) => {
    if (phase === 'inspect')
      return {
        account: accounts[0],
        quantity,
        cashValue,
        events: options.foreignLedger
          ? [{ sourceChannel: 'other', actorId: 'other', externalId: 'other' }]
          : events,
      };
    if (phase === 'estimate') return { estimate: { id: 'estimate' }, observations: [{}] };
    if (phase === 'calibrate') {
      if (options.calibrationFailure) {
        const error = new Error('controlled calibration failure');
        error.fundEvidence = { observations: [{ path: 'bounded-history', raw: [{ unitNav: 0 }] }] };
        throw error;
      }
      return { originalSnapshotUnchanged: true, observations: [{}, {}] };
    }
    throw new Error('未允许的执行阶段');
  };
  const run = () =>
    executeOwnedFundCase(
      api,
      p,
      runOwned,
      async () => ({ passed: true }),
      async (r) => checkpoints.push(structuredClone(r)),
    );
  return { p, accounts, calls, checkpoints, run, policy: () => state };
}

test('新账户必须同时匹配 UUID、名称、模式、类型与币种，SQL 排除范围拒绝注入', () => {
  const p = plan(),
    a = { id: accountId, name: p.accountName, ...p.writes.account };
  assert.doesNotThrow(() => assertFundCaseAccount(a, p, accountId));
  for (const change of [
    { name: '原账户' },
    { mode: 'shadow' },
    { type: 'securities' },
    { currency: 'USD' },
  ])
    assert.throws(() => assertFundCaseAccount({ ...a, ...change }, p, accountId));
  assert.throws(() => ownedFundProtectionSql("x' OR 1=1 --"));
  assert(ownedFundProtectionSql(accountId).includes('IS DISTINCT FROM'));
});

test('资产确认仅允许声明字段，其他元数据或目录关联变化拒绝', () => {
  const p = plan(),
    after = { ...asset, identityStatus: 'confirmed', identitySource: 'catalog', updatedAt: 'new' };
  const association = {
    id: accountId,
    symbol: asset.symbol,
    instrumentId: instrument.id,
    status: 'active',
    source: 'catalog',
    confirmedAt: 'now',
  };
  assert.doesNotThrow(() => assertFundAssetTransition(asset, after, association, p));
  assert.throws(() =>
    assertFundAssetTransition(asset, { ...after, currency: 'USD' }, association, p),
  );
  assert.throws(() =>
    assertFundAssetTransition(asset, after, { ...association, instrumentId: accountId }, p),
  );
});

test('维护入口默认只读，写入必须有精确授权，回执不可跳出私有目录', () => {
  assert.deepEqual(fundCalibrationArguments([]), { mode: 'plan' });
  assert.throws(() => fundCalibrationArguments(['--execute', 'plan.json']));
  assert.throws(() => fundCalibrationArguments(['--run']));
  assert.equal(
    fundCalibrationArguments(['--execute', 'plan.json', '--authorized-owned-fund-calibration'])
      .mode,
    'execute',
  );
  assert.throws(() => assertFundPrivatePath('/tmp/fund-case.json'));
  assert.throws(() =>
    assertFundPrivatePath(
      '/Users/yzin/code/thesis-ledger-workspace/thesis-ledger/.recovery-artifacts/../../foreign',
    ),
  );
});

test('伪造确认标志、停用目录和范围外 Ledger key 均拒绝', () => {
  const p = plan();
  assert.throws(() =>
    assertFundCalibrationPlan({ ...p, writes: { ...p.writes, confirmAsset: false } }),
  );
  assert.throws(() =>
    assertFundCalibrationPlan({
      ...p,
      identity: { ...p.identity, instrument: { ...instrument, active: false } },
    }),
  );
  const row = {
    sourceChannel: 'fund-calibration-acceptance',
    actorId: p.caseId,
    externalId: `${p.caseId}:foreign`,
  };
  assert.throws(() => assertFundCaseLedger([row], p));
  row.externalId = `${p.caseId}:buy`;
  assert.throws(() => assertFundCaseLedger([row, row], p));
});

test('接口白名单拒绝永久删除、外来账户、模型请求和扩大记账数量', () => {
  const p = plan(),
    record = { account: { id: accountId, name: p.accountName, ...p.writes.account } };
  assert.doesNotThrow(() =>
    assertFundRequest('DELETE', `/api/v1/accounts/${accountId}`, undefined, p, record),
  );
  for (const [method, path, body] of [
    ['DELETE', `/api/v1/accounts/${accountId}/permanent`],
    ['DELETE', `/api/v1/accounts/${instrument.id}`],
    ['POST', '/api/v1/ai/runs', {}],
    ['PATCH', `/api/v1/accounts/${accountId}`, { active: true }],
  ])
    assert.throws(() => assertFundRequest(method, path, body, p, record));
  const input = executionInput(p, accountId, 'buy', 'BUY');
  assert.doesNotThrow(() =>
    assertFundRequest('POST', '/api/v1/ledger/executions', input, p, record),
  );
  input.payload.quantity = '200';
  assert.throws(() => assertFundRequest('POST', '/api/v1/ledger/executions', input, p, record));
});

test('保护比对不能排除原业务表变化或真实模型计数变化', () => {
  const p = plan();
  p.baseline = {
    state: { tables: { Account: 'before' }, counters: { runs: 0 } },
    extra: { observationVersions: 0 },
  };
  const after = { ...structuredClone(p.baseline), identity: p.identity };
  assert.doesNotThrow(() => verifyFundProtection(p, after, false));
  after.state.counters.runs = 1;
  assert.throws(() => verifyFundProtection(p, after, false));
  after.state.counters.runs = 0;
  after.state.tables.Account = 'changed';
  assert.throws(() => verifyFundProtection(p, after, false));
});

test('来源失败时不创建账户或确认资产，仍恢复原路由且不重发数据', async () => {
  const h = harness({ sourceFailure: true });
  await assert.rejects(h.run);
  assert.equal(h.accounts.length, 0);
  assert.equal(h.calls.filter((c) => c[0] === 'POST').length, 0);
  assert.equal(h.calls.filter((c) => c[1].endsWith('/fund-nav')).length, 1);
  assert.equal(fundPolicyFingerprint(h.policy()), h.p.routePlan.baselineFingerprint);
});

test('真实返回未通过校验时先保留有限原值，恢复后不重复数据请求', async () => {
  const h = harness({ invalidSource: true });
  await assert.rejects(h.run);
  assert(h.checkpoints.some((record) => record.latestRaw?.unitNav === 0));
  assert.equal(h.calls.filter((c) => c[1].endsWith('/fund-nav')).length, 1);
  assert.equal(h.accounts.length, 0);
  assert.equal(fundPolicyFingerprint(h.policy()), h.p.routePlan.baselineFingerprint);
});

test('新账户提交回执丢失后只按本次身份找到并停用，不遗留临时路线', async () => {
  const h = harness({ loseAccountAcknowledgement: true });
  await assert.rejects(h.run);
  assert.equal(h.accounts.length, 1);
  assert.equal(h.accounts[0].active, false);
  assert.equal(h.calls.filter((c) => c[1] === '/api/v1/ledger/executions').length, 0);
  assert.equal(fundPolicyFingerprint(h.policy()), h.p.routePlan.baselineFingerprint);
});

test('自有账户出现范围外 Ledger 时拒绝清理和校准，仍独立恢复本次路由', async () => {
  const h = harness({ foreignLedger: true });
  await assert.rejects(h.run);
  assert.equal(h.calls.filter((c) => c[1] === '/api/v1/ledger/executions').length, 1);
  assert.equal(h.calls.filter((c) => c[0] === 'DELETE').length, 0);
  assert.equal(fundPolicyFingerprint(h.policy()), h.p.routePlan.baselineFingerprint);
});

test('买入提交回执丢失后按已落账余额清理，不重发买入', async () => {
  const h = harness({ loseBuyAcknowledgement: true });
  await assert.rejects(h.run);
  assert.equal(h.calls.filter((c) => c[1] === '/api/v1/ledger/executions').length, 2);
  assert.equal(h.accounts[0].active, false);
  assert(h.checkpoints.at(-1).settled);
  assert.equal(fundPolicyFingerprint(h.policy()), h.p.routePlan.baselineFingerprint);
});

test('校准失败保留有限来源错误回执，账户已结清停用且原路由恢复', async () => {
  const h = harness({ calibrationFailure: true });
  await assert.rejects(h.run);
  const receipt = h.checkpoints.at(-1);
  assert(receipt.failure.evidence.observations.length === 1 && receipt.settled && receipt.restored);
  assert.equal(h.accounts[0].active, false);
  assert.equal(h.calls.filter((c) => c[1].endsWith('/fund-nav')).length, 1);
});

test('完整案例仅四条自有记账，路由恢复后等待 Web，份额/现金已结清', async () => {
  const h = harness();
  const record = await h.run();
  assert.equal(record.phase, 'awaiting-web');
  assert.equal(record.dataGetReservations, 4);
  assert.equal(h.calls.filter((c) => c[1].startsWith('/api/v1/ledger/')).length, 4);
  assert.equal(h.accounts[0].active, true);
  assert(record.settled && record.protection.passed);
  assert.equal(fundPolicyFingerprint(h.policy()), h.p.routePlan.baselineFingerprint);
  assert.equal(record.valuationDate, '2026-10-20');
});
