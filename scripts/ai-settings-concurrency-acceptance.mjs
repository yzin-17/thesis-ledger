import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { readFundTarget } from './fund-calibration-target.mjs';
import { sourceState } from '../../thesis-ledger-infra/scripts/research-dual-read.mjs';
import { sql } from '../../thesis-ledger-infra/scripts/research-state-backup.mjs';

const endpoint = 'http://127.0.0.1:3000/api/v1/ai/settings';
const fingerprint = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const currentSettings = (value) => ({
  researchDefault: value.researchDefault,
  revision: value.revision,
});

async function request(method, body) {
  assert(['GET', 'PATCH'].includes(method));
  const response = await fetch(endpoint, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(process.env.SERVER_API_TOKEN
        ? { authorization: `Bearer ${process.env.SERVER_API_TOKEN}` }
        : {}),
    },
    signal: AbortSignal.timeout(15000),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json() };
}

function readRoutingState() {
  const target = sourceState();
  return sql(
    target.containers.postgres.Id,
    `BEGIN READ ONLY;
    SELECT json_build_object(
      'rows',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]'::jsonb) FROM "AiRoutingSettings" t),
      'hash',(SELECT md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY to_jsonb(t)::text),''))
        FROM "AiRoutingSettings" t)); COMMIT;`,
  );
}

export function verifyAiSettingsTransition(plan, after, routing) {
  assert.equal(plan.routing.rows.length, 1, '只允许已有单一全局设置');
  assert.equal(routing.rows.length, 1, '默认设置行集合变化');
  const beforeRow = plan.routing.rows[0],
    afterRow = routing.rows[0];
  assert(Number.isSafeInteger(beforeRow.revision) && beforeRow.revision >= 1);
  assert.equal(beforeRow.id, 'global');
  assert.equal(afterRow.id, 'global');
  assert.equal(afterRow.revision, beforeRow.revision + 1, '必须只成功一次');
  assert(
    Number.isFinite(Date.parse(afterRow.updatedAt)) &&
      Date.parse(afterRow.updatedAt) > Date.parse(beforeRow.updatedAt),
    '修订时间无效',
  );
  const stable = ({ revision: _revision, updatedAt: _updatedAt, ...value }) => value;
  assert.deepEqual(stable(afterRow), stable(beforeRow), '默认引用或其他字段变化');
  assert.equal(plan.baseline.state.protection.tables.AiRoutingSettings, plan.routing.hash);
  assert.equal(after.state.protection.tables.AiRoutingSettings, routing.hash);
  const comparable = structuredClone(after);
  comparable.state.protection.tables.AiRoutingSettings = plan.routing.hash;
  assert.deepEqual(comparable, plan.baseline, '范围外业务、配置、凭据、路由或模型计数变化');
  return {
    passed: true,
    changedFields: ['AiRoutingSettings.global.revision', 'AiRoutingSettings.global.updatedAt'],
    originalBusinessTables: 12,
    protectedBacktests: plan.baseline.state.protection.runs.length,
    realModelRequests: 0,
  };
}

export async function prepareAiSettingsConcurrency() {
  const baseline = readFundTarget();
  assert.equal(baseline.state.protection.database, 'thesis_ledger');
  assert.equal(baseline.state.protection.owner, 'thesis_ledger');
  assert.equal(baseline.state.protection.activeBacktests, 0);
  assert(Object.values(baseline.state.counters).every((value) => value === 0));
  const routing = readRoutingState();
  assert.equal(routing.rows.length, 1);
  assert.equal(routing.rows[0].id, 'global');
  assert.equal(routing.hash, baseline.state.protection.tables.AiRoutingSettings);
  const result = await request('GET');
  assert.equal(result.status, 200);
  const settings = currentSettings(result.body);
  const row = routing.rows[0];
  assert.equal(settings.revision, String(row.revision));
  assert.deepEqual(
    settings.researchDefault,
    row.researchDefaultProvider && row.researchDefaultModel
      ? { providerId: row.researchDefaultProvider, model: row.researchDefaultModel }
      : null,
  );
  const plan = { version: 1, caseId: randomUUID(), baseline, routing, settings };
  return { ...plan, fingerprint: fingerprint(plan) };
}

export async function applyAiSettingsConcurrency(plan) {
  const { fingerprint: expected, ...source } = plan;
  assert.equal(plan.version, 1);
  assert.equal(expected, fingerprint(source), '计划指纹不符');
  const before = await prepareAiSettingsConcurrency();
  assert.deepEqual(before.baseline, plan.baseline, '目标保护状态已变化');
  assert.deepEqual(before.routing, plan.routing, '默认设置行已变化');
  assert.deepEqual(before.settings, plan.settings, '默认设置引用已变化');
  const record = {
    version: 1,
    caseId: plan.caseId,
    planFingerprint: expected,
    passed: false,
    requests: [],
  };
  try {
    const body = {
      researchDefault: plan.settings.researchDefault,
      expectedRevision: plan.settings.revision,
    };
    const concurrent = await Promise.allSettled([request('PATCH', body), request('PATCH', body)]);
    record.requests.push(
      ...concurrent.map((result) =>
        result.status === 'fulfilled'
          ? { phase: 'race', ...result.value }
          : { phase: 'race', status: 'network-failed' },
      ),
    );
    assert.deepEqual(record.requests.map((value) => value.status).sort(), [200, 409]);
    const stale = await request('PATCH', body);
    record.requests.push({ phase: 'stale', ...stale });
    assert.equal(stale.status, 409);
    const invalid = await request('PATCH', {
      researchDefault: { providerId: 'controlled-missing-ai-default-20261021', model: 'missing' },
      expectedRevision: String(plan.routing.rows[0].revision + 1),
    });
    record.requests.push({ phase: 'missing-reference', ...invalid });
    assert.equal(invalid.status, 400);
    const final = await request('GET');
    assert.equal(final.status, 200);
    assert.deepEqual(currentSettings(final.body), {
      researchDefault: plan.settings.researchDefault,
      revision: String(plan.routing.rows[0].revision + 1),
    });
  } catch {
    record.failure = '默认设置验收未满足预期，保留实际回执，不自动覆盖或恢复修订';
  }
  record.after = readFundTarget();
  record.routingAfter = readRoutingState();
  try {
    record.protection = verifyAiSettingsTransition(plan, record.after, record.routingAfter);
    record.passed = !record.failure;
  } catch {
    record.failure = '目标保护检查未通过，保留原始差异，不自动修改业务数据';
  }
  return record;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  try {
    assert(args.length === 0 || (args.length === 2 && args[0] === '--apply'));
    const result =
      args.length === 0
        ? await prepareAiSettingsConcurrency()
        : await applyAiSettingsConcurrency(JSON.parse(readFileSync(args[1], 'utf8')));
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (result.passed === false) process.exitCode = 1;
  } catch {
    process.stderr.write('默认设置验收预检或读取失败；未自动修改或覆盖配置。\n');
    process.exitCode = 1;
  }
}
