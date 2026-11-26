import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { appendFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { buildDatabaseStructureCheckSql, discoverDatabaseStructure } from '../../apps/server/src/platform/database-structure.ts';

const prismaRoot = fileURLToPath(new URL('../../apps/server/prisma/', import.meta.url));
const identitySql = `SELECT json_build_object('database',current_database(),'user',current_user,
  'owner',pg_get_userbyid(datdba),'consumers',(SELECT count(*) FROM pg_stat_activity
    WHERE datname=current_database() AND pid<>pg_backend_pid())) FROM pg_database WHERE datname=current_database()`;

function command(name, args) {
  const result = spawnSync(name, args, { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024, timeout: 300000 });
  if (result.error || result.status !== 0) throw new Error(`${name} 执行失败；未确认恢复成功，请检查备份和目标状态后重试`);
  return result.stdout;
}

export async function verifyBackup(file) {
  const checksum = (await readFile(`${file}.sha256`, 'utf8')).trim();
  const match = /^([a-fA-F0-9]{64})\s+.+$/u.exec(checksum);
  if (!match) throw new Error('校验文件必须包含一个 SHA-256 记录');
  const hash = createHash('sha256');
  for await (const block of createReadStream(file)) hash.update(block);
  if (hash.digest('hex') !== match[1].toLowerCase()) throw new Error('备份 SHA-256 不匹配，停止恢复');
}

export async function restoreDatabase(args, { env = process.env, run = command, discover = discoverDatabaseStructure, temporaryRoot = tmpdir() } = {}) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    apply: { type: 'boolean' }, 'confirm-database': { type: 'string' }, 'confirm-owner': { type: 'string' },
  } });
  if (positionals.length !== 1) throw new Error('用法：restore-db.sh <backup.dump> [--apply --confirm-database <数据库名> --confirm-owner <owner>]');
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL 未配置');
  const connection = new URL(env.DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(connection.protocol)) throw new Error('DATABASE_URL 必须为 PostgreSQL 连接');
  if (connection.searchParams.has('schema') && connection.searchParams.get('schema') !== 'public') throw new Error('恢复目标仅支持 public schema');
  connection.searchParams.delete('schema');
  const database = decodeURIComponent(connection.pathname.slice(1));
  if (!database) throw new Error('DATABASE_URL 必须明确指定数据库');
  const file = resolve(positionals[0]);
  await verifyBackup(file);
  const archiveList = run('pg_restore', ['--list', file]);
  const structure = await discover(prismaRoot);
  const archivedTables = new Set(archiveList.split('\n').flatMap((line) => {
    const entry = /^\d+;\s+\d+\s+\d+\s+TABLE\s+public\s+(\S+)\s+/u.exec(line);
    return entry ? [entry[1].replace(/^"|"$/gu, '')] : [];
  }));
  const missing = structure.expectedTables.filter((table) => !archivedTables.has(table));
  if (missing.length) throw new Error(`备份缺少当前结构表：${missing.join('、')}`);
  const dbArgs = ['--no-psqlrc', '--set=ON_ERROR_STOP=1', '--dbname', connection.href];
  const identity = JSON.parse(run('psql', [...dbArgs, '--tuples-only', '--no-align', '--command', identitySql]).trim());
  if (identity.database !== database || identity.user !== identity.owner) throw new Error('实际数据库或 owner 不匹配，停止恢复');
  const report = { mode: values.apply ? '恢复' : '预检', database, owner: identity.owner,
    expectedHead: structure.currentHead, expectedTables: structure.expectedTables.length, checksum: '通过' };
  if (!values.apply) return { ...report, writes: false, activeConsumers: Number(identity.consumers) };
  if (values['confirm-database'] !== database || values['confirm-owner'] !== identity.owner) throw new Error('必须精确确认实际数据库名与 owner');
  if (Number(identity.consumers) !== 0) throw new Error('目标仍有其他连接，先停止全部消费者');
  const directory = await mkdtemp(join(temporaryRoot, 'thesis-db-restore-'));
  try {
    const sqlFile = join(directory, 'restore.sql');
    run('pg_restore', ['--clean', '--if-exists', '--no-owner', '--schema=public', '--file', sqlFile, file]);
    const check = buildDatabaseStructureCheckSql(structure, { databaseName: database, ownerName: identity.owner });
    await appendFile(sqlFile, `\nSET search_path TO public;\n${check}`);
    const guard = join(directory, 'guard.sql');
    await appendFile(guard, `SET lock_timeout='5s';\nDO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()) THEN RAISE EXCEPTION 'database consumers must be stopped'; END IF; END $$;\n`);
    run('psql', [...dbArgs, '--single-transaction', '--file', guard, '--file', sqlFile]);
    return { ...report, writes: true, structure: '通过', transaction: '已提交' };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify(await restoreDatabase(process.argv.slice(2)))); }
  catch (error) { console.error(error.code === 'ENOENT' ? '缺少备份或校验文件，或 PostgreSQL 客户端未安装' : error.message); process.exitCode = 1; }
}
