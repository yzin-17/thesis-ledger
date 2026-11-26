import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { restoreDatabase } from './restore-db.mjs';

const env = { DATABASE_URL: 'postgresql://fixture:fixture@localhost/restore_fixture?schema=public' };
const structure = { currentHead: '20261114010000_current', expectedTables: ['SchemaVersion', 'ModelTable', 'RawOwnedTable'] };
async function fixture(context, identity = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'restore-contract-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, 'backup.dump');
  await writeFile(file, 'controlled archive');
  await writeFile(`${file}.sha256`, `${createHash('sha256').update('controlled archive').digest('hex')}  old/location/backup.dump\n`);
  const calls = [];
  const run = (name, args) => {
    calls.push({ name, args });
    if (name === 'pg_restore' && args.includes('--list')) return structure.expectedTables.map((name, index) => `${index + 1}; 1259 123 TABLE public ${name} fixture`).join('\n');
    if (name === 'pg_restore' && args.includes('--file')) writeFileSync(args[args.indexOf('--file') + 1], '-- controlled SQL\n');
    if (args.includes('--command')) return JSON.stringify({ database: 'restore_fixture', user: 'fixture', owner: 'fixture', consumers: 0, ...identity });
    return '';
  };
  return { file, calls, options: { env, run, discover: async () => structure } };
}
const apply = (file) => [file, '--apply', '--confirm-database', 'restore_fixture', '--confirm-owner', 'fixture'];

test('默认只预检，跨调用目录校验摘要且不输出连接凭据', async (context) => {
  const f = await fixture(context);
  const report = await restoreDatabase([f.file], f.options);
  assert.equal(report.writes, false);
  assert.equal(report.expectedHead, structure.currentHead);
  assert.equal(report.expectedTables, 3);
  assert.equal(f.calls.length, 2);
  assert(!JSON.stringify(report).includes('postgresql:'));
  assert(!f.calls.some((call) => call.args.includes('--single-transaction')));
});
test('缺失和错误摘要在任何数据库命令前拒绝', async (context) => {
  const f = await fixture(context);
  await writeFile(`${f.file}.sha256`, '0'.repeat(64) + '  backup.dump');
  await assert.rejects(restoreDatabase(apply(f.file), f.options), /SHA-256 不匹配/);
  await rm(`${f.file}.sha256`);
  await assert.rejects(restoreDatabase(apply(f.file), f.options), { code: 'ENOENT' });
  assert.equal(f.calls.length, 0);
});
test('备份缺少 raw-owned 表时不依赖目标残留表，写入前拒绝', async (context) => {
  const f = await fixture(context);
  f.options.run = () => '1; 1259 123 TABLE public SchemaVersion fixture\n2; 1259 124 TABLE public ModelTable fixture';
  await assert.rejects(restoreDatabase(apply(f.file), f.options), /备份缺少当前结构表：RawOwnedTable/);
});
test('拒绝未确认目标、错误数据库和错误 owner', async (context) => {
  const f = await fixture(context);
  await assert.rejects(restoreDatabase([f.file, '--apply'], f.options), /精确确认/);
  await assert.rejects(restoreDatabase([f.file, '--apply', '--confirm-database', 'other', '--confirm-owner', 'fixture'], f.options), /精确确认/);
  const wrongDatabase = await fixture(context, { database: 'other' });
  await assert.rejects(restoreDatabase(apply(wrongDatabase.file), wrongDatabase.options), /实际数据库或 owner 不匹配/);
  const wrongOwner = await fixture(context, { owner: 'other' });
  await assert.rejects(restoreDatabase(apply(wrongOwner.file), wrongOwner.options), /实际数据库或 owner 不匹配/);
  assert(!f.calls.some((call) => call.args.includes('--single-transaction')));
});
test('活动连接不会被停止，恢复被拒绝', async (context) => {
  const f = await fixture(context, { consumers: 1 });
  await assert.rejects(restoreDatabase(apply(f.file), f.options), /先停止全部消费者/);
  assert(!f.calls.some((call) => call.args.includes('--single-transaction')));
});
test('恢复与当前 Prisma/raw-owned 完整结构校验在同一事务，清理临时 SQL', async (context) => {
  const f = await fixture(context);
  let sqlFile;
  const run = f.options.run;
  f.options.run = (name, args) => {
    if (args.includes('--single-transaction')) {
      assert.equal(name, 'psql');
      assert(args.includes('--set=ON_ERROR_STOP=1'));
      sqlFile = args.at(-1);
      const sql = readFileSync(sqlFile, 'utf8');
      assert.match(sql, /controlled SQL[\s\S]*SET search_path TO public/);
      for (const table of structure.expectedTables) assert(sql.includes(table));
      assert(sql.includes(structure.currentHead));
      assert.match(sql, /database schema head mismatch/);
      const guard = readFileSync(args[args.indexOf('--file') + 1], 'utf8');
      assert.match(guard, /pg_stat_activity/);
    }
    return run(name, args);
  };
  const result = await restoreDatabase(apply(f.file), f.options);
  assert.equal(result.transaction, '已提交');
  assert(!existsSync(sqlFile));
});
test('数据库命令失败不返回成功，清理中间文件', async (context) => {
  const f = await fixture(context);
  const run = f.options.run;
  let sqlFile;
  f.options.run = (name, args) => {
    if (args.includes('--single-transaction')) { sqlFile = args.at(-1); throw new Error('受控 SQL 失败'); }
    return run(name, args);
  };
  await assert.rejects(restoreDatabase(apply(f.file), f.options), /受控 SQL 失败/);
  assert(!existsSync(sqlFile));
});
test('不接受其他 schema、未知参数和缺少数据库名', async (context) => {
  const f = await fixture(context);
  await assert.rejects(restoreDatabase([f.file, '--unknown'], f.options));
  await assert.rejects(restoreDatabase([f.file], { ...f.options, env: { DATABASE_URL: env.DATABASE_URL.replace('public', 'other') } }), /public schema/);
  await assert.rejects(restoreDatabase([f.file], { ...f.options, env: { DATABASE_URL: 'postgresql://fixture:fixture@localhost/' } }), /明确指定数据库/);
  assert.equal(f.calls.length, 0);
});
