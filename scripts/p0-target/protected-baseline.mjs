import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const previous = globalThis.__P0_BASELINE_COLUMNS;
const mutableOperational = new Set(['SchemaVersion', 'AuditLog', 'ProviderHealth', 'ProviderHealthCheck', 'IdentitySession']);
const digest = (value) => createHash('sha256').update(value).digest('hex');
const quote = (name) => {
  assert.match(name, /^[A-Za-z_][A-Za-z0-9_]*$/);
  return `"${name}"`;
};
try {
  const result = await prisma.$transaction(async (tx) => {
    const identity = await tx.$queryRaw`SELECT current_database() AS database, current_user AS owner`;
    assert.equal(identity[0].database, 'thesis_ledger');
    const definitions = await tx.$queryRaw`SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema='public' ORDER BY table_name, ordinal_position`;
    const columns = {};
    for (const row of definitions) {
      if (!mutableOperational.has(row.table_name)) (columns[row.table_name] ??= []).push(row.column_name);
    }
    const selected = previous ?? columns;
    const tables = {};
    for (const [table, fields] of Object.entries(selected)) {
      assert(columns[table], '原业务表缺失');
      assert(fields.every((field) => columns[table].includes(field)), '原业务列缺失');
      const rows = await tx.$queryRawUnsafe(`SELECT to_jsonb(t)::text AS data FROM
        (SELECT ${fields.map(quote).join(',')} FROM public.${quote(table)}) t`);
      const hashes = rows.map((row) => digest(row.data)).sort();
      tables[table] = { count: rows.length, hashes, sha256: digest(hashes.join('\n')) };
    }
    const aiActive = await tx.aiRun.count({ where: { status: { in: ['queued', 'running', 'pending'] } } });
    assert.equal(aiActive, 0, '存在活动模型任务，拒绝自动更新或验收');
    const workerActive = await tx.backtestJob.count({ where: { status: { in: ['queued', 'running'] } } });
    assert.equal(workerActive, 0, '存在活动回测任务，拒绝更新或验收');
    const schema = await tx.$queryRaw`SELECT version FROM "SchemaVersion" WHERE id=1`;
    return { database: identity[0].database, schemaHead: schema[0].version, columns: selected, tables, aiActive, workerActive };
  }, { isolationLevel: 'RepeatableRead', timeout: 60000 });
  const files = [];
  async function visit(path, relative = '') {
    const entries = await readdir(path, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const next = join(path, entry.name), name = join(relative, entry.name);
      assert(!entry.isSymbolicLink(), '快照目录不接受符号链接');
      if (entry.isDirectory()) await visit(next, name);
      else if (entry.isFile()) files.push([name, digest(await readFile(next))]);
    }
  }
  await visit('/app/var/backtest');
  console.log('P0_BASELINE ' + JSON.stringify({ ...result, snapshots: files,
    snapshotSha256: digest(JSON.stringify(files)), recordedAt: new Date().toISOString() }));
} finally {
  await prisma.$disconnect();
}
