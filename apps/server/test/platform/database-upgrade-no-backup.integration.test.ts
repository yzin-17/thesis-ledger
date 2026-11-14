import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { prepareNoBackupUpgrade, verifyNoBackupUpgrade } from '../../src/platform/database-upgrade-no-backup.js';
import { buildDatabaseRebuildSql } from '../../src/platform/database-structure.js';
import { buildDatabaseUpgradeSql } from '../../src/platform/database-upgrade-sql.js';
import { createUpgradeIsolation, runUpgradeIsolationSql } from '../../src/platform/database-upgrade-isolation.js';
import { authorized, fromHead, source, target } from './database-upgrade-no-backup.fixture.js';

const enabled = process.env.E11_NO_BACKUP_UPGRADE === '1';
describe.runIf(enabled)('不备份增列的真实隔离PostgreSQL', () => {
  it('结构演练不复制源数据，事务增列保留旧数据，错误提交回滚', async () => {
    const isolation = await createUpgradeIsolation('thesis-ledger-dev-postgres-1', target);
    try {
      const permissionsSql = readFileSync(new URL('../../../../infra/docker/bootstrap-app-role.sql', import.meta.url), 'utf8');
      const appRole = 'controlled_app';
      const execute = (sql: string) => runUpgradeIsolationSql(isolation.container, target, sql, isolation.isolationToken,
        { name: appRole, password: 'controlled-isolation-only' });
      const base = { ...source, currentHead: fromHead, migrations: source.migrations.slice(0, 1) };
      await execute(buildDatabaseRebuildSql(base, permissionsSql, target));
      await execute(`INSERT INTO "OptimizationExperiment" VALUES (1, 'preserved-exact-value'); INSERT INTO "LedgerEvent" VALUES (1, 'frozen');`);
      const options = { ...authorized, container: isolation.container, permissionsSql, appRole };
      const evidence = await prepareNoBackupUpgrade(options);
      expect(evidence.backupCreated).toBe(false);
      expect(evidence.baseline.tables.find(row => row.table === 'OptimizationExperiment')?.rows).toBe(1);
      expect(await execute('SELECT version FROM "SchemaVersion" WHERE id=1;')).toBe(fromHead);
      const sql = buildDatabaseUpgradeSql(source, fromHead, target, evidence, permissionsSql);
      await expect(execute(sql.replace('COMMIT;', 'SELECT 1 / 0;\nCOMMIT;'))).rejects.toThrow();
      expect(await execute('SELECT version FROM "SchemaVersion" WHERE id=1;')).toBe(fromHead);
      await execute(sql);
      const verified = await verifyNoBackupUpgrade({ ...options, evidence, currentHead: source.currentHead });
      expect(verified.oldColumnsPreserved).toBe(true);
      expect(await execute('SELECT "retryState" FROM "OptimizationExperiment";')).toBe('{}');
      await expect(execute(`UPDATE "OptimizationExperiment" SET "retryState"='[]'::jsonb;`)).rejects.toThrow();
      await expect(verifyNoBackupUpgrade({ ...options, evidence, currentHead: fromHead })).rejects.toThrow();
      await expect(verifyNoBackupUpgrade({ ...options, evidence,
        permissionsSql: permissionsSql + '\n-- changed', currentHead: source.currentHead })).rejects.toThrow();
      await execute(`UPDATE "OptimizationExperiment" SET value='changed';`);
      await expect(verifyNoBackupUpgrade({ ...options, evidence, currentHead: source.currentHead })).rejects.toThrow('既有列数据');
      expect(evidence.permissionsSha256).toBe(createHash('sha256').update(permissionsSql).digest('hex'));
    } finally { await isolation.dispose(); }
  }, 120_000);
});
