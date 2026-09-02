import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const migrationSql = readFile(
  new URL(
    '../../prisma/migrations/20260902000000_fresh_database_baseline/migration.sql',
    import.meta.url,
  ),
  'utf8',
);
const fixtureSql = readFile(
  new URL('./notification-outbox-migration-fixture.sql', import.meta.url),
  'utf8',
);

describe('NotificationDelivery current baseline', () => {
  it('fixture 仍记录历史 outbox 输入，供最终结构审阅', async () => {
    const fixture = await fixtureSql;

    expect(fixture).toContain('"eventId"');
    expect(fixture).toContain('22222222-2222-4222-8222-222222222222');
    expect(fixture).toContain("'retrying'");
    expect(fixture).toContain("'legacy-severity'");
  });

  it('current baseline 直接创建稳定 subject 和完整风险消息字段', async () => {
    const migration = await migrationSql;

    expect(migration).toContain('"subjectType" TEXT NOT NULL');
    expect(migration).toContain('"subjectId" TEXT NOT NULL');
    expect(migration).toContain('"message" JSONB NOT NULL');
    expect(migration).not.toContain('"eventId" UUID');
  });
});
