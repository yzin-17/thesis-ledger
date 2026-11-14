import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DsaRuntimeRecovery } from '../../../thesis-ledger-infra/scripts/dsa-runtime-recovery.mjs';
import { ownsUpdateLock } from '../../../thesis-ledger-infra/scripts/runtime/lock.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

async function inside(mode, token) {
  const { Queue } = await import('bullmq');
  const { RedisService, redisKey } = await import('./dist/src/platform/redis.service.js');
  const redis = new RedisService();
  await redis.ping();
  const queue = new Queue('live', { connection: redis.client, prefix: redisKey('queue', 'arena') });
  const ownerKey = redisKey('lock', 'arena-maintenance-owner');
  try {
    if (mode === 'pause') {
      const owner = await redis.client.get(ownerKey), paused = await queue.isPaused();
      assert(!paused || owner === token, '队列已经由其他操作暂停');
      if (owner !== token) assert.equal(await redis.client.set(ownerKey, token, 'NX'), 'OK', '维护归属已变化');
      await queue.pause();
      assert(await queue.isPaused(), '队列暂停未确认');
    } else {
      assert.equal(await redis.client.get(ownerKey), token, '维护归属不匹配，不能恢复队列');
      await queue.resume();
      assert.equal(await queue.isPaused(), false, '队列恢复未确认');
      assert.equal(await redis.client.eval('if redis.call("get",KEYS[1])==ARGV[1] then return redis.call("del",KEYS[1]) else return 0 end',
        1, ownerKey, token), 1);
    }
    return { status: mode === 'pause' ? 'new_deliveries_paused' : 'deliveries_resumed',
      counts: await queue.getJobCounts('active', 'wait', 'paused'), activeCallsCancelled: 0 };
  } finally { await queue.close(); await redis.onModuleDestroy(); }
}

export function queueArguments(args) {
  const [mode, file] = args;
  assert(args.length === 2 && ['pause', 'resume'].includes(mode), '用法：pause|resume <私有归属回执路径>');
  const path = resolve(file ?? '');
  assert(path.startsWith(resolve(root, '.recovery-artifacts') + '/'), '队列归属回执必须位于私有恢复目录');
  return { mode, path };
}

async function main(options) {
  assert(ownsUpdateLock(process.env.INFRA_UPDATE_LOCK_PATH ?? ''), '必须通过 infra 正式持锁入口调用');
  const infra = resolve(root, '../thesis-ledger-infra');
  const runtime = new DsaRuntimeRecovery(infra, resolve(infra, '.env'));
  let intent;
  if (existsSync(options.path)) intent = JSON.parse(readFileSync(options.path));
  else {
    assert.equal(options.mode, 'pause', '缺少原始维护归属');
    intent = { version: 'arena-maintenance-owner-v1', token: randomUUID(), createdAt: new Date().toISOString(),
      queue: 'live', priorPaused: false };
    mkdirSync(dirname(options.path), { recursive: true, mode: 0o700 });
    writeFileSync(options.path, JSON.stringify(intent), { mode: 0o600, flag: 'wx' });
  }
  assert.equal(intent.version, 'arena-maintenance-owner-v1');
  assert.equal(intent.priorPaused, false);
  const source = `import assert from 'node:assert/strict';\n${inside.toString()}\nconsole.log(JSON.stringify(await inside(process.argv[3],process.argv[4])));`;
  const output = runtime.runtime.dockerSync(['exec', '-i', '-w', '/app/apps/server', 'thesis-ledger-dev-thesis-ledger-1',
    'node', '--input-type=module', '-', '--inside', options.mode, intent.token], { input: source, timeout: 30000 });
  const result = JSON.parse(output.trim());
  writeFileSync(options.path + '.' + options.mode + '.json', JSON.stringify({ ...result, at: new Date().toISOString() }),
    { mode: 0o600, flag: 'wx' });
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify(await main(queueArguments(process.argv.slice(2))))); }
  catch { console.error('研究队列维护未完成；保留归属回执，不取消在途调用。'); process.exitCode = 1; }
}
