import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsRoot = resolve(root, 'apps/server/prisma/migrations');
const expectedMigrationCount = 1;
const entries = (await readdir(migrationsRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
if (entries.length !== expectedMigrationCount)
  throw new Error(
    `迁移数量发生变化，请审核并更新矩阵基线: expected=${expectedMigrationCount}, actual=${entries.length}`,
  );
for (let index = 0; index < entries.length; index += 1) {
  const name = entries[index];
  if (!/^\d{14}_[a-z0-9_-]+$/u.test(name)) throw new Error(`迁移目录命名无效: ${name}`);
  if (index > 0 && name.slice(0, 14) <= entries[index - 1].slice(0, 14))
    throw new Error(`迁移时间戳未递增: ${entries[index - 1]} -> ${name}`);
  const sql = await readFile(resolve(migrationsRoot, name, 'migration.sql'), 'utf8');
  if (!sql.trim()) throw new Error(`迁移 SQL 为空: ${name}`);
}
console.log(`Migration matrix passed (${entries.length} migrations)`);
