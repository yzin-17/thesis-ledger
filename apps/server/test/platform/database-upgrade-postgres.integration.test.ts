import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { backupDatabaseForUpgrade } from '../../src/platform/database-upgrade-backup.js';
import { runDatabaseUpgradeRehearsal } from '../../src/platform/database-upgrade-run-rehearsal.js';
import { buildUpgradePermissionsCheck } from '../../src/platform/database-upgrade-permissions.js';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  discoverDatabaseStructure,
  type DatabaseStructureInput,
} from '../../src/platform/database-structure.js';
import { planDatabaseUpgrade } from '../../src/platform/database-upgrade-plan.js';
import { buildDatabaseUpgradeSql } from '../../src/platform/database-upgrade-sql.js';
import {
  captureUpgradeDataWitness,
  assertUpgradeDataPreserved,
  upgradeArchiveNamesFor,
} from '../../src/platform/database-upgrade-data-witness.js';
import {
  createUpgradeIsolation,
  runUpgradeIsolationSql,
} from '../../src/platform/database-upgrade-isolation.js';

const container = process.env.DATABASE_UPGRADE_TEST_CONTAINER;
const isolatedDescribe = container ? describe : describe.skip;
const target = { databaseName: 'upgrade_fixture', ownerName: 'postgres' };
const fromHead = '20260922100000_ai_provider_test_facts';

function execute(sql: string) {
  if (container !== 'tl-upgrade-transaction-check-20260927')
    throw new Error('只允许指定隔离测试容器');
  return execFileSync(
    'docker',
    [
      'exec',
      '-i',
      container,
      'psql',
      '-U',
      'postgres',
      '-d',
      target.databaseName,
      '-Atq',
      '-v',
      'ON_ERROR_STOP=1',
    ],
    { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
  ).trim();
}

function upgrade(source: DatabaseStructureInput, start: string, permissions: string) {
  return buildDatabaseUpgradeSql(
    source,
    start,
    target,
    {
      planFingerprint: planDatabaseUpgrade(source, start, target).fingerprint,
      permissionsSha256: createHash('sha256').update(permissions).digest('hex'),
    },
    permissions,
  );
}

isolatedDescribe('隔离 PostgreSQL 保留数据升级', () => {
  let source: DatabaseStructureInput;
  beforeAll(async () => {
    source = await discoverDatabaseStructure();
    execute(
      source.migrations
        .filter((item) => item.name <= fromHead)
        .map((item) => item.sql)
        .join('\n'),
    );
    execute(`CREATE TABLE "UpgradeSentinel" (id INT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO "UpgradeSentinel" VALUES (1, 'preserve-fixture');
      INSERT INTO "SchemaVersion" (id, version) VALUES (1, '${fromHead}')
      ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version;`);
  });

  it('从真实备份自动恢复演练并产生记录，源库仍保持旧 head', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'upgrade-rehearsal-'));
    try {
      const consumersStoppedAt = new Date().toISOString();
      const backup = await backupDatabaseForUpgrade(
        container!,
        target,
        join(directory, 'backup.dump'),
      );
      const permissionsSql = readFileSync(
        new URL(
          '../../../../../thesis-ledger-infra/scripts/bootstrap-app-role.sql',
          import.meta.url,
        ),
        'utf8',
      );
      const result = await runDatabaseUpgradeRehearsal({
        source,
        fromHead,
        backup,
        consumersStoppedAt,
        permissionsSql,
        appRole: 'rehearsal_app',
      });
      expect(result.checks).toEqual({
        restoredSourceHead: fromHead,
        upgradedHead: source.currentHead,
        structureComplete: true,
        appRolePermissions: true,
        preservedData: true,
      });
      expect(result.backupSha256).toBe(backup.backupSha256);
      expect(result.appRole).toBe('rehearsal_app');
      expect(execute('SELECT version FROM "SchemaVersion" WHERE id=1;')).toBe(fromHead);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 60_000);

  it('官方准备命令绑定镜像输入并生成 SQL，拒绝运行中的消费者', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'upgrade-prepare-'));
    const fixtureContainers: string[] = [];
    const docker = (args: string[]) =>
      execFileSync('docker', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    try {
      const sourceId = docker(['inspect', '--format', '{{.Id}}', container!]);
      const image = docker(['inspect', '--format', '{{.Image}}', container!]);
      for (let index = 0; index < 2; index += 1)
        fixtureContainers.push(
          docker(['create', '--network', 'none', '--entrypoint', '/bin/true', image]),
        );
      await writeFile(join(directory, 'image-input.json'), JSON.stringify(source));
      const env = {
        ...process.env,
        DATABASE_UPGRADE_RUN_DIR: directory,
        DATABASE_UPGRADE_CONTAINER: sourceId,
        DATABASE_UPGRADE_CONSUMERS: JSON.stringify(fixtureContainers),
        DEV_DATABASE_EXPECTED_DATABASE: target.databaseName,
        DEV_DATABASE_EXPECTED_OWNER: target.ownerName,
        DEV_DATABASE_PERMISSIONS_SQL: fileURLToPath(
          new URL(
            '../../../../../thesis-ledger-infra/scripts/bootstrap-app-role.sql',
            import.meta.url,
          ),
        ),
      };
      const entry = fileURLToPath(
        new URL('../../src/platform/database-upgrade-prepare.ts', import.meta.url),
      );
      const invoke = (consumers: string[]) =>
        execFileSync(process.execPath, ['--import', 'tsx', entry], {
          env: { ...env, DATABASE_UPGRADE_CONSUMERS: JSON.stringify(consumers) },
          timeout: 60_000,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      expect(() => invoke([sourceId, fixtureContainers[0]!])).toThrow();
      invoke(fixtureContainers);
      const evidence = JSON.parse(await readFile(join(directory, 'rehearsal.json'), 'utf8'));
      expect(evidence.checks.upgradedHead).toBe(source.currentHead);
      expect(evidence.appRole).toBe('rehearsal_app');
      expect(await readFile(join(directory, 'upgrade.sql'), 'utf8')).toContain(
        'upgrade_role_matches',
      );
      expect(execute('SELECT version FROM "SchemaVersion" WHERE id=1;')).toBe(fromHead);
    } finally {
      for (const id of fixtureContainers) docker(['rm', '-v', id]);
      await rm(directory, { recursive: true, force: true });
    }
  }, 60_000);

  it('真实四项增量保留旧数据、建立新表并初始化应用角色权限', async () => {
    const before = await captureUpgradeDataWitness(container!, target);
    execute(
      upgrade(
        source,
        fromHead,
        `CREATE ROLE upgrade_fixture_reader;
      GRANT USAGE ON SCHEMA public TO upgrade_fixture_reader;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO upgrade_fixture_reader;`,
      ),
    );
    expect(execute('SELECT value FROM "UpgradeSentinel" WHERE id=1;')).toBe('preserve-fixture');
    expect(execute('SELECT version FROM "SchemaVersion" WHERE id=1;')).toBe(source.currentHead);
    expect(execute('SELECT count(*) FROM "MarketBarSeriesFactArchive";')).toBe('0');
    expect(execute('SELECT count(*) FROM "MarketBarSeriesCoverageArchive";')).toBe('0');
    expect(
      execute(
        `SELECT has_table_privilege('upgrade_fixture_reader', '"MarketDerivedSeriesSnapshotV3"', 'INSERT');`,
      ),
    ).toBe('t');
    const after = await captureUpgradeDataWitness(
      container!,
      target,
      before,
      upgradeArchiveNamesFor(planDatabaseUpgrade(source, fromHead, target).pendingMigrations),
    );
    assertUpgradeDataPreserved(before, after);
    const sentinel = { tables: before.tables.filter((entry) => entry.table === 'UpgradeSentinel') };
    execute('ALTER TABLE "UpgradeSentinel" ADD COLUMN extra TEXT DEFAULT \'new\';');
    assertUpgradeDataPreserved(
      sentinel,
      await captureUpgradeDataWitness(container!, target, sentinel),
    );
    execute('UPDATE "UpgradeSentinel" SET value=\'changed\' WHERE id=1;');
    const changed = await captureUpgradeDataWitness(container!, target, sentinel);
    expect(() => assertUpgradeDataPreserved(sentinel, changed)).toThrow();
    execute('UPDATE "UpgradeSentinel" SET value=\'preserve-fixture\' WHERE id=1;');
  }, 30_000);

  it('旧 head 重复执行拒绝并保持数据', () => {
    expect(() => execute(upgrade(source, fromHead, 'SELECT 1;'))).toThrow();
    expect(execute('SELECT value FROM "UpgradeSentinel" WHERE id=1;')).toBe('preserve-fixture');
  });

  it('实际权限脚本满足逐项权限；缺失 INSERT 和越权均拒绝', () => {
    const permissions = readFileSync(
      new URL('../../../../../thesis-ledger-infra/scripts/bootstrap-app-role.sql', import.meta.url),
      'utf8',
    );
    execute(`\\setenv POSTGRES_OWNER_USER postgres
\\setenv POSTGRES_APP_USER upgrade_verified_app
\\setenv POSTGRES_APP_PASSWORD isolated-fixture-password
${permissions}`);
    const check = buildUpgradePermissionsCheck('upgrade_verified_app');
    expect(execute(check)).toBe('t');
    execute('REVOKE INSERT ON "UpgradeSentinel" FROM upgrade_verified_app;');
    expect(execute(check)).toBe('f');
    execute('GRANT INSERT ON "UpgradeSentinel" TO upgrade_verified_app;');
    expect(execute(check)).toBe('t');
    execute('GRANT UPDATE ON "SchemaVersion" TO upgrade_verified_app;');
    expect(execute(check)).toBe('f');
    execute('REVOKE UPDATE ON "SchemaVersion" FROM upgrade_verified_app;');
    execute('ALTER ROLE upgrade_verified_app CREATEDB;');
    expect(execute(check)).toBe('f');
    execute('ALTER ROLE upgrade_verified_app NOCREATEDB;');
    expect(execute(check)).toBe('t');
  });

  it('权限阶段失败回滚新增结构、数据及 marker', () => {
    const failing: DatabaseStructureInput = {
      ...source,
      currentHead: '20990101000000_failure_fixture',
      expectedTables: [...source.expectedTables, 'ShouldRollback'],
      migrations: [
        ...source.migrations,
        {
          name: '20990101000000_failure_fixture',
          sqlPath: '',
          sql: 'CREATE TABLE "ShouldRollback" (id INT); INSERT INTO "UpgradeSentinel" VALUES (2, \'rollback\');',
        },
      ],
    };
    expect(() => execute(upgrade(failing, source.currentHead, 'SELECT 1 / 0;'))).toThrow();
    expect(execute(`SELECT to_regclass('public."ShouldRollback"') IS NULL;`)).toBe('t');
    expect(execute('SELECT count(*) FROM "UpgradeSentinel";')).toBe('1');
    expect(execute('SELECT version FROM "SchemaVersion" WHERE id=1;')).toBe(source.currentHead);
  });

  it('已完成归档且当前 Policy 非空时，仅新增 NAV 表仍逐表保留数据', async () => {
    const priorHead = '20260930100000_rebase_legacy_market_policy';
    const fixture = await createUpgradeIsolation(container!, target);
    const directory = await mkdtemp(join(tmpdir(), 'upgrade-after-archive-'));
    const query = (sql: string) =>
      runUpgradeIsolationSql(fixture.container, target, sql, fixture.isolationToken);
    try {
      await query(
        source.migrations
          .filter((item) => item.name <= priorHead)
          .map((item) => item.sql)
          .join('\n'),
      );
      await query(`INSERT INTO "SchemaVersion" (id, version) VALUES (1, '${priorHead}')
        ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version;
        INSERT INTO "DesiredProviderPolicy" (consumer, revision, enabled, routes, "syncState", "updatedAt")
        VALUES ('thesis-ledger', 31, true, '{"storageVersion":3,"routes":[]}', 'applied', NOW());`);
      expect(await query('SELECT count(*) FROM "DesiredProviderPolicyLegacyArchive";')).toBe('0');
      expect(await query('SELECT count(*) FROM "DesiredProviderPolicy";')).toBe('1');
      const consumersStoppedAt = new Date().toISOString();
      const backup = await backupDatabaseForUpgrade(
        fixture.container,
        target,
        join(directory, 'backup.dump'),
      );
      const permissionsSql = readFileSync(
        new URL(
          '../../../../../thesis-ledger-infra/scripts/bootstrap-app-role.sql',
          import.meta.url,
        ),
        'utf8',
      );
      const evidence = await runDatabaseUpgradeRehearsal({
        source,
        fromHead: priorHead,
        backup,
        consumersStoppedAt,
        permissionsSql,
        appRole: 'rehearsal_app',
      });
      expect(evidence.checks.preservedData).toBe(true);
      expect(evidence.checks.upgradedHead).toBe(source.currentHead);
      expect(await query('SELECT version FROM "SchemaVersion" WHERE id=1;')).toBe(priorHead);
      expect(await query('SELECT revision FROM "DesiredProviderPolicy";')).toBe('31');
    } finally {
      await fixture.dispose();
      await rm(directory, { recursive: true, force: true });
    }
  }, 60_000);
});
