import { createHash } from 'node:crypto';
import { normalizeMigrationSql, type DatabaseExecutionTarget, type DatabaseStructureInput } from './database-structure.js';

/** 只读计划不代表目标结构已核实，也不授予数据库执行权限。 */
export function planDatabaseUpgrade(
  input: DatabaseStructureInput, currentHead: string, target: DatabaseExecutionTarget,
) {
  if (!target.databaseName.trim() || !target.ownerName.trim() ||
      target.databaseName !== target.databaseName.trim() || target.ownerName !== target.ownerName.trim())
    throw new Error('数据库升级需要精确目标库和 owner');
  const names = input.migrations.map((migration) => migration.name);
  if (names.length === 0 || new Set(names).size !== names.length ||
      names.some((name, index) => !/^\d{14}_[a-z0-9_-]+$/.test(name) || (index > 0 && name <= names[index - 1]!)) ||
      names.at(-1) !== input.currentHead)
    throw new Error('数据库迁移链顺序或 head 无效');
  const index = names.indexOf(currentHead);
  if (index < 0) throw new Error('目标数据库 head 未知，拒绝推断升级起点');
  const migrations = input.migrations.map((migration) => {
    if (!migration.sql.trim()) throw new Error('迁移 SQL 为空');
    normalizeMigrationSql(migration);
    return { name: migration.name, sha256: createHash('sha256').update(migration.sql).digest('hex') };
  });
  const expectedTables = [...input.expectedTables].sort();
  if (expectedTables.length === 0 || new Set(expectedTables).size !== expectedTables.length ||
      expectedTables.some((name) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)))
    throw new Error('数据库预期表清单无效');
  const plan = {
    version: 'preserve-data-upgrade-plan-v1' as const,
    target: { databaseName: target.databaseName, ownerName: target.ownerName },
    fromHead: currentHead, toHead: input.currentHead,
    migrationChain: migrations, pendingMigrations: migrations.slice(index + 1), expectedTables,
  };
  return { ...plan, fingerprint: createHash('sha256').update(JSON.stringify(plan)).digest('hex') };
}
