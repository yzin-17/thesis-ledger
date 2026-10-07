import { createHash } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { Transform, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import type { backupDatabaseForUpgrade } from './database-upgrade-backup.js';

const run = promisify(execFile);
type Backup = Awaited<ReturnType<typeof backupDatabaseForUpgrade>>;

/** 仅恢复到带本次隔离标签、无网络且无用户表的容器；绝不使用 --clean。 */
export async function restoreDatabaseUpgradeBackup(backup: Backup, container: string, isolationToken: string) {
  if (container === backup.sourceContainer || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(container) ||
      !/^[a-f0-9-]{36}$/.test(isolationToken) || !/^[a-f0-9]{64}$/.test(backup.backupSha256) ||
      !Number.isSafeInteger(backup.backupBytes) || backup.backupBytes <= 0)
    throw new Error('恢复目标或备份记录无效');
  const inspected = await run('docker', ['inspect', '--format',
    '{{index .Config.Labels "thesis-ledger.upgrade-rehearsal"}}|{{.HostConfig.NetworkMode}}|{{.State.Running}}', container],
  { timeout: 30_000, maxBuffer: 4096 });
  if (inspected.stdout.trim() !== `${isolationToken}|none|true`) throw new Error('恢复目标未通过隔离身份检查');
  const target = backup.target;
  const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
  const guard = await run('docker', ['exec', container, 'psql', '-U', target.ownerName, '-d', target.databaseName,
    '-Atq', '-v', 'ON_ERROR_STOP=1', '-c', `SELECT current_database() = ${literal(target.databaseName)}
      AND current_user = ${literal(target.ownerName)} AND NOT EXISTS
      (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema');`],
  { timeout: 30_000, maxBuffer: 4096 });
  if (guard.stdout.trim() !== 't') throw new Error('恢复目标不为空或数据库身份不匹配');
  const verify = async () => {
    const hash = createHash('sha256');
    let bytes = 0;
    await pipeline(createReadStream(backup.outputPath), new Writable({ write(chunk: Buffer, _encoding, done) {
      bytes += chunk.length; hash.update(chunk); done();
    } }));
    if (bytes !== backup.backupBytes || hash.digest('hex') !== backup.backupSha256)
      throw new Error('恢复前备份摘要或大小不匹配');
  };
  await verify();
  const child = spawn('docker', ['exec', '-i', container, 'pg_restore', '-U', target.ownerName, '-d', target.databaseName,
    '--single-transaction', '--exit-on-error', '--no-owner', '--no-acl'], { stdio: ['pipe', 'ignore', 'ignore'] });
  const completion = new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => code === 0 ? resolve() : reject(new Error(`数据库恢复进程失败：${code}`)));
  });
  const hash = createHash('sha256');
  let bytes = 0;
  const checksum = new Transform({ transform(chunk: Buffer, _encoding, done) {
    bytes += chunk.length; hash.update(chunk); done(null, chunk);
  } });
  const timeout = setTimeout(() => child.kill('SIGKILL'), 15 * 60 * 1000);
  try {
    await Promise.all([pipeline(createReadStream(backup.outputPath), checksum, child.stdin), completion]);
    if (bytes !== backup.backupBytes || hash.digest('hex') !== backup.backupSha256)
      throw new Error('恢复期间备份发生变化，隔离副本不得用于升级');
    return { restoreCompletedAt: new Date().toISOString(), backupSha256: backup.backupSha256 };
  } finally {
    clearTimeout(timeout);
    if (child.exitCode === null) child.kill('SIGKILL');
  }
}
