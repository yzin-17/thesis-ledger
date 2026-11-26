import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DsaRuntimeRecovery } from '../../../thesis-ledger-infra/scripts/dsa-runtime-recovery.mjs';
import { ownsUpdateLock } from '../../../thesis-ledger-infra/scripts/runtime/lock.mjs';
import { fingerprint, preservedMatch, replayProgress } from './arena-replay-watch.mjs';

// 真实比赛只经正式 API 创建、启动和暂停；没有重试接口或模型参数写入。
const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const [sourceId, directory] = process.argv.slice(2);
assert(process.argv.length === 4 && /^[0-9a-f-]{36}$/i.test(sourceId));
assert(ownsUpdateLock(process.env.INFRA_UPDATE_LOCK_PATH ?? ''), '需要正式维护锁');
const output = resolve(directory);
assert(output.startsWith(resolve(root, '.recovery-artifacts') + '/'));
mkdirSync(output, { mode: 0o700 });
const save = (name, value, once = false) => writeFileSync(resolve(output, name), JSON.stringify(value, null, 2) + '\n',
  { mode: 0o600, ...(once ? { flag: 'wx' } : {}) });
const runtime = new DsaRuntimeRecovery(resolve(root, '../thesis-ledger-infra'), resolve(root, '../thesis-ledger-infra/.env'));
const ownerPath = resolve(root, '.recovery-artifacts/arena-v2-admission-deployment-20261116/queue-owner.json');
const owner = JSON.parse(readFileSync(ownerPath));
async function inspect(token) {
  const { PrismaClient } = await import('@prisma/client');
  const { RedisService, redisKey } = await import('./dist/src/platform/redis.service.js');
  const { Queue } = await import('bullmq');
  const { createHash } = await import('node:crypto');
  const { readFileSync } = await import('node:fs');
  const sha = x => createHash('sha256').update(JSON.stringify(x)).digest('hex');
  const db = new PrismaClient(), redis = new RedisService();
  const queue = new Queue('live', { connection: redis.client, prefix: redisKey('queue', 'arena') });
  try {
    const provider = await db.$transaction(async tx => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      const [row] = await tx.$queryRaw`SELECT name,enabled,settings,capabilities,priority FROM "ProviderConfig" WHERE name='lmstudio'`;
      assert.equal(row.enabled, true);
      assert.equal(row.settings.baseUrl, 'http://192.168.5.20:6789/v1');
      return { sha: sha(row), models: row.settings.models };
    });
    const artifacts = Object.fromEntries(['live-research-contract','live-research-messages','live-research-call',
      'live-research-runner','live-research-wakeup-recovery'].map(name =>
      [name, sha(readFileSync('./dist/src/model-arena/live/' + name + '.js', 'utf8'))]));
    return { provider, artifacts, queuePaused: await queue.isPaused(), owner: (await redis.client.get(redisKey('lock', 'arena-maintenance-owner'))) === token,
      counts: await queue.getJobCounts('active', 'wait', 'paused') };
  } finally { await queue.close(); await redis.onModuleDestroy(); await db.$disconnect(); }
}
function runtimeRead() {
  const code = `import assert from 'node:assert/strict';\n${inspect.toString()}\nconsole.log(JSON.stringify(await inspect(process.argv[2])));`;
  return JSON.parse(runtime.runtime.dockerSync(['exec','-i','-w','/app/apps/server','thesis-ledger-dev-thesis-ledger-1',
    'node','--input-type=module','-',owner.token], { input: code, timeout: 30000 }).trim());
}
async function request(path, body) {
  const response = await fetch('http://127.0.0.1:3000/api/v1/arena-matches' + path,
    { method: body === undefined ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(30000),
      headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  assert(response.ok, `比赛接口失败 ${response.status}`);
  return response.json();
}
let created, report = { sourceId, startedAt: new Date().toISOString(), automaticRetries: 0 };
try {
  const before = runtimeRead();
  assert(before.queuePaused && before.owner, '维护队列归属不匹配');
  assert(Object.values(before.counts).every(n => n === 0), '队列存在其他待执行任务');
  const original = await request('/' + sourceId);
  assert.equal(original.state, 'paused');
  assert.equal(original.protocol.startsOn, '2026-11-02');
  assert(original.protocol.entrants.every(e => e.providerId === 'lmstudio' && before.provider.models.includes(e.model)));
  const preserved = preservedMatch(original);
  const protocol = { ...original.protocol, title: original.protocol.title + ' · 历史回放 · 1116' };
  const catalog = await request('/catalog?kind=live&pageSize=25&search=' + encodeURIComponent(protocol.title));
  assert(!catalog.items.some(c => c.title === protocol.title), '同名比赛已存在；禁止重复创建');
  save('intent.json', { ...report, protocol, original: preserved, runtime: before }, true);
  created = await request('', protocol);
  report.matchId = created.id;
  save('created.json', created, true);
  assert.notEqual(created.id, sourceId);
  const draft = await request('/' + created.id);
  assert.equal(fingerprint(draft.protocol), fingerprint(protocol));
  await request('/' + created.id + '/start', {});
  const started = await request('/' + created.id);
  assert.equal(started.timeline?.phase, 'replay');
  assert.equal(new Intl.DateTimeFormat('en-CA', { timeZone: protocol.timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(started.timeline.originAt)), '2026-11-02');
  execFileSync(process.execPath, [resolve(root, 'scripts/local-runtime/arena-maintenance-queue.mjs'), 'resume', ownerPath],
    { encoding: 'utf8', timeout: 45000, stdio: ['ignore', 'pipe', 'pipe'] });
  report.queueRestored = true;
  let lastCheck = 0, lastLog = '', liveSeen = null;
  while (true) {
    assert(ownsUpdateLock(process.env.INFRA_UPDATE_LOCK_PATH ?? ''), '维护锁已丢失');
    const detail = await request('/' + created.id), progress = replayProgress(detail);
    report.progress = progress;
    save('progress.json', { ...report, observedAt: new Date().toISOString() });
    if (progress.stopReason || progress.state !== 'running') {
      if (progress.state === 'running') await request('/' + created.id + '/pause', {});
      report.status = 'stopped'; report.reason = progress.stopReason ?? progress.state;
      break;
    }
    if (Date.now() - lastCheck > 60000) {
      const current = runtimeRead();
      assert.equal(current.provider.sha, before.provider.sha, '模型配置发生变化');
      assert.deepEqual(current.artifacts, before.artifacts, '运行补丁发生变化');
      assert.equal(current.queuePaused, false, '队列被其他维护暂停');
      assert.deepEqual(preservedMatch(await request('/' + sourceId)), preserved, '原比赛记录变化');
      lastCheck = Date.now();
    }
    const line = JSON.stringify({ ...progress, agents: progress.agents.map(a => ({ ...a, positions: a.positions.length })) });
    if (line !== lastLog) { console.log(line); lastLog = line; }
    if (progress.timeline?.phase === 'live') {
      liveSeen ??= { at: Date.now(), agentIds: detail.agents.map(a => a.id), revisions: detail.agents.map(a => a.account.revision) };
      if (Date.now() - liveSeen.at >= 35000) {
        assert.deepEqual(detail.agents.map(a => a.id), liveSeen.agentIds, '实时阶段重建了账户');
        assert(detail.agents.every((a, i) => a.account.revision >= liveSeen.revisions[i]));
        report.status = 'live'; report.liveObservedSeconds = (Date.now() - liveSeen.at) / 1000;
        break;
      }
    }
    await new Promise(done => setTimeout(done, 2000));
  }
  assert.deepEqual(preservedMatch(await request('/' + sourceId)), preserved, '原比赛记录变化');
  report.originalRecordsPreserved = true;
  report.providerUnchanged = runtimeRead().provider.sha === before.provider.sha;
} catch (error) {
  report.status = 'blocked'; report.reason = error.message.slice(0, 500);
  // 任何不确定观察都暂停新比赛，不触发 retry 或额外生成。
  if (created) {
    try { const current = await request('/' + created.id); if (current.state === 'running') await request('/' + created.id + '/pause', {}); }
    catch { report.pauseUnconfirmed = true; }
  }
} finally {
  report.completedAt = new Date().toISOString();
  save('receipt.json', report, true);
  console.log(JSON.stringify(report));
  if (report.status !== 'live') process.exitCode = 1;
}
