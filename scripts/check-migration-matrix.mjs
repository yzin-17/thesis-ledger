import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsRoot = resolve(root, 'apps/server/prisma/migrations');
const schemaPath = resolve(root, 'apps/server/prisma/schema.prisma');
const rawOwnedPath = resolve(root, 'apps/server/prisma/raw-owned-tables.json');
const expectedMigrationCount = 6;
const entries = (await readdir(migrationsRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
if (entries.length !== expectedMigrationCount)
  throw new Error(
    `迁移数量发生变化，请审核并更新矩阵基线: expected=${expectedMigrationCount}, actual=${entries.length}`,
  );

const createdTables = new Set();
for (let index = 0; index < entries.length; index += 1) {
  const name = entries[index];
  if (!/^\d{14}_[a-z0-9_-]+$/u.test(name)) throw new Error(`迁移目录命名无效: ${name}`);
  if (index > 0 && name.slice(0, 14) <= entries[index - 1].slice(0, 14))
    throw new Error(`迁移时间戳未递增: ${entries[index - 1]} -> ${name}`);
  const sql = await readFile(resolve(migrationsRoot, name, 'migration.sql'), 'utf8');
  if (!sql.trim()) throw new Error(`迁移 SQL 为空: ${name}`);
  for (const match of sql.matchAll(/CREATE\s+TABLE\s+"([^"]+)"/giu)) createdTables.add(match[1]);
}

const schema = await readFile(schemaPath, 'utf8');
const prismaModels = new Set([...schema.matchAll(/^model\s+([A-Za-z0-9_]+)\s*\{/gmu)].map((match) => match[1]));
const rawOwned = JSON.parse(await readFile(rawOwnedPath, 'utf8'));
if (!rawOwned || !Array.isArray(rawOwned.tables)) throw new Error('raw-owned table manifest 格式无效');
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
    throw new Error(`表 ${entry.name} 同时由 Prisma model 与 raw-owned manifest 声明，请只保留一个所有者`);
  rawOwnedNames.add(entry.name);
}

for (const table of createdTables) {
  if (!prismaModels.has(table) && !rawOwnedNames.has(table))
    throw new Error(`迁移表 ${table} 未被 Prisma schema 或 raw-owned manifest 覆盖`);
}
for (const table of rawOwnedNames) {
  if (!createdTables.has(table)) throw new Error(`raw-owned table ${table} 在迁移链中不存在`);
}

console.log(
  `Migration matrix passed (${entries.length} migrations, ${prismaModels.size} Prisma models, ${rawOwnedNames.size} raw-owned tables)`,
);
