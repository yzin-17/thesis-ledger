import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const baselineSql = readFile(
  new URL(
    '../../prisma/migrations/20260905000000_fresh_database_baseline/migration.sql',
    import.meta.url,
  ),
  'utf8',
);

describe('fresh database current baseline', () => {
  it('包含 Prisma 最终结构和 Schema marker', async () => {
    const sql = await baselineSql;

    for (const table of [
      'SchemaVersion',
      'Account',
      'Asset',
      'LedgerEvent',
      'ImportDraftRevision',
      'BaselineObservationBatch',
      'Trade',
      'CashBalance',
      'JournalReviewSnapshot',
    ]) {
      expect(sql).toContain(`CREATE TABLE "${table}"`);
    }
    expect(sql).toContain(
      'INSERT INTO "SchemaVersion" ("id", "version")\nVALUES (1, \'20260905000000_fresh_database_baseline\')',
    );
  });

  it('保留数据库级 CHECK、扩展和非 Prisma 索引', async () => {
    const sql = await baselineSql;

    for (const invariant of [
      'AccountCostStrategyVersion_method_check',
      'ImportDraft_scope_check',
      'ImportDraftRevision_time_precision_check',
      'BaselineObservationBatch_status_check',
      'LedgerEvent_v2_revisionAction_check',
      'LedgerEvent_v2_revision_shape_check',
      'LedgerEvent_v2_unknown_time_check',
      'RecurringCashDepositPlan_expectedAmount_check',
      'RecurringCashDepositOccurrence_status_check',
    ]) {
      expect(sql).toContain(invariant);
    }
    expect(sql).toContain('CREATE EXTENSION IF NOT EXISTS pg_trgm');
    expect(sql).toContain('Instrument_displayName_trgm_idx');
    expect(sql).toContain('AutomationJob_cash_deposit_materialization_singleton_key');
  });

  it('保留三项提交后不可变 trigger', async () => {
    const sql = await baselineSql;

    for (const trigger of [
      'LedgerEvent_append_only',
      'ImportDraftRevision_frozen',
      'BaselineObservationBatch_submitted',
    ]) {
      expect(sql).toContain(`CREATE TRIGGER "${trigger}"`);
    }
  });
});
