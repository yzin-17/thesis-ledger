import { createHash } from 'node:crypto';
import { normalizeMigrationSql, type DatabaseExecutionTarget, type DatabaseStructureInput } from './database-structure.js';
import { planDatabaseUpgrade } from './database-upgrade-plan.js';
import { buildUpgradePermissionsCheck } from './database-upgrade-permissions.js';

const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;

/** 仅生成事务 SQL；备份恢复演练和消费者停止由外部执行入口负责。 */
export function buildDatabaseUpgradeSql(
  input: DatabaseStructureInput,
  fromHead: string,
  target: DatabaseExecutionTarget,
  confirmation: { planFingerprint: string; permissionsSha256: string; appRole?: string },
  permissionsSql: string,
) {
  const plan = planDatabaseUpgrade(input, fromHead, target);
  if (plan.fingerprint !== confirmation.planFingerprint)
    throw new Error('升级计划已变化，必须重新演练');
  if (!permissionsSql.trim() || createHash('sha256').update(permissionsSql).digest('hex') !== confirmation.permissionsSha256)
    throw new Error('升级权限脚本缺失或已变化');
  const permissions = normalizeMigrationSql({ name: 'upgrade_permissions', sqlPath: '', sql: permissionsSql });
  const pending = new Set(plan.pendingMigrations.map((migration) => migration.name));
  const expected = plan.expectedTables.map((name) => `(${literal(name)})`).join(', ');
  return [
    '\\set ON_ERROR_STOP on',
    'BEGIN;',
    "SET LOCAL lock_timeout = '15s';",
    "SET LOCAL statement_timeout = '15min';",
    "SELECT pg_advisory_xact_lock(hashtext('thesis-ledger-schema-upgrade'));",
    `DO $upgrade_guard$ BEGIN
      IF current_database() IS DISTINCT FROM ${literal(target.databaseName)}
        OR current_user IS DISTINCT FROM ${literal(target.ownerName)} THEN
        RAISE EXCEPTION 'database upgrade target mismatch';
      END IF;
    END $upgrade_guard$;`,
    'LOCK TABLE "SchemaVersion" IN EXCLUSIVE MODE;',
    `DO $upgrade_guard$ BEGIN
      IF (SELECT "version" FROM "SchemaVersion" WHERE "id" = 1) IS DISTINCT FROM ${literal(fromHead)} THEN
        RAISE EXCEPTION 'database upgrade source head mismatch';
      END IF;
    END $upgrade_guard$;`,
    ...input.migrations.filter((migration) => pending.has(migration.name)).map(normalizeMigrationSql),
    permissions,
    ...(confirmation.appRole ? [
      '\\getenv upgrade_app_role POSTGRES_APP_USER',
      `SELECT :'upgrade_app_role' = ${literal(confirmation.appRole)} AS upgrade_role_matches \\gset`,
      '\\if :upgrade_role_matches',
      '\\else',
      'SELECT 1 / 0 AS upgrade_role_mismatch;',
      '\\endif',
      `DO $upgrade_guard$ BEGIN IF NOT (${buildUpgradePermissionsCheck(confirmation.appRole).trim().replace(/;$/, '')})
        THEN RAISE EXCEPTION 'database upgrade permissions mismatch'; END IF; END $upgrade_guard$;`,
    ] : []),
    `DO $upgrade_guard$ BEGIN
      IF EXISTS (SELECT 1 FROM (VALUES ${expected}) AS expected(name)
        WHERE to_regclass(format('public.%I', expected.name)) IS NULL) THEN
        RAISE EXCEPTION 'database upgrade structure incomplete';
      END IF;
    END $upgrade_guard$;`,
    `UPDATE "SchemaVersion" SET "version" = ${literal(plan.toHead)}, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 1;`,
    'COMMIT;',
    '',
  ].join('\n');
}
