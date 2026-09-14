import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const prismaRoot = resolve(root, 'apps/server/prisma');
const migrationsRoot = resolve(prismaRoot, 'migrations');
const schemaPath = resolve(prismaRoot, 'schema.prisma');
const rawOwnedPath = resolve(prismaRoot, 'raw-owned-tables.json');
const migrationName = /^\d{14}_[a-z0-9_-]+$/u;
const createTable = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"([^"]+)"/giu;

const entries = (await readdir(migrationsRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
if (entries.length === 0) throw new Error('迁移目录为空');

const createdTables = new Set();
for (let index = 0; index < entries.length; index += 1) {
  const name = entries[index];
  if (!migrationName.test(name)) throw new Error(`迁移目录命名无效: ${name}`);
  if (index > 0 && name.slice(0, 14) <= entries[index - 1].slice(0, 14))
    throw new Error(`迁移时间戳未递增: ${entries[index - 1]} -> ${name}`);
  const sql = await readFile(resolve(migrationsRoot, name, 'migration.sql'), 'utf8');
  if (!sql.trim()) throw new Error(`迁移 SQL 为空: ${name}`);
  for (const match of sql.matchAll(createTable)) {
    if (!match[1]) throw new Error(`迁移建表语句缺少表名: ${name}`);
    createdTables.add(match[1]);
  }
}

const schema = await readFile(schemaPath, 'utf8');
const prismaModels = new Set(
  [...schema.matchAll(/^model\s+([A-Za-z0-9_]+)\s*\{/gmu)].map((match) => match[1]),
);
const rawOwned = JSON.parse(await readFile(rawOwnedPath, 'utf8'));
if (!rawOwned || !Array.isArray(rawOwned.tables))
  throw new Error('raw-owned table manifest 格式无效');
const rawOwnedNames = new Set();
for (const entry of rawOwned.tables) {
  if (
    !entry ||
    typeof entry.name !== 'string' ||
    !entry.name ||
    typeof entry.owner !== 'string' ||
    !entry.owner ||
    typeof entry.reason !== 'string' ||
    !entry.reason
  )
    throw new Error('raw-owned table manifest 每项必须包含 name / owner / reason');
  if (rawOwnedNames.has(entry.name)) throw new Error(`raw-owned table 重复声明: ${entry.name}`);
  if (prismaModels.has(entry.name))
    throw new Error(`表 ${entry.name} 同时由 Prisma model 与 raw-owned manifest 声明`);
  rawOwnedNames.add(entry.name);
}

for (const table of createdTables) {
  if (!prismaModels.has(table) && !rawOwnedNames.has(table))
    throw new Error(`迁移表 ${table} 未被 Prisma schema 或 raw-owned manifest 覆盖`);
}
for (const table of [...prismaModels, ...rawOwnedNames]) {
  if (!createdTables.has(table)) throw new Error(`结构声明表 ${table} 未在迁移链中创建: ${table}`);
}

if (process.env.VERIFY_RUNTIME_DATABASE_INPUT === 'true')
  await import('./check-runtime-database-input.mjs');

const currentHead = entries.at(-1);
console.log(
  `Migration matrix passed (${entries.length} migrations, ${createdTables.size} SQL tables, ${prismaModels.size} Prisma models, ${rawOwnedNames.size} raw-owned tables, head=${currentHead})`,
);
