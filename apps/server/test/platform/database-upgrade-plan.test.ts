import { describe, expect, it } from 'vitest';
import { planDatabaseUpgrade } from '../../src/platform/database-upgrade-plan.js';
import {
  discoverDatabaseStructure,
  type DatabaseStructureInput,
} from '../../src/platform/database-structure.js';

const target = { databaseName: 'fixture', ownerName: 'fixture_owner' };
function fixture(): DatabaseStructureInput {
  return {
    migrations: [
      {
        name: '20260901000000_base',
        sqlPath: 'base.sql',
        sql: 'BEGIN;\nCREATE TABLE "A" (id INT);\nCOMMIT;',
      },
      {
        name: '20260902000000_next',
        sqlPath: 'next.sql',
        sql: 'BEGIN;\nCREATE TABLE "B" (id INT);\nCOMMIT;',
      },
    ],
    currentHead: '20260902000000_next',
    expectedTables: ['A', 'B'],
    prismaTables: ['A', 'B'],
    rawOwnedTables: [],
  };
}

describe('保留数据升级计划', () => {
  it('当前源码链可以从已知部署版本生成严格增量计划', async () => {
    const source = await discoverDatabaseStructure();
    const plan = planDatabaseUpgrade(source, '20260922100000_ai_provider_test_facts', target);
    expect(plan.pendingMigrations.map((row) => row.name)).toEqual([
      '20260925100000_market_bar_series_identity_v1',
      '20260925110000_market_bar_window_evidence_v3',
      '20260926090000_market_window_frozen_response',
      '20260927090000_market_derived_series_snapshot',
      '20260928140000_market_window_catalog_revision_bigint',
      '20260929114800_drop_market_bar_series_v2',
      '20260929180000_backtest_job_current_mode_default',
      '20260929221000_ledger_envelope_version',
      '20260930100000_rebase_legacy_market_policy',
      '20261001100000_nav_backtest_preparation',
      '20261001120000_require_explicit_strategy_contract',
    ]);
  });
  it('仅列出当前 head 后的迁移且保留完整链摘要', () => {
    const plan = planDatabaseUpgrade(fixture(), '20260901000000_base', target);
    expect(plan.pendingMigrations.map((row) => row.name)).toEqual(['20260902000000_next']);
    expect(plan.migrationChain).toHaveLength(2);
    expect(plan.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });
  it('已经到 head 时不重新执行历史迁移', () => {
    expect(planDatabaseUpgrade(fixture(), fixture().currentHead, target).pendingMigrations).toEqual(
      [],
    );
  });
  it.each(['', 'future', '20260801000000_absent'])('拒绝未知 head %s', (head) => {
    expect(() => planDatabaseUpgrade(fixture(), head, target)).toThrow('未知');
  });
  it.each(['history', 'pending', 'tables', 'database', 'owner'] as const)(
    '输入 %s 改变使计划失效',
    (change) => {
      const input = fixture();
      const before = planDatabaseUpgrade(input, input.migrations[0]!.name, target).fingerprint;
      const destination = { ...target };
      if (change === 'history') input.migrations[0]!.sql += '\n-- changed';
      else if (change === 'pending') input.migrations[1]!.sql += '\n-- changed';
      else if (change === 'tables') input.expectedTables.push('C');
      else if (change === 'database') destination.databaseName = 'other';
      else destination.ownerName = 'other';
      expect(
        planDatabaseUpgrade(input, input.migrations[0]!.name, destination).fingerprint,
      ).not.toBe(before);
    },
  );
  it('拒绝乱序链和错误目标', () => {
    const input = fixture();
    input.migrations.reverse();
    expect(() => planDatabaseUpgrade(input, input.currentHead, target)).toThrow();
    expect(() =>
      planDatabaseUpgrade(fixture(), fixture().currentHead, { ...target, ownerName: ' ' }),
    ).toThrow();
  });
});
