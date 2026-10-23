import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { readFundTarget } from './fund-calibration-target.mjs';
import { sourceState } from '../../thesis-ledger-infra/scripts/research-dual-read.mjs';
import { sql } from '../../thesis-ledger-infra/scripts/research-state-backup.mjs';
import {
  controlledFingerprint,
  verifyControlledProtection,
} from './ai-controlled-config-contract.mjs';
import {
  typeConfigName as controlledConfigName,
  typeConfigInput as controlledConfigInput,
  publicTypeInput as publicControlledInput,
  typeConfigKey,
  assertTypeOwned as assertControlledOwned,
  verifyTypeStage as verifyControlledStage,
} from './ai-credential-type-contract.mjs';

const origin = 'http://127.0.0.1:3000/api/v1/ai/providers';
const transitions = { market: 'created', rejected: 'market', returned: 'rejected' };

async function request(method, suffix = '', body) {
  assert(['GET', 'POST', 'DELETE'].includes(method));
  assert(suffix === '' || suffix === `/${controlledConfigName}`);
  const response = await fetch(origin + suffix, {
    method,
    signal: AbortSignal.timeout(15000),
    headers: {
      'content-type': 'application/json',
      ...(process.env.SERVER_API_TOKEN
        ? { authorization: `Bearer ${process.env.SERVER_API_TOKEN}` }
        : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const value = await response.json();
  assert(!JSON.stringify(value).includes(typeConfigKey), 'API 回显了专属占位凭证');
  return { status: response.status, body: value };
}

function currentProtection(id) {
  if (id) assert.match(id, /^[a-f0-9-]{36}$/);
  const current = sourceState();
  const result = sql(
    current.containers.postgres.Id,
    `BEGIN READ ONLY;
    SELECT json_build_object(
      'id',(SELECT id FROM "ProviderConfig" WHERE name='${controlledConfigName}'),
      'fullConfigHash',(SELECT md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY to_jsonb(t)::text),''))
        FROM "ProviderConfig" t),
      'otherConfigHash',(SELECT md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY to_jsonb(t)::text),''))
        FROM "ProviderConfig" t ${id ? `WHERE id <> '${id}'::uuid` : ''}),
      'healthHashes',json_build_object(
        'ProviderHealth',(SELECT md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY to_jsonb(t)::text),''))
          FROM "ProviderHealth" t WHERE provider <> '${controlledConfigName}'),
        'ProviderHealthCheck',(SELECT md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY to_jsonb(t)::text),''))
          FROM "ProviderHealthCheck" t WHERE provider <> '${controlledConfigName}')),
      'ownedHealth',((SELECT count(*) FROM "ProviderHealth" WHERE provider='${controlledConfigName}')
        +(SELECT count(*) FROM "ProviderHealthCheck" WHERE provider='${controlledConfigName}')));
    COMMIT;`,
  );
  return { ...result, target: readFundTarget() };
}

function inspectOwned(id) {
  assert.match(id, /^[a-f0-9-]{36}$/);
  const state = sourceState();
  const program = readFileSync(
    new URL('./ai-credential-type-inspect.mjs', import.meta.url),
    'utf8',
  );
  const result = spawnSync(
    'docker',
    [
      'exec',
      '-i',
      state.containers['thesis-ledger'].Id,
      'node',
      '--input-type=module',
      '-e',
      program,
    ],
    {
      input: JSON.stringify({ id }),
      encoding: 'utf8',
      timeout: 15000,
    },
  );
  assert.equal(result.status, 0, '专属记录只读检查失败；不输出凭据或环境');
  return JSON.parse(result.stdout);
}

async function plan() {
  const current = currentProtection();
  assert.equal(current.id, null, '固定验收名称已存在，禁止覆盖');
  assert.equal(current.ownedHealth, 0);
  const baseline = current.target;
  assert.equal(baseline.state.protection.database, 'thesis_ledger');
  assert.equal(baseline.state.protection.owner, 'thesis_ledger');
  assert.equal(baseline.state.protection.activeBacktests, 0);
  assert(Object.values(baseline.state.counters).every((value) => value === 0));
  const value = {
    version: 1,
    caseId: randomUUID(),
    input: publicControlledInput(),
    baseline,
    healthHashes: current.healthHashes,
  };
  return { ...value, fingerprint: controlledFingerprint(value) };
}

function validatePlan(value) {
  const { fingerprint, ...source } = value;
  assert.equal(value.version, 1);
  assert.equal(fingerprint, controlledFingerprint(source), '计划指纹不符');
  assert.deepEqual(value.input, publicControlledInput());
}

async function create(value) {
  validatePlan(value);
  const current = currentProtection();
  assert.equal(current.id, null);
  assert.deepEqual(current.target, value.baseline);
  verifyControlledProtection(value, current);
  const response = await request('POST', '', controlledConfigInput());
  assert.equal(response.status, 201, '专属配置创建失败');
  const receipt = {
    version: 1,
    plan: value,
    stage: 'created-unverified',
    owned: null,
    initialOwned: null,
    createdAcknowledged: true,
    phases: [],
    passed: false,
  };
  try {
    const id = currentProtection().id;
    assert(id);
    receipt.owned = { id };
    let owned = inspectOwned(id);
    assertControlledOwned(owned, id);
    assert.equal(owned.priority, 993);
    const after = currentProtection(id);
    verifyControlledProtection(value, after);
    return {
      ...receipt,
      stage: 'created',
      owned,
      initialOwned: owned,
      phases: [{ stage: 'created', passed: true }],
      passed: true,
    };
  } catch {
    return {
      ...receipt,
      failure: '创建已获确认，后续检查失败；保留专属 ID 和计划供只读诊断或正常清理',
    };
  }
}

async function checkpoint(record, stage) {
  validatePlan(record.plan);
  assert.equal(record.stage, transitions[stage], '阶段顺序不符');
  const owned = inspectOwned(record.owned.id);
  verifyControlledStage(record, owned, stage);
  const current = currentProtection(record.owned.id);
  assert.equal(current.id, record.owned.id);
  verifyControlledProtection(record.plan, current);
  const response = await fetch('http://127.0.0.1:3000/api/v1/providers/config', {
    headers: process.env.SERVER_API_TOKEN
      ? { authorization: `Bearer ${process.env.SERVER_API_TOKEN}` }
      : {},
    signal: AbortSignal.timeout(15000),
  }).then(async (value) => ({ status: value.status, body: await value.json() }));
  assert.equal(response.status, 200);
  const summary = response.body.find((row) => row.name === controlledConfigName);
  assert.equal(summary.enabled, false);
  assert.equal(summary.type, stage === 'returned' ? 'ai' : 'market');
  assert.equal(summary.credentialConfigured, true);
  return {
    ...record,
    stage,
    owned,
    phases: [...record.phases, { stage, passed: true }],
    passed: true,
  };
}

async function finish(record) {
  validatePlan(record.plan);
  assert(record.createdAcknowledged);
  const id = record.owned?.id ?? currentProtection().id;
  const current = currentProtection(id);
  verifyControlledProtection(record.plan, current);
  if (current.id !== null) {
    assert.equal(current.id, id);
    const owned = inspectOwned(id);
    assert.equal(owned.name, controlledConfigName);
    assert.equal(owned.enabled, false);
    if (owned.type === 'market') {
      const response = await request('POST', '', {
        ...controlledConfigInput(),
        expectedRevision: owned.revision,
      });
      assert.equal(response.status, 201);
      owned = inspectOwned(id);
      assertControlledOwned(owned, id);
    }
    const response = await request('DELETE', `/${controlledConfigName}`, {
      expectedRevision: owned.revision,
    });
    assert.equal(response.status, 200);
  }
  const after = currentProtection();
  assert.equal(after.id, null);
  assert.equal(after.ownedHealth, 0);
  assert.deepEqual(after.target, record.plan.baseline, '清理后整个保护状态未恢复');
  assert.deepEqual(after.healthHashes, record.plan.healthHashes);
  return {
    ...record,
    stage: 'finished',
    fixtureRemoved: true,
    protectionPassed: true,
    accepted: record.stage === 'returned',
    after: after.target,
    passed: record.stage === 'returned',
  };
}

const args = process.argv.slice(2);
try {
  let result;
  if (args.length === 0) result = await plan();
  else if (args.length === 2 && args[0] === '--create')
    result = await create(JSON.parse(readFileSync(args[1], 'utf8')));
  else if (args.length === 3 && args[0] === '--check' && Object.hasOwn(transitions, args[1]))
    result = await checkpoint(JSON.parse(readFileSync(args[2], 'utf8')), args[1]);
  else if (args.length === 2 && args[0] === '--finish')
    result = await finish(JSON.parse(readFileSync(args[1], 'utf8')));
  else throw new Error('验收参数无效');
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.passed === false) process.exitCode = 1;
} catch (error) {
  process.stderr.write(`专属配置验收失败，保留此前回执：${String(error.message).slice(0, 1200)}\n`);
  process.exitCode = 1;
}
