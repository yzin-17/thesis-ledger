import { createHash } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { link, open, unlink } from 'node:fs/promises';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import type { DatabaseExecutionTarget } from './database-structure.js';

const run = promisify(execFile);
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;

/** 仅备份；调用方负责停止消费者并保管返回记录，失败的 partial 文件保留供诊断。 */
export async function backupDatabaseForUpgrade(
  container: string, target: DatabaseExecutionTarget, outputPath: string,
) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(container) || !outputPath.startsWith('/') ||
      !target.databaseName.trim() || !target.ownerName.trim()) throw new Error('数据库备份目标无效');
  const identitySql = `SELECT current_database() = ${literal(target.databaseName)} AND current_user = ${literal(target.ownerName)};`;
  const identity = await run('docker', ['exec', container, 'psql', '-U', target.ownerName, '-d', target.databaseName,
    '-Atq', '-v', 'ON_ERROR_STOP=1', '-c', identitySql], { timeout: 30_000, maxBuffer: 4096 });
  if (identity.stdout.trim() !== 't') throw new Error('数据库备份实际身份不匹配');
  const partial = `${outputPath}.partial`;
  const handle = await open(partial, 'wx', 0o600);
  const backupStartedAt = new Date().toISOString();
  const digest = createHash('sha256');
  let backupBytes = 0;
  const checksum = new Transform({ transform(chunk: Buffer, _encoding, callback) {
    backupBytes += chunk.length;
    digest.update(chunk);
    callback(null, chunk);
  } });
  const child = spawn('docker', ['exec', container, 'pg_dump', '-U', target.ownerName, '-d', target.databaseName,
    '--format=custom', '--no-owner', '--no-acl'], { stdio: ['ignore', 'pipe', 'ignore'] });
  const completion = new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => code === 0 ? resolve() : reject(new Error(`数据库备份进程失败：${code}`)));
  });
  const timeout = setTimeout(() => child.kill('SIGKILL'), 15 * 60 * 1000);
  try {
    // fd 由 FileHandle 统一持有；管道结束后同步落盘，再发布完整文件。
    const output = createWriteStream(partial, { fd: handle.fd, autoClose: false });
    await Promise.all([pipeline(child.stdout, checksum, output), completion]);
    if (backupBytes === 0) throw new Error('数据库备份为空');
    await handle.sync();
    await handle.close();
    await link(partial, outputPath);
    await unlink(partial);
    return { sourceContainer: container, target: { ...target }, outputPath, backupBytes, backupSha256: digest.digest('hex'),
      backupStartedAt, backupCompletedAt: new Date().toISOString() };
  } finally {
    clearTimeout(timeout);
    if (child.exitCode === null) child.kill('SIGKILL');
    await handle.close();
  }
}
