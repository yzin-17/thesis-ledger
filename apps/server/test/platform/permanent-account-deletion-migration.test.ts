import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'prisma/migrations/20260914090000_permanent_account_deletion/migration.sql',
);

describe('账户永久删除约束 migration', () => {
  it('在约束创建前逐表检查孤立账户引用，并只添加 RESTRICT 外键', async () => {
    const sql = await readFile(migrationPath, 'utf8');
    const firstConstraint = sql.indexOf('ALTER TABLE');
    expect(firstConstraint).toBeGreaterThan(0);
    expect(sql.slice(0, firstConstraint)).toContain('DO $$');

    for (const table of [
      'TargetAllocation',
      'RiskEvent',
      'JournalEntry',
      'JournalReviewSnapshot',
      'AiDecisionLog',
    ]) {
      expect(sql).toContain(`FROM "${table}"`);
      expect(sql).toContain(`${table}.accountId 存在`);
      expect(sql).toContain(
        `CONSTRAINT "${table}_accountId_fkey"`,
      );
      expect(sql).toContain(
        `FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
      );
    }

    expect(sql).toMatch(/^BEGIN;/u);
    expect(sql).toMatch(/COMMIT;\s*$/u);
  });
});
