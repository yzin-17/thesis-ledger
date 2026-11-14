import { createHash, randomUUID } from 'node:crypto';
import { buildDatabaseRebuildSql, type DatabaseStructureInput, type DatabaseExecutionTarget } from './database-structure.js';
import { planDatabaseUpgrade } from './database-upgrade-plan.js';
import { createUpgradeIsolation, runUpgradeIsolationSql } from './database-upgrade-isolation.js';
import { buildDatabaseUpgradeSql } from './database-upgrade-sql.js';
import { buildUpgradePermissionsCheck } from './database-upgrade-permissions.js';
import { captureUpgradeDataWitness, assertUpgradeDataPreserved, type UpgradeDataWitness } from './database-upgrade-data-witness.js';

type Options = {
  source: DatabaseStructureInput; fromHead: string; target: DatabaseExecutionTarget;
  project: string; approvedSha256: string; container: string; permissionsSql: string; appRole: string;
};

/** 仅支持明确授权的开发库单项JSONB空对象增列，不开放通用无备份迁移。 */
export function authorizeNoBackupUpgrade(options: Pick<Options, 'source' | 'fromHead' | 'target' | 'project' | 'approvedSha256'>) {
  const { source, fromHead, target, project, approvedSha256 } = options;
  if (project !== 'thesis-ledger-dev' || target.databaseName !== 'thesis_ledger' || target.ownerName !== 'thesis_ledger')
    throw new Error('不备份升级仅限已确认的开发库');
  const plan = planDatabaseUpgrade(source, fromHead, target);
  if (!/^[a-f0-9]{64}$/.test(approvedSha256) || plan.pendingMigrations.length !== 1 ||
      plan.pendingMigrations[0]!.sha256 !== approvedSha256)
    throw new Error('不备份升级必须绑定唯一待执行迁移摘要');
  const sql = source.migrations.find(row => row.name === plan.pendingMigrations[0]!.name)!.sql.trim();
  const additive = /^ALTER TABLE "[A-Za-z_][A-Za-z0-9_]*"\s+ADD COLUMN "(?<column>[A-Za-z_][A-Za-z0-9_]*)" JSONB NOT NULL DEFAULT '\{\}'::jsonb,\s+ADD CONSTRAINT "[A-Za-z_][A-Za-z0-9_]*"\s+CHECK \(jsonb_typeof\("\k<column>"\) = 'object'\);$/u;
  if (!additive.test(sql)) throw new Error('不备份升级只允许受限的JSONB空对象增列');
  return plan;
}

export type NoBackupUpgradeEvidence = {
  version: 'development-no-backup-upgrade-v1'; backupCreated: false;
  target: DatabaseExecutionTarget; fromHead: string; toHead: string; planFingerprint: string;
  permissionsSha256: string; appRole: string; structureRehearsalPassed: true;
  baseline: UpgradeDataWitness; preparedAt: string;
};

/** 演练仅使用空结构，真实旧数据仅取摘要；不创建源数据备份或副本。 */
export async function prepareNoBackupUpgrade(options: Options): Promise<NoBackupUpgradeEvidence> {
  const { source, fromHead, target, container, permissionsSql, appRole } = options;
  const plan = authorizeNoBackupUpgrade(options);
  if (!appRole || appRole === target.ownerName) throw new Error('应用角色不得使用数据库owner');
  const permissionsSha256 = createHash('sha256').update(permissionsSql).digest('hex');
  const isolation = await createUpgradeIsolation(container, target);
  try {
    const execute = (sql: string) => runUpgradeIsolationSql(isolation.container, target, sql, isolation.isolationToken,
      { name: appRole, password: randomUUID() });
    const base = { ...source, currentHead: fromHead, migrations: source.migrations.filter(row => row.name <= fromHead) };
    await execute(buildDatabaseRebuildSql(base, permissionsSql, target));
    await execute(buildDatabaseUpgradeSql(source, fromHead, target, { planFingerprint: plan.fingerprint, permissionsSha256, appRole }, permissionsSql));
    if (await execute(buildUpgradePermissionsCheck(appRole)) !== 't') throw new Error('隔离应用权限未通过');
  } finally { await isolation.dispose(); }
  return { version: 'development-no-backup-upgrade-v1', backupCreated: false, target, fromHead, toHead: plan.toHead,
    planFingerprint: plan.fingerprint, permissionsSha256, appRole, structureRehearsalPassed: true,
    baseline: await captureUpgradeDataWitness(container, target), preparedAt: new Date().toISOString() };
}

/** 由正式入口在事务提交后、消费者重启前调用；不把结构演练当作业务副本演练。 */
export async function verifyNoBackupUpgrade(options: Omit<Options, 'fromHead'> & {
  evidence: NoBackupUpgradeEvidence; currentHead: string;
}) {
  const { evidence, target, permissionsSql, appRole, currentHead, container } = options;
  const plan = authorizeNoBackupUpgrade({ ...options, fromHead: evidence.fromHead });
  if (evidence.version !== 'development-no-backup-upgrade-v1' || evidence.backupCreated !== false ||
      evidence.structureRehearsalPassed !== true || evidence.appRole !== appRole ||
      JSON.stringify(evidence.target) !== JSON.stringify(target) || evidence.planFingerprint !== plan.fingerprint ||
      evidence.toHead !== plan.toHead || currentHead !== plan.toHead ||
      evidence.permissionsSha256 !== createHash('sha256').update(permissionsSql).digest('hex'))
    throw new Error('不备份升级核验与实际输入或head不匹配');
  assertUpgradeDataPreserved(evidence.baseline, await captureUpgradeDataWitness(container, target, evidence.baseline));
  return { version: 'development-no-backup-upgrade-verified-v1', backupCreated: false,
    planFingerprint: plan.fingerprint, oldColumnsPreserved: true, tables: evidence.baseline.tables.length,
    validatedAt: new Date().toISOString() };
}
