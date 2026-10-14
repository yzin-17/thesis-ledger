import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  aiGenerationContracts,
  identitySessionSchema,
  authoringDraftReadSchema,
} from '../packages/schemas/dist/index.js';

// 固定开发目标；仅本次标记身份/草稿允许 HTTP 写入，Docker、SQL、Redis 均只读。
assert.deepEqual(process.argv.slice(2), ['--confirm=thesis-ledger-dev/thesis_ledger']);
const base = 'http://127.0.0.1:3000/api/v1';
const server = 'thesis-ledger-dev-thesis-ledger-1';
const postgres = 'thesis-ledger-dev-postgres-1';
const redis = 'thesis-ledger-dev-redis-1';
const runTag = `a5d_${new Date().toISOString().slice(0, 10).replaceAll('-', '')}_${randomUUID().slice(0, 8)}`;
const startedAt = new Date().toISOString();
const checks = [];
const excludedVolatileTables = ['AutomationJob', 'ProviderHealth', 'ProviderHealthCheck'];
const contractIds = [
  aiGenerationContracts.authoringAnalysis,
  aiGenerationContracts.authoringGeneration,
  aiGenerationContracts.authoringModification,
].map((contract) => contract.ref.id);
const hash = (data) => createHash('sha256').update(data).digest('hex');
const literal = (value) => `'${value.replaceAll("'", "''")}'`;
const identifier = (value) => `"${value.replaceAll('"', '""')}"`;
const ownUsers = `SELECT id FROM "IdentityUser" WHERE starts_with(username, ${literal(`${runTag}.`)})`;
function query(sql) {
  return JSON.parse(
    execFileSync(
      'docker',
      [
        'exec',
        postgres,
        'psql',
        '-U',
        'thesis_ledger',
        '-d',
        'thesis_ledger',
        '-Atq',
        '-v',
        'ON_ERROR_STOP=1',
        '-c',
        `BEGIN READ ONLY; ${sql}; COMMIT;`,
      ],
      { encoding: 'utf8', timeout: 30_000, maxBuffer: 8 * 1024 * 1024 },
    ).trim(),
  );
}
function witness() {
  const tables = query(
    `SELECT json_agg(tablename ORDER BY tablename) FROM pg_tables WHERE schemaname='public'`,
  );
  const filters = new Map([
    ['IdentityUser', `id NOT IN (${ownUsers})`],
    ['IdentitySession', `"userId" NOT IN (${ownUsers})`],
    ['StrategyAuthoringDraft', `"ownerId" NOT IN (SELECT id::text FROM (${ownUsers}) u)`],
    ['StrategyAuthoringRevision', `"ownerId" NOT IN (SELECT id::text FROM (${ownUsers}) u)`],
  ]);
  const rows = tables
    .filter((name) => !excludedVolatileTables.includes(name))
    .map(
      (name) =>
        `SELECT ${literal(name)} AS name, count(*)::int AS count,
      md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY md5(to_jsonb(t)::text)), '')) AS digest
      FROM public.${identifier(name)} t ${filters.has(name) ? `WHERE ${filters.get(name)}` : ''}`,
    );
  return query(`SELECT json_object_agg(name, json_build_object('count', count, 'digest', digest))
    FROM (${rows.join(' UNION ALL ')}) w`);
}
function runtimeIdentity() {
  const names = [server, 'thesis-ledger-dev-backtest-worker-1', postgres, redis];
  const containers = JSON.parse(
    execFileSync('docker', ['inspect', ...names], { encoding: 'utf8' }),
  ).map((container) => {
    assert.equal(container.Config.Labels['com.docker.compose.project'], 'thesis-ledger-dev');
    assert.equal(container.State.Health.Status, 'healthy');
    return { name: container.Name, image: container.Image, id: container.Id };
  });
  const paths = [
    'apps/server/dist/src/app.module.js',
    ...[
      'authoring-execution.module',
      'authoring-submit.service',
      'authoring-operation.controller',
      'authoring-operation.repository',
      'authoring-model-policy',
      'authoring-queue',
      'authoring.worker',
      'authoring.executor',
    ].map((name) => `apps/server/dist/src/strategy-authoring/${name}.js`),
    'packages/schemas/dist/ai-execution.js',
    'packages/schemas/dist/strategy-authoring-generation.js',
  ];
  const code = `const fs=require('fs'),crypto=require('crypto'),path=require('path');const paths=${JSON.stringify(paths)};
    const schemaBase=path.dirname(require.resolve('@thesis-ledger/schemas',{paths:['/app/apps/server']}));
    const resolve=p=>p.startsWith('packages/schemas/dist/')?path.join(schemaBase,p.slice('packages/schemas/dist/'.length)):p;
    console.log(JSON.stringify({hashes:Object.fromEntries(paths.map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(resolve(p))).digest('hex')])),
      resolvedPaths:Object.fromEntries(paths.map(p=>[p,resolve(p)]))}));`;
  const deployed = JSON.parse(
    execFileSync('docker', ['exec', server, 'node', '-e', code], { encoding: 'utf8' }),
  );
  const deployedHashes = deployed.hashes;
  for (const path of paths)
    assert.equal(deployedHashes[path], hash(readFileSync(path)), `目标编译输入不一致：${path}`);
  return { containers, deployedHashes, resolvedPaths: deployed.resolvedPaths };
}
function heartbeat() {
  const key = 'thesis-ledger:queue:v1:authoring:worker-heartbeat';
  const command = (operation) =>
    execFileSync('docker', ['exec', redis, 'redis-cli', '--raw', operation, key], {
      encoding: 'utf8',
      timeout: 10_000,
    }).trim();
  const value = command('GET');
  const ttlMs = Number(command('PTTL'));
  const ageMs = Date.now() - Date.parse(value);
  assert(
    Number.isFinite(ageMs) && ageMs >= -2000 && ageMs < 45_000,
    '目标编写 Worker 心跳必须新鲜',
  );
  assert(ttlMs > 0 && ttlMs <= 45_000, '目标编写 Worker 心跳必须尚未过期');
  return { key, value, ageMs, ttlMs };
}
async function request(name, path, expected, body, token, method) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers['x-thesis-ledger-session'] = token;
  if (process.env.THESIS_LEDGER_LAN_TOKEN)
    headers.authorization = `Bearer ${process.env.THESIS_LEDGER_LAN_TOKEN}`;
  const response = await fetch(`${base}${path}`, {
    method: method ?? (body === undefined ? 'GET' : 'POST'),
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15_000),
  });
  assert.equal(response.status, expected, `${name}：HTTP 状态不符`);
  const data = response.status === 204 ? null : await response.json();
  checks.push({ name, status: response.status });
  return data;
}
async function inventory() {
  const providers = await request('Provider 配置读取', '/ai/providers', 200);
  assert(Array.isArray(providers));
  assert.deepEqual(providers.map((provider) => provider.name).sort(), ['lmstudio', 'openrouter']);
  const result = [];
  for (const provider of providers) {
    const routes = await request(
      `${provider.name} 用途就绪读取`,
      `/ai/providers/${encodeURIComponent(provider.name)}/readiness`,
      200,
    );
    assert(Array.isArray(routes));
    assert.equal(
      routes.filter((route) => contractIds.includes(route.contract.id)).length,
      0,
      '目标编写用途已改变，停止缺失用途验收',
    );
    assert.equal(
      provider.executionRoutes.filter((route) => contractIds.includes(route.contract.id)).length,
      0,
    );
    assert.equal(provider.enabled, true);
    assert(provider.models.length > 0);
    const configuration = Object.fromEntries(
      [
        'name',
        'type',
        'source',
        'enabled',
        'priority',
        'capabilities',
        'baseUrl',
        'models',
        'authMode',
        'upstreamFormat',
        'chatImplementation',
        'executionRouteConfigs',
        'modelDefaults',
        'modelPricing',
        'timeoutMs',
        'credentialConfigured',
      ].map((key) => [key, provider[key]]),
    );
    result.push({
      name: provider.name,
      models: provider.models,
      configurationFingerprint: hash(JSON.stringify(configuration)),
      routes: routes.map((route) => ({
        model: route.model,
        contract: route.contract,
        mode: route.mode,
        readiness: route.readiness.state,
        liveValidation: route.liveValidation.status,
      })),
      missingContracts: contractIds,
    });
  }
  return result;
}
const runtime = runtimeIdentity();
const structure = query(`SELECT json_build_object('database', current_database(), 'owner',
  (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()),
  'head', (SELECT version FROM "SchemaVersion" WHERE id=1), 'tables', (SELECT count(*) FROM pg_tables WHERE schemaname='public'))`);
assert.deepEqual(structure, {
  database: 'thesis_ledger',
  owner: 'thesis_ledger',
  head: '20261005143000_authoring_analysis_application',
  tables: 80,
});
const before = witness();
const heartbeatBefore = heartbeat();
const providersBefore = await inventory();
let token;
let draftId;
let failure;
let providersAfter;
let heartbeatAfter;
try {
  const content = {
    title: `${runTag} 未验证用途准入`,
    description: 'A5-D 目标拒绝路径验收',
    questions: [],
    requirements: [],
    runtimeIntents: [],
    removedRequirements: [],
    definitionText: '',
    manualChanges: [],
  };
  const registration = await request('标记用户注册', '/identity/users', 201, {
    username: `${runTag}.owner`,
    password: randomBytes(24).toString('base64url'),
    displayName: 'A5-D 目标验收',
  });
  if (typeof registration?.token === 'string') token = registration.token;
  const parsedSession = identitySessionSchema.safeParse(registration);
  assert(parsedSession.success, '注册响应必须符合共享合同');
  const principal = await request('实际身份读取', '/identity/session', 200, undefined, token);
  assert.deepEqual(principal, parsedSession.data.principal);
  const created = await request('标记草稿创建', '/strategy-authoring/drafts', 201, content, token);
  if (typeof created?.id === 'string') draftId = created.id;
  const draft = authoringDraftReadSchema.parse(created);
  assert.equal(draft.ownerId, principal.id);
  assert.equal(draft.validation.status, 'incomplete');
  await request('匿名操作读取拒绝', `/strategy-authoring/operations/${randomUUID()}`, 401);
  await request('匿名操作提交拒绝', `/strategy-authoring/drafts/${draftId}/operations`, 401, {});
  await request(
    '不存在操作读取',
    `/strategy-authoring/operations/${randomUUID()}`,
    404,
    undefined,
    token,
  );
  await request(
    '不存在操作取消',
    `/strategy-authoring/operations/${randomUUID()}/cancel`,
    404,
    {},
    token,
  );
  for (const provider of providersBefore) {
    for (const kind of ['analyze', 'generate', 'modify']) {
      const result = await request(
        `${provider.name} ${kind} 未验证用途拒绝`,
        `/strategy-authoring/drafts/${draftId}/operations`,
        400,
        {
          kind,
          expectedRevision: draft.revision,
          idempotencyKey: `${runTag}.${provider.name}.${kind}`,
          providerId: provider.name,
          model: provider.models[0],
          intent: '验证当前模型未配置编写用途时拒绝提交',
          unknownCostAcknowledgedAt: null,
        },
        token,
      );
      assert.equal(result.code, 'AUTHORING_MODEL_UNAVAILABLE');
    }
  }
  const unchanged = await request(
    '拒绝提交后草稿读取',
    `/strategy-authoring/drafts/${draftId}`,
    200,
    undefined,
    token,
  );
  assert.deepEqual(unchanged, draft);
  providersAfter = await inventory();
  assert.deepEqual(providersAfter, providersBefore, '用途与配置在验收中改变');
  heartbeatAfter = heartbeat();
} catch (error) {
  failure = error;
} finally {
  if (token && draftId) {
    try {
      const current = await request(
        '收尾读取本次草稿',
        `/strategy-authoring/drafts/${draftId}`,
        200,
        undefined,
        token,
      );
      const discarded = await request(
        '收尾丢弃本次草稿',
        `/strategy-authoring/drafts/${draftId}/discard`,
        201,
        { expectedRevision: current.revision },
        token,
      );
      assert.equal(discarded.state, 'discarded');
    } catch (error) {
      failure ??= error;
    }
  }
  if (token) {
    try {
      await request('撤销本次会话', '/identity/session/revoke', 204, {}, token);
      await request(
        '撤销后操作访问拒绝',
        `/strategy-authoring/operations/${randomUUID()}`,
        401,
        undefined,
        token,
      );
    } catch (error) {
      failure ??= error;
    }
  }
}
const after = witness();
const changedTables = Object.keys(before).filter(
  (name) => JSON.stringify(before[name]) !== JSON.stringify(after[name]),
);
const retained =
  query(`SELECT json_build_object('users', (SELECT count(*) FROM "IdentityUser" WHERE id IN (${ownUsers})),
  'activeSessions', (SELECT count(*) FROM "IdentitySession" WHERE "userId" IN (${ownUsers}) AND "revokedAt" IS NULL),
  'drafts', (SELECT coalesce(json_agg(json_build_object('id', id, 'state', state, 'revision', revision)), '[]'::json)
    FROM "StrategyAuthoringDraft" WHERE "ownerId" IN (SELECT id::text FROM (${ownUsers}) u)),
  'operations', (SELECT count(*) FROM "StrategyAuthoringOperation" WHERE "ownerId" IN (SELECT id::text FROM (${ownUsers}) u)),
  'invocations', (SELECT count(*) FROM "AiInvocation" WHERE "ownerId" IN (${ownUsers})))`);
try {
  assert.equal(changedTables.length, 0, `既有数据摘要变化：${changedTables.join(',')}`);
  assert.equal(retained.users, 1);
  assert.equal(retained.activeSessions, 0);
  assert.equal(retained.drafts.length, 1);
  assert.equal(retained.drafts[0].state, 'discarded');
  assert.equal(retained.operations, 0);
  assert.equal(retained.invocations, 0);
} catch (error) {
  failure ??= error;
}
console.log(
  JSON.stringify({
    stage: 'authoring-target-A5-D',
    outcome: failure ? 'failed' : 'passed',
    startedAt,
    completedAt: new Date().toISOString(),
    runTag,
    runtime,
    structure,
    providersBefore,
    providersAfter,
    heartbeatBefore,
    heartbeatAfter,
    checks,
    retained,
    protectedTables: before,
    changedTables,
    unchangedProtectedTables: Object.keys(before).length - changedTables.length,
    excludedVolatileTables,
  }),
);
if (failure) throw failure;
