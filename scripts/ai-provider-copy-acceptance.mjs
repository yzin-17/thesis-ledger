import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';

const require = createRequire('/app/package.json');
const { PrismaClient } = require('@prisma/client');
const { credentialKeyRingFromEnv, decryptProviderCredential } = require('/app/apps/server/dist/src/platform/credential-security.js');
const database = 'postgresql://restore_owner@127.0.0.1:5432/restore_db';
const origin = 'http://127.0.0.1:3001';
const fixture = 'controlled-database-only-acceptance';
const key = 'synthetic-copy-credential';
const quoted = name => '"' + name.replaceAll('"', '""') + '"';

async function tableDigests(prisma) {
  const rows = await prisma.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`;
  const values = await Promise.all(rows.map(async ({ tablename }) => {
    const [row] = await prisma.$queryRawUnsafe(`SELECT md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY to_jsonb(t)::text),'')) AS digest FROM ${quoted(tablename)} t`);
    return [tablename, row.digest];
  }));
  return Object.fromEntries(values);
}

export async function verifyProviderCopy() {
  assert.equal(process.env.AI_PROVIDER_COPY_DATABASE_URL, database, '只允许登记的隔离数据库');
  assert.match(process.env.AI_PROVIDER_COPY_TEST_TOKEN ?? '', /^[a-f0-9-]{36}$/);
  const prisma = new PrismaClient({ datasourceUrl: database });
  let child, requests = 0, starts = 0, upstreamRequests = 0;
  const writableNames = new Set([fixture]);
  const upstream = createServer((_request, response) => { upstreamRequests++; response.writeHead(503).end(); });
  await new Promise(resolve => upstream.listen(19099, '127.0.0.1', resolve));
  const call = async (method = 'GET', suffix = '', body, status = 200) => {
    assert(['GET', 'POST', 'PATCH', 'DELETE'].includes(method));
    assert(suffix === '' || [...writableNames].some(name =>
      suffix === `/${encodeURIComponent(name)}` || suffix === `/${encodeURIComponent(name)}/enabled`));
    const response = await fetch(origin + '/api/v1/ai/providers' + suffix, {
      method, headers: { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(8000),
    });
    requests++;
    assert.equal(response.status, status, `受控配置 ${method} 返回状态异常`);
    const result = await response.json();
    const serialized = JSON.stringify(result);
    assert(!serialized.includes(key) && !serialized.includes('encryptedCredentials'), '接口回显了凭证');
    return result;
  };
  const stop = async () => {
    if (!child) return;
    const running = child; child = undefined;
    if (running.exitCode !== null || running.signalCode !== null) return;
    const exited = new Promise(resolve => running.once('exit', resolve));
    running.kill('SIGTERM');
    const timeout = setTimeout(() => running.kill('SIGKILL'), 8000); timeout.unref();
    await exited; clearTimeout(timeout);
  };
  const start = async () => {
    assert(!child);
    child = spawn(process.execPath, ['/app/apps/server/dist/src/main.js'], {
      cwd: '/app', stdio: ['ignore', 'ignore', 'ignore'],
      env: { ...process.env, DATABASE_URL: database, NODE_ENV: 'test', PORT: '3001',
        AI_PROVIDER_CONFIGS_JSON: '{', AI_DEFAULT_PROVIDER: 'retired-env-must-not-register',
        AI_RESEARCH_EXECUTION_ENABLED: 'false', AI_RESEARCH_V2_WRITES_ENABLED: 'false',
        STRATEGY_AI_OPTIMIZATION_ENABLED: 'false', STRATEGY_RISK_APPLICATIONS_ENABLED: 'false' },
    });
    for (let attempt = 0; attempt < 100; attempt++) {
      assert(child.exitCode === null && child.signalCode === null, '隔离实际 Server 提前退出');
      try {
        const response = await fetch(origin + '/api/v1/ai/providers', { signal: AbortSignal.timeout(500) });
        if (response.ok) { starts++; return; }
      } catch { /* 等待实际 HTTP 入口就绪。 */ }
      await sleep(150);
    }
    throw new Error('隔离实际 Server 启动超时');
  };
  try {
    const [identity] = await prisma.$queryRaw`SELECT current_database() AS database,current_user AS owner`;
    assert.deepEqual(identity, { database: 'restore_db', owner: 'restore_owner' });
    const before = await tableDigests(prisma);
    const original = await prisma.providerConfig.findMany({ where: { type: 'ai' }, orderBy: { name: 'asc' } });
    await start();
    const originalList = await call();
    assert.equal(originalList.length, original.length);
    assert(originalList.every(row => row.source === 'database'));
    const routing = await prisma.aiRoutingSettings.findUnique({ where: { id: 'global' } });
    const validated = originalList.find(row => row.enabled && row.name !== routing?.researchDefaultProvider &&
      original.find(stored => stored.name === row.name)?.settings?.generationValidation?.length);
    assert(validated, '副本缺少已有验证记录的启用配置，不能证明零生成启停');
    writableNames.add(validated.name);
    const lifecyclePath = `/${encodeURIComponent(validated.name)}/enabled`;
    const paused = await call('PATCH', lifecyclePath, { enabled: false, expectedRevision: validated.updatedAt });
    assert.equal(paused.enabled, false);
    const enabled = await call('PATCH', lifecyclePath, { enabled: true, expectedRevision: paused.updatedAt });
    assert.equal(enabled.enabled, true);
    writableNames.delete(validated.name);
    await stop();
    // 仅清空已登记的可丢弃副本，模拟数据库没有 AI 配置时的真实启动。
    await prisma.$transaction([
      prisma.aiRoutingSettings.updateMany({ data: { researchDefaultProvider: null, researchDefaultModel: null } }),
      prisma.providerConfig.deleteMany({ where: { type: 'ai' } }),
    ]);
    await start(); assert.deepEqual(await call(), []);
    const input = { name: fixture, baseUrl: 'http://127.0.0.1:19099/v1', models: ['controlled-model'],
      authMode: 'api_key', upstreamFormat: 'chat-completions', chatImplementation: 'compatible',
      enabled: false, apiKey: key, priority: 991, capabilities: ['chat'], modelPricing: {} };
    let saved = await call('POST', '', input, 201);
    assert.equal(saved.source, 'database'); assert.equal(saved.enabled, false); assert.equal(saved.credentialConfigured, true);
    const first = await prisma.providerConfig.findUniqueOrThrow({ where: { name: fixture } });
    assert(first.encryptedCredentials?.length);
    assert.equal(decryptProviderCredential(first.encryptedCredentials, credentialKeyRingFromEnv()).credential, key);
    const { apiKey: _key, ...blankKeyInput } = input; void _key;
    saved = await call('POST', '', { ...blankKeyInput, priority: 992, expectedRevision: saved.updatedAt }, 201);
    const edited = await prisma.providerConfig.findUniqueOrThrow({ where: { name: fixture } });
    assert.equal(Buffer.compare(first.encryptedCredentials, edited.encryptedCredentials), 0, '空密钥编辑改变原密文');
    assert.equal(saved.priority, 992);
    await call('POST', '', { ...blankKeyInput, expectedRevision: first.updatedAt.toISOString() }, 409);
    await call('PATCH', `/${fixture}/enabled`, { enabled: true, expectedRevision: saved.updatedAt }, 400);
    const disabled = await call('PATCH', `/${fixture}/enabled`, { enabled: false, expectedRevision: saved.updatedAt });
    assert.equal(disabled.enabled, false);
    await stop(); await start();
    const reloaded = await call();
    assert.equal(reloaded.length, 1); assert.equal(reloaded[0].name, fixture);
    assert.equal(reloaded[0].credentialConfigured, true); assert.equal(reloaded[0].priority, 992);
    assert.equal(Buffer.compare(first.encryptedCredentials,
      (await prisma.providerConfig.findUniqueOrThrow({ where: { name: fixture } })).encryptedCredentials), 0);
    await call('DELETE', `/${fixture}`, { expectedRevision: first.updatedAt.toISOString() }, 409);
    const removed = await call('DELETE', `/${fixture}`, { expectedRevision: reloaded[0].updatedAt });
    assert.equal(removed.deleted, true); assert.deepEqual(await call(), []);
    await stop(); await start(); assert.deepEqual(await call(), []);
    await stop();
    const after = await tableDigests(prisma);
    const changedTables = Object.keys(before).filter(name => before[name] !== after[name]);
    assert(changedTables.every(name => ['ProviderConfig', 'AiRoutingSettings'].includes(name)), '配置验收改变其他业务表');
    assert.equal(upstreamRequests, 0);
    return { passed: true, format: 'ai-provider-copy-acceptance-v1', starts, requests,
      originalProviders: original.length, databaseOnly: true, retiredMalformedEnvironmentIgnored: true,
      emptyBootAndRestart: true, disabledSave: true, blankKeyPreserved: true,
      staleSaveAndDeleteRejected: true, unverifiedEnableRejected: true, disabledLifecycle: true,
      storedValidatedEnableDisable: true,
      persistedRestart: true, deleteAndRestart: true, credentialEcho: false,
      changedTables, otherTablesPreserved: true, upstreamRequests, realModelRequests: 0,
      boundary: '同一镜像保留副本的实际 HTTP 保存、启停、删除与独立进程重启；启用只复用已有验证记录，真实用途仍暂停。' };
  } finally {
    await stop(); await prisma.$disconnect();
    await new Promise(resolve => upstream.close(resolve));
  }
}
