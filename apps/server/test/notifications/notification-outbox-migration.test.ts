import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const migrationSql = readFile(
  new URL(
    '../../prisma/migrations/20260830010000_recurring_cash_deposits/migration.sql',
    import.meta.url,
  ),
  'utf8',
);
const fixtureSql = readFile(
  new URL('./notification-outbox-migration-fixture.sql', import.meta.url),
  'utf8',
);

describe('Notification Outbox 旧数据迁移', () => {
  it('fixture 覆盖旧 eventId、投递状态和无效严重级别', async () => {
    const fixture = await fixtureSql;

    expect(fixture).toContain('"eventId"');
    expect(fixture).toContain('22222222-2222-4222-8222-222222222222');
    expect(fixture).toContain("'retrying'");
    expect(fixture).toContain("'legacy-severity'");
  });

  it('迁移回填稳定 subject 和完整风险消息快照', async () => {
    const migration = await migrationSql;

    expect(migration).toContain("'risk-event'");
    expect(migration).toContain('delivery."eventId"::text');
    expect(migration).toContain("'title', '风险提醒'");
    expect(migration).toContain(`'body', event."message"`);
    expect(migration).toContain(`'traceId', COALESCE(NULLIF(event."context"->>'traceId'`);
    expect(migration).toContain('ALTER COLUMN "subjectType" SET NOT NULL');
    expect(migration).toContain('DROP COLUMN "eventId"');
    expect(migration).toContain('DROP CONSTRAINT "NotificationDelivery_eventId_fkey"');
  });
});
