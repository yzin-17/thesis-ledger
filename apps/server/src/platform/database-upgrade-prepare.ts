import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { discoverDatabaseStructure, type DatabaseStructureInput } from './database-structure.js';
import { planDatabaseUpgrade } from './database-upgrade-plan.js';
import { backupDatabaseForUpgrade } from './database-upgrade-backup.js';
import { runDatabaseUpgradeRehearsal } from './database-upgrade-run-rehearsal.js';
import { buildDatabaseUpgradeSql } from './database-upgrade-sql.js';

const run = promisify(execFile);
let stage = '配置校验';
const required = (key: string) => {
  const value = process.env[key];
  if (!value) throw new Error(`缺少 ${key}`);
  return value;
};

/** 仅由官方更新入口调用；只读取源库和生成备份/演练证据，不执行源库升级。 */
async function main() {
  const directory = required('DATABASE_UPGRADE_RUN_DIR');
  const container = required('DATABASE_UPGRADE_CONTAINER');
  if (!/^[a-f0-9]{64}$/.test(container)) throw new Error('必须提供 PostgreSQL 完整容器 ID');
  const target = { databaseName: required('DEV_DATABASE_EXPECTED_DATABASE'), ownerName: required('DEV_DATABASE_EXPECTED_OWNER') };
  const consumers: unknown = JSON.parse(required('DATABASE_UPGRADE_CONSUMERS'));
  if (!Array.isArray(consumers) || consumers.length !== 2 || new Set(consumers).size !== 2 ||
      consumers.some((id) => typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id)))
    throw new Error('必须提供 Server 与 Worker 容器身份');
  const assertStopped = async () => {
    for (const id of consumers) {
      const state = await run('docker', ['inspect', '--format', '{{.State.Running}}', id as string], { timeout: 30_000 });
      if (state.stdout.trim() !== 'false') throw new Error('数据库消费者仍在运行');
    }
  };
  stage = '消费者停止校验';
  await assertStopped();
  const consumersStoppedAt = new Date().toISOString();
  const query = async (sql: string) => (await run('docker', ['exec', container, 'psql', '-U', target.ownerName,
    '-d', target.databaseName, '-Atq', '-v', 'ON_ERROR_STOP=1', '-c', sql], { timeout: 30_000, maxBuffer: 4096 })).stdout.trim();
  stage = '源库结构读取';
  const fromHead = await query('SELECT version FROM "SchemaVersion" WHERE id=1;');
  const appRole = (await run('docker', ['exec', container, 'printenv', 'POSTGRES_APP_USER'],
    { timeout: 30_000, maxBuffer: 4096 })).stdout.trim();
  const source = await discoverDatabaseStructure();
  const imageInput = JSON.parse(await readFile(join(directory, 'image-input.json'), 'utf8')) as DatabaseStructureInput;
  const plan = planDatabaseUpgrade(source, fromHead, target);
  if (planDatabaseUpgrade(imageInput, fromHead, target).fingerprint !== plan.fingerprint)
    throw new Error('本地与待部署镜像的结构输入不一致');
  const permissionsSql = await readFile(required('DEV_DATABASE_PERMISSIONS_SQL'), 'utf8');
  stage = '源库备份';
  const backup = await backupDatabaseForUpgrade(container, target, join(directory, 'backup.dump'));
  stage = '隔离演练';
  const evidence = await runDatabaseUpgradeRehearsal({ source, fromHead, backup, consumersStoppedAt, permissionsSql, appRole });
  stage = '演练后源库与输入复核';
  await assertStopped();
  if (await query('SELECT version FROM "SchemaVersion" WHERE id=1;') !== fromHead)
    throw new Error('演练期间源库 head 改变');
  const currentSource = await discoverDatabaseStructure();
  if (planDatabaseUpgrade(currentSource, fromHead, target).fingerprint !== evidence.planFingerprint ||
      createHash('sha256').update(await readFile(required('DEV_DATABASE_PERMISSIONS_SQL'))).digest('hex') !== evidence.permissionsSha256)
    throw new Error('演练期间源码或权限脚本改变');
  const sql = buildDatabaseUpgradeSql(currentSource, fromHead, target, evidence, permissionsSql);
  await writeFile(join(directory, 'rehearsal.json'), JSON.stringify(evidence, null, 2), { flag: 'wx', mode: 0o600 });
  await writeFile(join(directory, 'upgrade.sql'), sql, { flag: 'wx', mode: 0o600 });
  process.stdout.write(`隔离演练通过：${plan.fromHead} -> ${plan.toHead}\n`);
}

main().catch((error: unknown) => {
  // 子进程异常可能包含环境参数；详细业务数据及凭据不得写入更新日志。
  const detail = error instanceof Error && /^隔离演练阶段失败：[\u4e00-\u9fa5]+$/.test(error.message)
    ? `（${error.message}）` : '';
  process.stderr.write(`保留数据升级准备失败：${stage}${detail}；备份与已有证据保留，消费者必须保持停止。\n`);
  process.exitCode = 1;
});
