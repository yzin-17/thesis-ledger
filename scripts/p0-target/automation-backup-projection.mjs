import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const source = globalThis.__P0_AUTOMATION_COPY;
const fields = globalThis.__P0_AUTOMATION_COLUMNS;
const match = /COPY public\."AutomationJob" \(([^)]+)\) FROM stdin;\n([\s\S]*?)\n\\\./.exec(source);
assert(match, '备份中缺少 AutomationJob COPY');
const columns = match[1].split(',').map((value) => value.trim().replace(/^"|"$/g, ''));
assert.deepEqual([...columns].sort(), [...fields].sort(), '备份任务列与升级前列不一致');
const unescape = (value) => {
  const escapes = { b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v', '\\': '\\' };
  return value.replace(/\\([0-7]{1,3}|[bfnrtv\\])/g, (_, token) =>
    Object.hasOwn(escapes, token) ? escapes[token] : String.fromCharCode(parseInt(token, 8)));
};
const prisma = new PrismaClient();
try {
  const identity = await prisma.$queryRaw`SELECT current_database() AS database`;
  assert.equal(identity[0].database, 'thesis_ledger');
  const types = await prisma.$queryRaw`SELECT column_name, data_type FROM information_schema.columns
    WHERE table_schema='public' AND table_name='AutomationJob'`;
  const byName = Object.fromEntries(types.map((row) => [row.column_name, row.data_type]));
  const original = match[2].split('\n').filter(Boolean).map((line) => {
    const cells = line.split('\t'); assert.equal(cells.length, columns.length);
    return Object.fromEntries(columns.map((name, index) => {
      const cell = cells[index];
      if (cell === '\\N') return [name, null];
      const text = unescape(cell), type = byName[name];
      if (type === 'boolean') return [name, text === 't'];
      if (['integer', 'smallint', 'bigint'].includes(type)) return [name, Number(text)];
      if (['json', 'jsonb'].includes(type)) return [name, JSON.parse(text)];
      if (type.startsWith('timestamp')) return [name, text.replace(' ', 'T')];
      return [name, text];
    }));
  });
  const current = await prisma.$queryRawUnsafe('SELECT to_jsonb(t) AS value FROM "AutomationJob" t');
  assert.equal(current.length, original.length, '系统任务数量变化');
  const now = new Map(current.map((row) => [row.value.id, row.value]));
  const differences = [];
  for (const row of original) {
    const actual = now.get(row.id); assert(actual, '升级前任务缺失');
    const changed = fields.filter((field) => JSON.stringify(row[field]) !== JSON.stringify(actual[field]));
    assert(changed.every((field) => field === 'nextRunAt'), '自动任务业务配置发生变化');
    if (changed.length) {
      assert(Number.isFinite(Date.parse(actual.nextRunAt)));
      assert(row.nextRunAt === null || Date.parse(actual.nextRunAt) >= Date.parse(row.nextRunAt), '任务调度游标倒退');
      differences.push({ type: row.type, fields: changed });
    }
  }
  const projectedColumns = fields.filter((name) => name !== 'nextRunAt');
  const projected = original.map((row) => Object.fromEntries(projectedColumns.map((name) => [name, row[name]])));
  const canonical = await prisma.$queryRawUnsafe('SELECT value::text AS data FROM jsonb_array_elements($1::jsonb)', JSON.stringify(projected));
  const hashes = canonical.map((row) => createHash('sha256').update(row.data).digest('hex')).sort();
  console.log('P0_AUTOMATION_PROJECTION ' + JSON.stringify({ columns: projectedColumns,
    table: { count: hashes.length, hashes }, audit: { baseline: 'formal-pre-upgrade-backup',
      rows: original.length, allowedOperationalFields: ['nextRunAt'], differences } }));
} finally { await prisma.$disconnect(); }
