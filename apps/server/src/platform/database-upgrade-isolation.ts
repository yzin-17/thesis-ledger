import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import type { DatabaseExecutionTarget } from './database-structure.js';

const run = promisify(execFile);

/** 使用源镜像 ID 创建独立无网络数据库；仅清理本次成功创建的容器 ID。 */
export async function createUpgradeIsolation(sourceContainer: string, target: DatabaseExecutionTarget) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(sourceContainer)) throw new Error('源数据库容器无效');
  const image = (await run('docker', ['inspect', '--format', '{{.Image}}', sourceContainer],
    { timeout: 30_000, maxBuffer: 4096 })).stdout.trim();
  if (!/^sha256:[a-f0-9]{64}$/.test(image)) throw new Error('源数据库镜像身份无效');
  const isolationToken = randomUUID();
  const name = `tl-upgrade-rehearsal-${isolationToken}`;
  const container = (await run('docker', ['run', '--rm', '-d', '--network', 'none', '--name', name,
    '--label', `thesis-ledger.upgrade-rehearsal=${isolationToken}`, '--memory', '1g', '--cpus', '2',
    '-e', `POSTGRES_USER=${target.ownerName}`, '-e', `POSTGRES_DB=${target.databaseName}`,
    '-e', `POSTGRES_PASSWORD=${randomUUID()}`, image], { timeout: 60_000, maxBuffer: 4096 })).stdout.trim();
  if (!/^[a-f0-9]{64}$/.test(container)) throw new Error('隔离容器返回身份无效');
  const dispose = async () => {
    const label = (await run('docker', ['inspect', '--format',
      '{{index .Config.Labels "thesis-ledger.upgrade-rehearsal"}}', container],
    { timeout: 30_000, maxBuffer: 4096 })).stdout.trim();
    if (label !== isolationToken) throw new Error('隔离容器身份改变，拒绝清理');
    await run('docker', ['stop', container], { timeout: 30_000, maxBuffer: 4096 });
  };
  try {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        await run('docker', ['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', target.ownerName, '-d', target.databaseName],
          { timeout: 2000, maxBuffer: 4096 });
        return { container, isolationToken, image, dispose };
      } catch {
        await delay(1000);
      }
    }
    throw new Error('隔离数据库未就绪');
  } catch (error) {
    await dispose();
    throw error;
  }
}

/** SQL 只通过 stdin 传递，失败不返回可能含业务信息的原始输出。 */
export async function runUpgradeIsolationSql(
  container: string, target: DatabaseExecutionTarget, sql: string, isolationToken: string,
  appRole?: { name: string; password: string },
) {
  if (!/^[a-f0-9]{64}$/.test(container)) throw new Error('必须使用隔离容器的完整 ID');
  if (!/^[a-f0-9-]{36}$/.test(isolationToken)) throw new Error('隔离批次无效');
  const state = (await run('docker', ['inspect', '--format',
    '{{index .Config.Labels "thesis-ledger.upgrade-rehearsal"}}|{{.HostConfig.NetworkMode}}', container],
  { timeout: 30_000, maxBuffer: 4096 })).stdout.trim();
  if (state !== `${isolationToken}|none`) throw new Error('SQL 目标不是本次隔离数据库');
  const environmentArgs = appRole ? ['-e', 'POSTGRES_OWNER_USER', '-e', 'POSTGRES_APP_USER', '-e', 'POSTGRES_APP_PASSWORD'] : [];
  const env = appRole ? { ...process.env, POSTGRES_OWNER_USER: target.ownerName,
    POSTGRES_APP_USER: appRole.name, POSTGRES_APP_PASSWORD: appRole.password } : process.env;
  const child = spawn('docker', ['exec', '-i', ...environmentArgs, container, 'psql', '-U', target.ownerName, '-d', target.databaseName,
    '-Atq', '-v', 'ON_ERROR_STOP=1'], { stdio: ['pipe', 'pipe', 'ignore'], env });
  let output = '';
  let overflow = false;
  child.stdout.on('data', (chunk: Buffer) => {
    if (output.length + chunk.length > 65536) { overflow = true; child.kill('SIGKILL'); }
    else output += chunk.toString('utf8');
  });
  const completion = new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.stdin.once('error', reject);
    child.once('close', (code) => code === 0 && !overflow ? resolve() : reject(new Error('隔离 SQL 执行失败')));
  });
  const timeout = setTimeout(() => child.kill('SIGKILL'), 15 * 60 * 1000);
  try {
    child.stdin.end(sql);
    await completion;
    return output.trim();
  } finally {
    clearTimeout(timeout);
    if (child.exitCode === null) child.kill('SIGKILL');
  }
}
