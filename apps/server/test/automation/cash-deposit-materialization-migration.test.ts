import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const migrationSql = readFile(
  new URL(
    '../../prisma/migrations/20260905000000_fresh_database_baseline/migration.sql',
    import.meta.url,
  ),
  'utf8',
);

describe('定期现金入账单例 Automation Job 迁移', () => {
  it('创建固定任务并以部分唯一索引限制同类型重复任务', async () => {
    const migration = await migrationSql;

    expect(migration).toContain(
      'CREATE UNIQUE INDEX "AutomationJob_cash_deposit_materialization_singleton_key"',
    );
    expect(migration).toContain(`WHERE "type" = 'cash-deposit-materialization'`);
    expect(migration).toContain(`'00000000-0000-4000-8000-000000000010'`);
    expect(migration).toContain(`'0 9 * * *'`);
    expect(migration).toContain(`'Asia/Shanghai'`);
  });
});
