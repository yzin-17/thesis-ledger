import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  buildDatabaseRebuildSql,
  buildDatabaseStructureCheckSql,
  discoverDatabaseStructure,
  inspectDatabaseStructure,
  normalizeMigrationSql,
  assertDevelopmentRebuildAuthorization,
  type DatabaseStructureInput,
} from '../../src/platform/database-structure.js';

const target = { databaseName: 'thesis_ledger', ownerName: 'thesis_owner' };

const migration = (name: string, sql: string) => ({
  name,
  sqlPath: `/tmp/${name}/migration.sql`,
  sql,
});

describe('database structure input', () => {
  it('自动发现全部 migration、Prisma 表和 raw-owned 表', async () => {
    const input = await discoverDatabaseStructure();

    expect(input.currentHead).toBe('20260916100000_remove_legacy_market_bar');
    expect(input.migrations).toHaveLength(11);
    expect(input.prismaTables).toHaveLength(58);
    expect(input.rawOwnedTables).toHaveLength(7);
    expect(input.expectedTables).toHaveLength(65);
    expect(input.expectedTables).toEqual(
      expect.arrayContaining(['StrategyRiskApplication', 'AutomationRunLease', 'LedgerEvent']),
    );
  });

  it('只移除合法的首尾事务边界并保留迁移内容', () => {
    const result = normalizeMigrationSql(
      migration(
        'with-boundaries',
        '-- header\nBEGIN;\nCREATE TABLE "A" ("id" integer);\nCOMMIT;\n-- tail',
      ),
    );

    expect(result).toContain('CREATE TABLE "A"');
    expect(result).not.toMatch(/^\s*BEGIN\s*;/iu);
    expect(result).not.toMatch(/COMMIT\s*;\s*$/iu);
  });

  it('拒绝非边界事务控制', () => {
    expect(() =>
      normalizeMigrationSql(
        migration('invalid', 'CREATE TABLE "A" ("id" integer);\nBEGIN;\nCOMMIT;'),
      ),
    ).toThrow('非边界事务控制');
  });
});

describe('database structure report', () => {
  const input: DatabaseStructureInput = {
    migrations: [migration('20260101000000_one', 'CREATE TABLE "A" ("id" integer);')],
    currentHead: '20260101000000_one',
    expectedTables: ['A', 'RawTable'],
    prismaTables: ['A'],
    rawOwnedTables: ['RawTable'],
  };

  it('同时检查 marker 和全部表覆盖', async () => {
    const report = await inspectDatabaseStructure(
      input,
      async () => [{ tableName: 'A' }],
      async () => [{ version: input.currentHead }],
    );

    expect(report.ready).toBe(false);
    expect(report.missingRawOwnedTables).toEqual(['RawTable']);
    expect(report.missingTables).toEqual(['RawTable']);
  });

  it('marker 缺失也必须失败', async () => {
    const report = await inspectDatabaseStructure(
      input,
      async () => [{ tableName: 'A' }, { tableName: 'RawTable' }],
      async () => [],
    );

    expect(report.ready).toBe(false);
    expect(report.databaseVersion).toBeNull();
  });
});

describe('database SQL assembly', () => {
  const input: DatabaseStructureInput = {
    migrations: [
      migration('20260101000000_one', 'BEGIN;\nCREATE TABLE "A" ("id" integer);\nCOMMIT;'),
    ],
    currentHead: '20260101000000_one',
    expectedTables: ['A', 'RawTable'],
    prismaTables: ['A'],
    rawOwnedTables: ['RawTable'],
  };

  it('生成逐表覆盖检查和 distinct marker 校验', () => {
    const sql = buildDatabaseRebuildSql(input, '\\getenv app_user POSTGRES_APP_USER', target);
    const checkSql = buildDatabaseStructureCheckSql(input, target);

    expect(sql).toContain('\\set ON_ERROR_STOP on');
    expect(sql).toContain("current_database() IS DISTINCT FROM 'thesis_ledger'");
    expect(sql).toContain("current_user IS DISTINCT FROM 'thesis_owner'");
    expect(sql).toContain("('A'), ('RawTable')");
    expect(sql).toContain('IS DISTINCT FROM');
    expect(sql).toContain('DROP SCHEMA IF EXISTS public CASCADE');
    expect(sql).toContain('\\getenv app_user POSTGRES_APP_USER');
    expect(checkSql).toContain("('A'), ('RawTable')");
  });
});

describe('database rebuild authorization', () => {
  it('拒绝未知模式和空目标确认', () => {
    expect(() =>
      assertDevelopmentRebuildAuthorization({
        mode: 'unknown',
        allowDataLoss: 'true',
        confirm: 'target',
        expectedTarget: 'target',
      }),
    ).toThrow('必须是 check 或 rebuild');
    expect(() =>
      assertDevelopmentRebuildAuthorization({
        mode: 'rebuild',
        allowDataLoss: 'true',
        confirm: '',
        expectedTarget: '',
      }),
    ).toThrow('目标不能为空');
  });

  it('只在 development 且完成全部显式确认时允许 rebuild', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      expect(() =>
        assertDevelopmentRebuildAuthorization({
          mode: 'rebuild',
          allowDataLoss: 'true',
          confirm: 'probe/thesis_ledger',
          expectedTarget: 'probe/thesis_ledger',
        }),
      ).toThrow('仅允许 NODE_ENV=development');

      process.env.NODE_ENV = 'development';
      expect(() =>
        assertDevelopmentRebuildAuthorization({
          mode: 'rebuild',
          allowDataLoss: 'false',
          confirm: 'probe/thesis_ledger',
          expectedTarget: 'probe/thesis_ledger',
        }),
      ).toThrow('DEV_DATABASE_ALLOW_DATA_LOSS=true');
      expect(() =>
        assertDevelopmentRebuildAuthorization({
          mode: 'rebuild',
          allowDataLoss: 'true',
          confirm: 'probe/other',
          expectedTarget: 'probe/thesis_ledger',
        }),
      ).toThrow('DEV_DATABASE_CONFIRM 必须精确匹配');
      expect(() =>
        assertDevelopmentRebuildAuthorization({
          mode: 'rebuild',
          allowDataLoss: 'true',
          confirm: 'probe/thesis_ledger',
          expectedTarget: 'probe/thesis_ledger',
        }),
      ).not.toThrow();
    } finally {
      if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it('CLI 拒绝 URL 数据库名与执行目标不一致并且不输出 SQL', () => {
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', 'src/platform/dev-database-rebuild.ts'],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: {
          ...process.env,
          NODE_ENV: 'development',
          DATABASE_URL: 'postgresql://app:test@postgres/A',
          DEV_DATABASE_MODE: 'rebuild',
          DEV_DATABASE_ALLOW_DATA_LOSS: 'true',
          DEV_DATABASE_PROJECT: 'probe',
          DEV_DATABASE_CONFIRM: 'probe/A',
          DEV_DATABASE_EXPECTED_DATABASE: 'B',
          DEV_DATABASE_EXPECTED_OWNER: 'owner',
        },
      },
    );

    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('必须与 DATABASE_URL 数据库名一致');
  });
});
