import { createHash, randomUUID } from 'node:crypto';
import type { backupDatabaseForUpgrade } from './database-upgrade-backup.js';
import type { DatabaseStructureInput } from './database-structure.js';
import { planDatabaseUpgrade } from './database-upgrade-plan.js';
import { createUpgradeIsolation, runUpgradeIsolationSql } from './database-upgrade-isolation.js';
import { restoreDatabaseUpgradeBackup } from './database-upgrade-restore.js';
import {
  captureUpgradeDataWitness,
  assertUpgradeDataPreserved,
  upgradeArchiveNamesFor,
} from './database-upgrade-data-witness.js';
import { buildDatabaseUpgradeSql } from './database-upgrade-sql.js';
import { buildUpgradePermissionsCheck } from './database-upgrade-permissions.js';
import { validateDatabaseUpgradeRehearsal } from './database-upgrade-rehearsal.js';

/** 调用方须先停止源库消费者并生成备份；本函数只操作独立副本，成功后产生实测记录。 */
export async function runDatabaseUpgradeRehearsal(options: {
  source: DatabaseStructureInput;
  fromHead: string;
  backup: Awaited<ReturnType<typeof backupDatabaseForUpgrade>>;
  consumersStoppedAt: string;
  permissionsSql: string;
  appRole: string;
}) {
  const { source, fromHead, backup, permissionsSql, appRole, consumersStoppedAt } = options;
  const permissionsCheck = buildUpgradePermissionsCheck(appRole);
  if (appRole === backup.target.ownerName) throw new Error('应用角色不得使用数据库 owner');
  if (
    !Number.isFinite(Date.parse(consumersStoppedAt)) ||
    Date.parse(consumersStoppedAt) > Date.parse(backup.backupStartedAt)
  )
    throw new Error('消费者停止时间必须早于备份');
  const plan = planDatabaseUpgrade(source, fromHead, backup.target);
  const permissionsSha256 = createHash('sha256').update(permissionsSql).digest('hex');
  const sql = buildDatabaseUpgradeSql(
    source,
    fromHead,
    backup.target,
    { planFingerprint: plan.fingerprint, permissionsSha256, appRole },
    permissionsSql,
  );
  let stage = '创建隔离库';
  const isolation = await createUpgradeIsolation(backup.sourceContainer, backup.target).catch(
    () => {
      throw new Error(`隔离演练阶段失败：${stage}`);
    },
  );
  try {
    stage = '恢复备份';
    const restored = await restoreDatabaseUpgradeBackup(
      backup,
      isolation.container,
      isolation.isolationToken,
    );
    const execute = (query: string, role?: { name: string; password: string }) =>
      runUpgradeIsolationSql(
        isolation.container,
        backup.target,
        query,
        isolation.isolationToken,
        role,
      );
    const headQuery = 'SELECT version FROM "SchemaVersion" WHERE id = 1;';
    stage = '恢复后结构校验';
    if ((await execute(headQuery)) !== fromHead) throw new Error('恢复副本的源 head 不匹配');
    stage = '旧数据摘要';
    const before = await captureUpgradeDataWitness(isolation.container, backup.target);
    stage = '执行隔离升级';
    await execute(sql, { name: appRole, password: randomUUID() });
    const upgradeCompletedAt = new Date().toISOString();
    stage = '升级后结构与权限校验';
    if ((await execute(headQuery)) !== plan.toHead) throw new Error('演练升级 head 不匹配');
    // 事务生成器在提交前已检查全部预期表；此处复核实际提交后的权限及旧数据。
    if ((await execute(permissionsCheck)) !== 't') throw new Error('演练应用角色权限未通过');
    stage = '旧数据保留校验';
    assertUpgradeDataPreserved(
      before,
      await captureUpgradeDataWitness(
        isolation.container,
        backup.target,
        before,
        upgradeArchiveNamesFor(plan.pendingMigrations),
      ),
    );
    const validatedAt = new Date().toISOString();
    const evidence = {
      version: 'database-upgrade-rehearsal-v1',
      target: backup.target,
      appRole,
      planFingerprint: plan.fingerprint,
      permissionsSha256,
      backupSha256: backup.backupSha256,
      backupBytes: backup.backupBytes,
      consumersStoppedAt,
      backupStartedAt: backup.backupStartedAt,
      backupCompletedAt: backup.backupCompletedAt,
      restoreCompletedAt: restored.restoreCompletedAt,
      upgradeCompletedAt,
      validatedAt,
      checks: {
        restoredSourceHead: fromHead,
        upgradedHead: plan.toHead,
        structureComplete: true,
        appRolePermissions: true,
        preservedData: true,
      },
    };
    stage = '演练证据校验';
    return validateDatabaseUpgradeRehearsal(evidence, {
      ...evidence,
      fromHead,
      toHead: plan.toHead,
      now: validatedAt,
    });
  } catch {
    throw new Error(`隔离演练阶段失败：${stage}`);
  } finally {
    await isolation.dispose();
  }
}
