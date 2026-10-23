import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { controlledFingerprint } from './ai-controlled-config-contract.mjs';
import { readFundTarget } from './fund-calibration-target.mjs';
import { sourceState } from '../../thesis-ledger-infra/scripts/research-dual-read.mjs';
import { sql } from '../../thesis-ledger-infra/scripts/research-state-backup.mjs';

const provider = 'lmstudio';
async function request(endpoint, body) {
  assert(['providers/lmstudio/enabled', 'settings'].includes(endpoint));
  const response = await fetch(`http://127.0.0.1:3000/api/v1/ai/${endpoint}`, {
    method: 'PATCH',
    signal: AbortSignal.timeout(15000),
    headers: {
      'content-type': 'application/json',
      ...(process.env.SERVER_API_TOKEN
        ? { authorization: `Bearer ${process.env.SERVER_API_TOKEN}` }
        : {}),
    },
    body: JSON.stringify(body),
  });
  const value = await response.json();
  return {
    status: response.status,
    ...(response.ok ? { accepted: true } : { message: value.message ?? value.error }),
  };
}

export function readDefaultLifecycleTarget() {
  const state = sourceState();
  const proof = sql(
    state.containers.postgres.Id,
    `BEGIN READ ONLY;
    SELECT json_build_object(
      'provider',(SELECT (to_jsonb(t)-'encryptedCredentials') || jsonb_build_object(
        'credentialCipherHash',md5(coalesce("encryptedCredentials",'')))
        FROM "ProviderConfig" t WHERE name='lmstudio'),
      'fullConfigHash',(SELECT md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY to_jsonb(t)::text),''))
        FROM "ProviderConfig" t),
      'otherConfigHash',(SELECT md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY to_jsonb(t)::text),''))
        FROM "ProviderConfig" t WHERE name<>'lmstudio'),
      'routing',(SELECT to_jsonb(t) FROM "AiRoutingSettings" t WHERE id='global'),
      'routingHash',(SELECT md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY to_jsonb(t)::text),''))
        FROM "AiRoutingSettings" t)); COMMIT;`,
  );
  // PostgreSQL 的 timestamp JSON 不含时区，Prisma 修订使用 UTC ISO，不能交由宿主机本地时区解析。
  assert.match(proof.provider.updatedAt, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?$/);
  proof.provider.updatedAt = new Date(`${proof.provider.updatedAt}Z`).toISOString();
  return { ...proof, target: readFundTarget() };
}

export function verifyDefaultLifecycle(plan, current, stage) {
  const before = plan.before;
  assert.equal(current.fullConfigHash, current.target.state.protection.tables.ProviderConfig);
  assert.equal(current.routingHash, current.target.state.protection.tables.AiRoutingSettings);
  assert.equal(current.otherConfigHash, before.otherConfigHash, '其他配置或凭据变化');
  if (stage === 'unchanged') {
    assert.deepEqual(current, before, '拒绝请求发生持久变化');
    return;
  }
  assert(['cleared', 'restored'].includes(stage));
  assert.equal(before.provider.name, provider);
  assert.equal(before.provider.type, 'ai');
  assert.equal(before.provider.enabled, true);
  assert(Date.parse(current.provider.updatedAt) > Date.parse(before.provider.updatedAt));
  assert.deepEqual(
    { ...current.provider, updatedAt: before.provider.updatedAt },
    before.provider,
    '原 Provider 仅允许正常推进时间，设置/密文/启停必须相同',
  );
  const expected = structuredClone(before.routing);
  expected.revision += stage === 'cleared' ? 1 : 2;
  if (stage === 'cleared') {
    expected.researchDefaultProvider = null;
    expected.researchDefaultModel = null;
  }
  assert(Date.parse(current.routing.updatedAt) > Date.parse(before.routing.updatedAt));
  expected.updatedAt = current.routing.updatedAt;
  assert.deepEqual(current.routing, expected, '默认引用或版本超出精确写集');
  const comparable = structuredClone(current.target);
  comparable.state.protection.tables.ProviderConfig = before.fullConfigHash;
  comparable.state.protection.tables.AiRoutingSettings = before.routingHash;
  assert.deepEqual(comparable, before.target, '业务、路由、暂停边界或模型计数变化');
}

export function prepareDefaultLifecycle() {
  const before = readDefaultLifecycleTarget();
  assert.equal(before.target.state.protection.database, 'thesis_ledger');
  assert.equal(before.target.state.protection.owner, 'thesis_ledger');
  assert.equal(before.target.state.protection.activeBacktests, 0);
  assert(Object.values(before.target.state.counters).every((value) => value === 0));
  assert.equal(before.provider.type, 'ai');
  assert.equal(before.provider.enabled, true);
  assert.equal(before.routing.id, 'global');
  assert.equal(before.routing.researchDefaultProvider, provider);
  assert(before.routing.researchDefaultModel);
  assert.equal(before.fullConfigHash, before.target.state.protection.tables.ProviderConfig);
  assert.equal(before.routingHash, before.target.state.protection.tables.AiRoutingSettings);
  const value = { version: 1, caseId: randomUUID(), before };
  return { ...value, fingerprint: controlledFingerprint(value) };
}

export async function applyDefaultLifecycle(plan) {
  const { fingerprint, ...value } = plan;
  assert.equal(plan.version, 1);
  assert.equal(fingerprint, controlledFingerprint(value));
  assert.deepEqual(prepareDefaultLifecycle().before, plan.before, '目标或已启用默认前置已变化');
  const record = { plan, requests: [], passed: false, restored: false };
  const body = {
    enabled: true,
    expectedRevision: new Date(plan.before.provider.updatedAt).toISOString(),
  };
  const restore = () =>
    request('settings', {
      expectedRevision: String(plan.before.routing.revision + 1),
      researchDefault: { providerId: provider, model: plan.before.routing.researchDefaultModel },
    });
  try {
    for (const [phase, options] of [
      [
        'stale-settings',
        {
          clearResearchDefault: true,
          expectedSettingsRevision: String(plan.before.routing.revision - 1),
        },
      ],
      ['missing-confirmation', {}],
    ]) {
      const result = await request('providers/lmstudio/enabled', { ...body, ...options });
      record.requests.push({ phase, ...result });
      assert.equal(result.status, 409);
      verifyDefaultLifecycle(plan, readDefaultLifecycleTarget(), 'unchanged');
    }
    const result = await request('providers/lmstudio/enabled', {
      ...body,
      clearResearchDefault: true,
      expectedSettingsRevision: String(plan.before.routing.revision),
    });
    record.requests.push({ phase: 'atomic-clear', ...result });
    assert.equal(result.status, 200);
    record.cleared = readDefaultLifecycleTarget();
    verifyDefaultLifecycle(plan, record.cleared, 'cleared');
    const restored = await restore();
    record.requests.push({ phase: 'restore-default', ...restored });
    assert.equal(restored.status, 200);
    record.after = readDefaultLifecycleTarget();
    verifyDefaultLifecycle(plan, record.after, 'restored');
    record.restored = true;
    record.passed = true;
  } catch {
    record.failure = '目标生命周期验收未满足预期；保留实际结果，不发模型请求';
    const current = readDefaultLifecycleTarget();
    try {
      verifyDefaultLifecycle(plan, current, 'restored');
      record.restored = true;
    } catch {
      try {
        verifyDefaultLifecycle(plan, current, 'cleared');
        const result = await restore();
        record.requests.push({ phase: 'guarded-restore', ...result });
        assert.equal(result.status, 200);
        verifyDefaultLifecycle(plan, readDefaultLifecycleTarget(), 'restored');
        record.restored = true;
      } catch {
        // 仅恢复精确已知的清除状态；并发变化或拒绝均保留，不覆盖他人设置。
      }
    }
    record.after = readDefaultLifecycleTarget();
  }
  return record;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2);
    assert(args.length === 0 || (args.length === 2 && args[0] === '--apply'));
    const result =
      args.length === 0
        ? prepareDefaultLifecycle()
        : await applyDefaultLifecycle(JSON.parse(readFileSync(args[1], 'utf8')));
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (result.passed === false) process.exitCode = 1;
  } catch {
    process.stderr.write('默认生命周期预检失败，未自动改写目标。\n');
    process.exitCode = 1;
  }
}
