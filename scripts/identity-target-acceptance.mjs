import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { identitySessionSchema, authoringDraftReadSchema } from '../packages/schemas/dist/index.js';

// 本入口仅对固定开发目标的随机标记用户执行 HTTP 写入；Docker/SQL 始终只读。
assert.deepEqual(process.argv.slice(2), ['--confirm=thesis-ledger-dev/thesis_ledger']);
const base = 'http://127.0.0.1:3000/api/v1';
const database = 'thesis_ledger';
const server = 'thesis-ledger-dev-thesis-ledger-1';
const postgres = 'thesis-ledger-dev-postgres-1';
const runTag = `i4_${new Date().toISOString().slice(0, 10).replaceAll('-', '')}_${randomUUID().slice(0, 8)}`;
const startedAt = new Date().toISOString();
const checks = [];
const rateLimitWaits = [];
const sessions = [];
const drafts = new Map();
const excludedVolatileTables = ['AutomationJob', 'ProviderHealth', 'ProviderHealthCheck'];
const hash = (value) => createHash('sha256').update(value).digest('hex');
const sqlName = (name) => `"${name.replaceAll('"', '""')}"`;
const sqlLiteral = (value) => `'${value.replaceAll("'", "''")}'`;
const ownUserFilter = `starts_with(username, ${sqlLiteral(`${runTag}.`)})`;
function query(sql) {
  return JSON.parse(
    execFileSync(
      'docker',
      [
        'exec',
        postgres,
        'psql',
        '-U',
        database,
        '-d',
        database,
        '-Atq',
        '-v',
        'ON_ERROR_STOP=1',
        '-c',
        `BEGIN READ ONLY; ${sql}; COMMIT;`,
      ],
      { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 30_000 },
    ).trim(),
  );
}
function runtimeIdentity() {
  const names = [server, 'thesis-ledger-dev-backtest-worker-1', postgres];
  const containers = JSON.parse(
    execFileSync('docker', ['inspect', ...names], { encoding: 'utf8' }),
  );
  const identity = containers.map((container) => {
    assert.equal(container.Config.Labels['com.docker.compose.project'], 'thesis-ledger-dev');
    assert.equal(container.State.Health.Status, 'healthy');
    return { name: container.Name, id: container.Id, image: container.Image };
  });
  const modules = [
    'identity/identity.controller',
    'identity/identity.service',
    'identity/identity.guard',
    'identity/identity-credentials',
    'strategy-authoring/authoring-draft.controller',
    'strategy-authoring/authoring-draft.repository',
    'strategy-authoring/authoring-store',
  ];
  const code = `const fs=require('fs'),crypto=require('crypto');const modules=${JSON.stringify(modules)};
    console.log(JSON.stringify(Object.fromEntries(modules.map(name=>[name,crypto.createHash('sha256')
      .update(fs.readFileSync('apps/server/dist/src/'+name+'.js')).digest('hex')]))));`;
  const deployed = JSON.parse(
    execFileSync('docker', ['exec', server, 'node', '-e', code], { encoding: 'utf8' }),
  );
  for (const name of modules)
    assert.equal(
      deployed[name],
      hash(readFileSync(`apps/server/dist/src/${name}.js`)),
      `目标编译模块不一致：${name}`,
    );
  return {
    containers: identity,
    compiledModuleHashes: deployed,
    sourceModuleHashes: Object.fromEntries(
      modules.map((name) => [name, hash(readFileSync(`apps/server/src/${name}.ts`))]),
    ),
  };
}
function witness() {
  const tables = query(`SELECT coalesce(json_agg(tablename ORDER BY tablename), '[]'::json)
    FROM pg_tables WHERE schemaname='public'`);
  const testUsers = `SELECT id FROM "IdentityUser" WHERE ${ownUserFilter}`;
  const filters = new Map([
    ['IdentityUser', `NOT (${ownUserFilter})`],
    ['IdentitySession', `"userId" NOT IN (${testUsers})`],
    [
      'StrategyAuthoringDraft',
      `"ownerId" NOT IN (SELECT id::text FROM "IdentityUser" WHERE ${ownUserFilter})`,
    ],
    [
      'StrategyAuthoringRevision',
      `"ownerId" NOT IN (SELECT id::text FROM "IdentityUser" WHERE ${ownUserFilter})`,
    ],
  ]);
  const selected = tables.filter((name) => !excludedVolatileTables.includes(name));
  const rows = selected.map(
    (name) => `SELECT ${sqlLiteral(name)} AS name, count(*)::int AS count,
    md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY md5(to_jsonb(t)::text)), '')) AS digest
    FROM public.${sqlName(name)} t ${filters.has(name) ? `WHERE ${filters.get(name)}` : ''}`,
  );
  return query(`SELECT json_object_agg(name, json_build_object('count', count, 'digest', digest))
    FROM (${rows.join(' UNION ALL ')}) AS witnesses`);
}
async function request(name, path, expected, body, token, method) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers['x-thesis-ledger-session'] = token;
  if (process.env.THESIS_LEDGER_LAN_TOKEN)
    headers.authorization = `Bearer ${process.env.THESIS_LEDGER_LAN_TOKEN}`;
  let response;
  for (let attempt = 0; attempt <= 2; attempt += 1) {
    response = await fetch(`${base}${path}`, {
      method: method ?? (body === undefined ? 'GET' : 'POST'),
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status !== 429 || attempt === 2) break;
    const seconds = Number(response.headers.get('retry-after'));
    const error = await response.clone().json();
    assert.equal(error.error, 'rate_limited', '只重试全局限流中间件明确拒绝的请求');
    assert(Number.isInteger(seconds) && seconds >= 1 && seconds <= 60, '限流等待必须有界');
    await response.body.cancel();
    rateLimitWaits.push({ name, retryAfterSeconds: seconds, attempt: attempt + 1 });
    console.error(`${name}：按 Retry-After 等待 ${seconds} 秒`);
    await delay(seconds * 1000);
  }
  const allowed = Array.isArray(expected) ? expected : [expected];
  assert(
    allowed.includes(response.status),
    `${name}：预期 HTTP ${allowed.join('/')}，实际 ${response.status}`,
  );
  const data = response.status === 204 ? null : await response.json();
  checks.push({ name, status: response.status });
  return { status: response.status, data };
}
const content = (title) => ({
  title,
  description: 'I4 目标权限验收，仅保存未完成编写内容',
  questions: [],
  requirements: [],
  runtimeIntents: [],
  removedRequirements: [],
  definitionText: '',
  manualChanges: [],
});
function trackSession(data) {
  if (typeof data?.token === 'string') sessions.push({ token: data.token });
  const parsed = identitySessionSchema.safeParse(data);
  assert(parsed.success, '会话响应不符合共享契约');
  return parsed.data;
}
async function register(suffix) {
  const password = randomBytes(24).toString('base64url');
  const username = `${runTag}.${suffix}`;
  const result = await request(`注册${suffix}`, '/identity/users', 201, {
    username: username.toUpperCase(),
    password,
    displayName: `I4 目标验收 ${suffix}`,
  });
  const session = trackSession(result.data);
  assert.equal(session.principal.username, username);
  return { username, password, session };
}
async function createDraft(user, title) {
  const result = await request(
    `创建${title}`,
    '/strategy-authoring/drafts',
    201,
    content(title),
    user.session.token,
  );
  if (typeof result.data?.id === 'string') {
    drafts.set(result.data.id, { token: user.session.token, state: result.data.state });
  }
  const draft = authoringDraftReadSchema.parse(result.data);
  assert.equal(draft.ownerId, user.session.principal.id);
  assert.equal(draft.validation.status, 'incomplete');
  drafts.set(draft.id, { token: user.session.token, revision: draft.revision, state: draft.state });
  return draft;
}
async function isolation(owner, other, draft) {
  await request(
    '跨用户读取',
    `/strategy-authoring/drafts/${draft.id}`,
    404,
    undefined,
    other.session.token,
  );
  await request(
    '跨用户更新',
    `/strategy-authoring/drafts/${draft.id}`,
    404,
    { expectedRevision: draft.revision, content: content('越权更新') },
    other.session.token,
    'PATCH',
  );
  await request(
    '跨用户丢弃',
    `/strategy-authoring/drafts/${draft.id}/discard`,
    404,
    { expectedRevision: draft.revision },
    other.session.token,
  );
  const read = await request(
    '所属用户读取',
    `/strategy-authoring/drafts/${draft.id}`,
    200,
    undefined,
    owner.session.token,
  );
  assert.equal(read.data.ownerId, owner.session.principal.id);
}
async function lifecycle(user, draft) {
  const updates = await Promise.all(
    ['竞态甲', '竞态乙'].map((title) =>
      request(
        title,
        `/strategy-authoring/drafts/${draft.id}`,
        [200, 409],
        { expectedRevision: draft.revision, content: content(title) },
        user.session.token,
        'PATCH',
      ),
    ),
  );
  assert.equal(updates.filter((result) => result.status === 200).length, 1);
  assert.equal(updates.filter((result) => result.status === 409).length, 1);
  const updated = authoringDraftReadSchema.parse(
    updates.find((result) => result.status === 200).data,
  );
  drafts.set(draft.id, {
    token: user.session.token,
    revision: updated.revision,
    state: updated.state,
  });
  await request(
    '旧修订拒绝',
    `/strategy-authoring/drafts/${draft.id}`,
    409,
    { expectedRevision: draft.revision, content: content('旧修订') },
    user.session.token,
    'PATCH',
  );
  const discarded = await request(
    '所属用户丢弃',
    `/strategy-authoring/drafts/${draft.id}/discard`,
    201,
    { expectedRevision: updated.revision },
    user.session.token,
  );
  assert.equal(discarded.data.state, 'discarded');
  drafts.set(draft.id, {
    token: user.session.token,
    revision: discarded.data.revision,
    state: 'discarded',
  });
  await request(
    '关闭草稿拒绝更新',
    `/strategy-authoring/drafts/${draft.id}`,
    409,
    { expectedRevision: discarded.data.revision, content: content('关闭后写入') },
    user.session.token,
    'PATCH',
  );
}
async function cleanup() {
  const errors = [];
  for (const [id, draft] of drafts) {
    if (draft.state === 'discarded') continue;
    try {
      const current = await request(
        '收尾读取本次草稿',
        `/strategy-authoring/drafts/${id}`,
        200,
        undefined,
        draft.token,
      );
      const result = await request(
        '收尾丢弃本次草稿',
        `/strategy-authoring/drafts/${id}/discard`,
        201,
        { expectedRevision: current.data.revision },
        draft.token,
      );
      assert.equal(result.data.state, 'discarded');
    } catch (error) {
      errors.push(error);
    }
  }
  for (const session of sessions) {
    try {
      await request('撤销本次会话', '/identity/session/revoke', 204, {}, session.token);
      await request('撤销会话拒绝身份读取', '/identity/session', 401, undefined, session.token);
      await request(
        '撤销会话拒绝草稿访问',
        '/strategy-authoring/drafts',
        401,
        undefined,
        session.token,
      );
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length) throw new AggregateError(errors, '本次测试数据收尾失败');
}
const runtime = runtimeIdentity();
const structure = query(`SELECT json_build_object('database', current_database(), 'owner',
  (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()), 'head',
  (SELECT version FROM "SchemaVersion" WHERE id=1), 'tables',
  (SELECT count(*) FROM pg_tables WHERE schemaname='public'))`);
assert.equal(structure.database, database);
assert.equal(structure.owner, database);
assert.equal(structure.head, '20261005143000_authoring_analysis_application');
assert.equal(structure.tables, 80);
const before = witness();
let failure;
try {
  await request('匿名会话拒绝', '/identity/session', 401);
  await request('匿名草稿拒绝', '/strategy-authoring/drafts', 401);
  await request(
    '伪造随机会话拒绝',
    '/identity/session',
    401,
    undefined,
    randomBytes(32).toString('base64url'),
  );
  const alice = await register('alice');
  const bob = await register('bob');
  assert.notEqual(alice.session.principal.id, bob.session.principal.id);
  await request('用户名规范化唯一', '/identity/users', 409, {
    username: alice.username,
    password: randomBytes(24).toString('base64url'),
    displayName: '重复用户名',
  });
  const logged = await request('密码登录恢复同一用户', '/identity/sessions', 200, {
    username: alice.username.toUpperCase(),
    password: alice.password,
  });
  const loginSession = trackSession(logged.data);
  assert.deepEqual(loginSession.principal, alice.session.principal);
  const wrong = await request('错误密码拒绝', '/identity/sessions', 401, {
    username: alice.username,
    password: randomBytes(24).toString('base64url'),
  });
  const missing = await request('缺失用户名拒绝', '/identity/sessions', 401, {
    username: `${runTag}.missing`,
    password: randomBytes(24).toString('base64url'),
  });
  assert.deepEqual(wrong.data, missing.data);
  await request(
    '用户 UUID 不能代替会话',
    '/strategy-authoring/drafts',
    401,
    undefined,
    alice.session.principal.id,
  );
  await request(
    'owner 正文注入拒绝',
    '/strategy-authoring/drafts',
    400,
    { ...content('注入'), ownerId: bob.session.principal.id },
    alice.session.token,
  );
  const aliceDraft = await createDraft(alice, `${runTag} 甲一`);
  const second = await createDraft(alice, `${runTag} 甲二`);
  const bobDraft = await createDraft(bob, `${runTag} 乙一`);
  await isolation(alice, bob, aliceDraft);
  await isolation(bob, alice, bobDraft);
  for (const user of [alice, bob]) {
    const list = await request(
      '所属用户列表隔离',
      '/strategy-authoring/drafts',
      200,
      undefined,
      user.session.token,
    );
    assert.equal(list.data.items.length, user === alice ? 2 : 1);
    assert(list.data.items.every((item) => item.ownerId === user.session.principal.id));
  }
  await request(
    'owner 查询注入拒绝',
    `/strategy-authoring/drafts?ownerId=${alice.session.principal.id}`,
    400,
    undefined,
    bob.session.token,
  );
  const page = await request(
    '分页首项',
    '/strategy-authoring/drafts?limit=1',
    200,
    undefined,
    alice.session.token,
  );
  assert.equal(page.data.items.length, 1);
  assert(page.data.nextCursor);
  const cursor = new URLSearchParams({
    limit: '1',
    beforeId: page.data.nextCursor.id,
    beforeUpdatedAt: page.data.nextCursor.updatedAt,
  });
  const next = await request(
    '分页次项',
    `/strategy-authoring/drafts?${cursor}`,
    200,
    undefined,
    loginSession.token,
  );
  assert.equal(next.data.items.length, 1);
  assert.deepEqual(
    new Set([page.data.items[0].id, next.data.items[0].id]),
    new Set([aliceDraft.id, second.id]),
  );
  await lifecycle(alice, aliceDraft);
  const stored = query(`SELECT coalesce(json_agg("tokenDigest"), '[]'::json) FROM "IdentitySession"
    WHERE "userId" IN (SELECT id FROM "IdentityUser" WHERE ${ownUserFilter})`);
  assert.deepEqual(new Set(stored), new Set(sessions.map((session) => hash(session.token))));
  const hashes =
    query(`SELECT json_build_object('users', count(*), 'scrypt', bool_and("passwordHash" LIKE 'scrypt-v1:%'))
    FROM "IdentityUser" WHERE ${ownUserFilter}`);
  assert.equal(hashes.users, 2);
  assert.equal(hashes.scrypt, true);
} catch (error) {
  failure = error;
} finally {
  try {
    await cleanup();
  } catch (error) {
    failure ??= error;
  }
}
const after = witness();
const changedTables = Object.keys(before).filter(
  (name) => JSON.stringify(before[name]) !== JSON.stringify(after[name]),
);
const retained =
  query(`SELECT json_build_object('users', (SELECT count(*) FROM "IdentityUser" WHERE ${ownUserFilter}),
  'activeSessions', (SELECT count(*) FROM "IdentitySession" WHERE "revokedAt" IS NULL AND "userId" IN
    (SELECT id FROM "IdentityUser" WHERE ${ownUserFilter})),
  'draftStates', (SELECT coalesce(json_agg(json_build_object('id', id, 'state', state, 'revision', revision) ORDER BY id), '[]'::json)
    FROM "StrategyAuthoringDraft" WHERE "ownerId" IN
    (SELECT id::text FROM "IdentityUser" WHERE ${ownUserFilter})))`);
try {
  assert.equal(changedTables.length, 0, `既有数据摘要变化：${changedTables.join(',')}`);
  assert.equal(retained.users, 2);
  assert.equal(retained.activeSessions, 0);
  assert.equal(retained.draftStates.length, 3);
  assert(retained.draftStates.every((draft) => draft.state === 'discarded'));
} catch (error) {
  failure ??= error;
}
console.log(
  JSON.stringify({
    stage: 'identity-target-I4',
    outcome: failure ? 'failed' : 'passed',
    startedAt,
    completedAt: new Date().toISOString(),
    runTag,
    structure,
    runtime,
    checks,
    rateLimitWaits,
    retained,
    protectedTables: before,
    changedTables,
    unchangedProtectedTables: Object.keys(before).length - changedTables.length,
    excludedVolatileTables,
  }),
);
if (failure) throw failure;
