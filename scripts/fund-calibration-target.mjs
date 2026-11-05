import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { sourceState } from '../../thesis-ledger-infra/scripts/research-dual-read.mjs';
import { sql } from '../../thesis-ledger-infra/scripts/research-state-backup.mjs';
import {
  assertFundAssetTransition,
  assertFundCaseAccount,
  fundCaseChannel,
  ownedFundProtectionSql,
} from './fund-calibration-guards.mjs';
import { fundPolicyFingerprint } from './fund-nav-route-case.mjs';

const origin = 'http://127.0.0.1:3000';
const fundSymbol = '161725.OF';
const identitySql = `SELECT json_build_object(
  'asset',(SELECT to_jsonb(t) FROM "Asset" t WHERE symbol='161725.OF'),
  'instrument',(SELECT to_jsonb(t) FROM "Instrument" t WHERE "canonicalCode"='161725'
    AND "instrumentType"='MUTUAL_FUND' AND market='OF'),
  'association',(SELECT to_jsonb(t) FROM "InstrumentAssetAssociation" t WHERE symbol='161725.OF'));`;
const extraSql = `SELECT json_build_object(
  ${['Asset', 'InstrumentAssetAssociation', 'FundNavPoint']
    .map(
      (
        table,
      ) => `'${table}Other',(SELECT md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY to_jsonb(t)::text),''))
        FROM "${table}" t WHERE symbol <> '161725.OF')`,
    )
    .join(',')},
  'Instrument',(SELECT md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY to_jsonb(t)::text),'')) FROM "Instrument" t),
  'observationVersions',(SELECT count(*) FROM "ResearchObservationVersion"),
  'observationSubmissions',(SELECT count(*) FROM "ResearchObservationSubmission"));`;

/** 只读快照不暴露容器环境；仅本次账户可从业务哈希中排除。 */
export function readFundTarget(accountId) {
  const current = sourceState();
  const read = (query) => sql(current.containers.postgres.Id, `BEGIN READ ONLY; ${query} COMMIT;`);
  return {
    state: {
      ...current.state,
      protection: {
        ...current.state.protection,
        tables: read(ownedFundProtectionSql(accountId)),
      },
    },
    extra: read(extraSql),
    identity: read(identitySql),
  };
}

export function verifyFundProtection(plan, after, confirmed = plan.writes.confirmAsset) {
  assert.deepEqual(after.state, plan.baseline.state, '原有业务、模型计数或目标身份发生变化');
  assert.deepEqual(after.extra, plan.baseline.extra, '范围外资产、目录或观察数据发生变化');
  if (confirmed) {
    assertFundAssetTransition(
      plan.identity.asset,
      after.identity.asset,
      after.identity.association,
      plan,
    );
    assert.deepEqual(after.identity.instrument, plan.identity.instrument);
  } else assert.deepEqual(after.identity, plan.identity, '未声明的资产确认变化');
  return { passed: true, originalBusinessTables: 13, realModelRequests: 0 };
}

export const fundProviderState = (providers) =>
  providers
    .map((row) =>
      Object.fromEntries(
        [
          'providerId',
          'enabled',
          'configured',
          'configVersion',
          'credentialConfigured',
          'credentialSource',
          'credentialFieldsConfigured',
          'credentialMethod',
          'updatedAt',
        ].map((key) => [key, row[key] ?? null]),
      ),
    )
    .sort((a, b) => a.providerId.localeCompare(b.providerId));

export function assertFundRequest(method, path, body, plan, record) {
  const controls = [
    '/api/market-data/policy',
    '/api/market-data/providers',
    '/api/market-data/routes/capabilities?contractVersion=3',
    '/api/v1/accounts?includeInactive=true',
  ];
  if (method === 'GET') {
    assert(
      controls.includes(path) || (plan && path === `/api/market/${fundSymbol}/fund-nav`),
      '请求不在基金验收读取范围',
    );
    return;
  }
  assert(plan && record, '写入必须绑定精确预案与回执');
  if (method === 'PUT') {
    assert.equal(path, '/api/market-data/policy');
    assert(
      [plan.routePlan.baselineFingerprint, plan.routePlan.temporaryFingerprint].includes(
        fundPolicyFingerprint(body),
      ),
      '禁止改变原路由选择',
    );
  } else if (method === 'DELETE' || (method === 'POST' && path.endsWith('/reactivate'))) {
    assertFundCaseAccount(record.account, plan, record.account.id);
    assert.equal(
      path,
      `/api/v1/accounts/${record.account.id}${method === 'POST' ? '/reactivate' : ''}`,
    );
    assert.deepEqual(body, method === 'POST' ? {} : undefined);
  } else if (method === 'POST' && path === '/api/v1/accounts') {
    assert.deepEqual(body, { name: plan.accountName, ...plan.writes.account });
  } else if (method === 'POST' && path.endsWith('/confirm')) {
    assert(plan.writes.confirmAsset);
    assert.equal(path, `/api/market-data/instruments/${plan.identity.instrument.id}/confirm`);
    assert.deepEqual(body, {});
  } else {
    assert.equal(method, 'POST');
    assert(['/api/v1/ledger/executions', '/api/v1/ledger/cash-flows'].includes(path));
    assert.equal(body.accountId, record.account.id);
    assert.equal(body.actorId, plan.caseId);
    assert.equal(body.source.channel, fundCaseChannel);
    const key = body.economicOrderKey;
    assert.equal(body.source.category, 'MANUAL');
    assert.equal(body.source.externalId, `${plan.caseId}:${key}`);
    assert.equal(body.payload.currency, 'CNY');
    if (path.endsWith('/executions')) {
      assert.equal(body.command, 'CREATE_EXECUTION');
      assert(['buy', 'sell'].includes(key));
      assert.equal(body.side, key === 'buy' ? 'BUY' : 'SELL');
      assert.equal(body.payload.symbol, fundSymbol);
      assert.equal(body.payload.quantity, '100');
      assert.equal(body.payload.price, '1.25');
      assert.equal(body.payload.capabilityVerification, 'UNVERIFIED');
      assert.deepEqual(body.payload.charges, []);
    } else {
      assert.equal(body.command, 'CREATE_CASH_FLOW');
      assert(['deposit', 'withdraw'].includes(key));
      assert.equal(body.payload.amount, '1000');
      assert.equal(body.payload.direction, key === 'deposit' ? 'INFLOW' : 'OUTFLOW');
      assert.equal(body.payload.category, key === 'deposit' ? 'DEPOSIT' : 'WITHDRAWAL');
    }
  }
}

export function fundTargetApi(plan, getRecord = () => undefined) {
  const request = async (method, path, body) => {
    assertFundRequest(method, path, body, plan, getRecord());
    const response = await fetch(origin + path, {
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
    assert(response.ok, `基金验收 ${method} ${path.split('?')[0]} 返回 ${response.status}`);
    return response.json();
  };
  return Object.fromEntries(
    ['GET', 'PUT', 'DELETE', 'POST'].map((method) => [
      method.toLowerCase(),
      (path, body) => request(method, path, body),
    ]),
  );
}

/** 维护脚本是本阶段唯一 Docker 写入口，实际业务类只接收本次账户。 */
export function runFundOwned(phase, record) {
  assert(['inspect', 'estimate', 'calibrate'].includes(phase));
  assertFundCaseAccount(record.account, record.plan, record.account.id);
  const state = sourceState();
  assert.deepEqual(state.state.identities, record.plan.baseline.state.identities);
  const program = readFileSync(new URL('./fund-calibration-runtime.cjs', import.meta.url), 'utf8');
  const result = spawnSync(
    'docker',
    ['exec', '-i', state.containers['thesis-ledger'].Id, 'node', '-e', program],
    {
      input: JSON.stringify({
        phase,
        caseId: record.plan.caseId,
        accountId: record.account.id,
        accountName: record.plan.accountName,
        database: 'thesis_ledger',
        valuationDate: record.valuationDate,
        estimateId: record.estimate?.estimate.id,
      }),
      timeout: 120000,
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
    },
  );
  const output = result.stdout ?? '';
  if (result.status !== 0) {
    const error = new Error(`自有基金 ${phase} 阶段失败，保留有限来源回执`);
    const failed = output.split('\n').find((line) => line.startsWith('FUND_CALIBRATION_FAILURE='));
    if (failed) error.fundEvidence = JSON.parse(failed.slice('FUND_CALIBRATION_FAILURE='.length));
    throw error;
  }
  const lines = output.split('\n').filter((line) => line.startsWith('FUND_CALIBRATION_RESULT='));
  assert.equal(lines.length, 1, '必须有唯一的有限验收回执');
  return JSON.parse(lines[0].slice('FUND_CALIBRATION_RESULT='.length));
}
