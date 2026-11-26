import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DsaRuntimeRecovery } from '../../../thesis-ledger-infra/scripts/dsa-runtime-recovery.mjs';
import { ownsUpdateLock } from '../../../thesis-ledger-infra/scripts/runtime/lock.mjs';

export function removableArenaDelivery(job, rows, matchIds) {
  const row = rows.find(row => row.id === job.data?.id);
  return !!row && matchIds.includes(row.matchId) && ['succeeded', 'failed', 'unknown_usage', 'cancelled'].includes(row.state);
}

async function inside(packet, token, removable) {
  const { PrismaClient } = await import('@prisma/client');
  const { Queue } = await import('bullmq');
  const { RedisService, redisKey } = await import('./dist/src/platform/redis.service.js');
  const db = new PrismaClient(), redis = new RedisService();
  const queue = new Queue('live', { connection: redis.client, prefix: redisKey('queue', 'arena') });
  try {
    assert(await queue.isPaused());
    assert.equal(await redis.client.get(redisKey('lock', 'arena-maintenance-owner')), token);
    assert.equal(await queue.getActiveCount(), 0);
    const matches = await db.$queryRawUnsafe('SELECT id,state FROM "ArenaLiveMatch" WHERE id=ANY($1::uuid[])', packet.matchIds);
    assert.equal(matches.length, packet.matchIds.length); assert(matches.every(m => m.state === 'paused'));
    const rows = await db.$queryRawUnsafe('SELECT id,"matchId",state FROM "ArenaLiveCycle" WHERE "matchId"=ANY($1::uuid[])', packet.matchIds);
    assert(rows.every(row => !['pending','running'].includes(row.state)));
    const jobs = await queue.getJobs(['wait', 'paused', 'delayed', 'prioritized'], 0, -1, true);
    assert(jobs.length <= 1000);
    const kept = jobs.filter(job => !removable(job, rows, packet.matchIds));
    const before = kept.map(job => ({ id: job.id, data: job.data, state: null }));
    for (const item of before) item.state = await (await queue.getJob(item.id)).getState();
    const removed = [];
    for (const job of jobs) if (removable(job, rows, packet.matchIds)) { await job.remove(); removed.push(job.id); }
    for (const item of before) {
      const job = await queue.getJob(item.id); assert(job);
      assert.deepEqual(job.data, item.data); assert.equal(await job.getState(), item.state);
    }
    assert(await queue.isPaused());
    assert.equal(await redis.client.get(redisKey('lock', 'arena-maintenance-owner')), token);
    return { status: 'passed', removed, kept: before, counts: await queue.getJobCounts('active','wait','paused'), originalOwnerPreserved: true };
  } finally { await queue.close(); await db.$disconnect(); await redis.onModuleDestroy(); }
}

async function main() {
  assert(ownsUpdateLock(process.env.INFRA_UPDATE_LOCK_PATH ?? ''), '必须持有正式维护锁');
  const [inputFile, outputFile] = process.argv.slice(2), packet = JSON.parse(readFileSync(resolve(inputFile)));
  assert(packet.matchIds.length > 0 && packet.matchIds.every(id => /^[0-9a-f-]{36}$/iu.test(id)));
  assert.equal(new Set(packet.matchIds).size, packet.matchIds.length);
  assert(resolve(outputFile).startsWith(resolve('.recovery-artifacts') + '/'));
  const token = JSON.parse(readFileSync(resolve(packet.queueOwnerReceipt))).token;
  const runtime = new DsaRuntimeRecovery(resolve('../thesis-ledger-infra'), resolve('../thesis-ledger-infra/.env')).runtime;
  const code = "import assert from 'node:assert/strict';\n" + removableArenaDelivery.toString() + '\n' + inside.toString()
    + '\nconsole.log(JSON.stringify(await inside(' + JSON.stringify(packet) + ',' + JSON.stringify(token) + ',removableArenaDelivery)));';
  const raw = runtime.dockerSync(['exec','-i','-w','/app/apps/server','thesis-ledger-dev-thesis-ledger-1','node','--input-type=module','-'], {input:code,timeout:30000});
  writeFileSync(resolve(outputFile), raw, { mode: 0o600, flag: 'wx' });
  const result = JSON.parse(raw.trim()); console.log(JSON.stringify({status:result.status,removed:result.removed.length,kept:result.kept.length,counts:result.counts}));
}
if (process.argv[1]?.endsWith('/run-arena-luna-finalize.mjs')) await main();
