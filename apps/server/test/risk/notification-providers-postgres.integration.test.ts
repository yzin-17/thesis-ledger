import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { NotificationService } from '../../src/notifications/notification.service.js';
import { RiskNotificationRoutingService } from '../../src/notifications/risk-notification-routing.service.js';
import { encryptProviderCredential } from '../../src/platform/credential-security.js';

const databaseUrl = process.env.RISK_MONITORING_DATABASE_URL;
const redisUrl = process.env.RISK_MONITORING_REDIS_URL;
const enabled = Boolean(databaseUrl && redisUrl && process.env.RISK_MONITORING_FIXTURE_ID);

describe.skipIf(!enabled)('风险通知多提供方隔离 PostgreSQL 与 Redis', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl ?? 'postgresql://fixture_owner:isolated_fixture@127.0.0.1:1/risk_monitoring_fixture' } } });
  const redis = new Redis(redisUrl ?? 'redis://127.0.0.1:1', { lazyConnect: true });
  const routing = new RiskNotificationRoutingService(prisma as never);
  const notifications = new NotificationService(prisma as never, { client: redis } as never, { record: vi.fn() } as never);
  const message = { title: '隔离通知', body: '不发送外部通知', severity: 'warning' as const, traceId: 'isolated' };
  const policy = { cooldownMinutes: 30, maxAttempts: 3, criticalBypassCooldown: true };
  beforeAll(async () => {
    expect(new URL(databaseUrl!).pathname).toBe('/risk_monitoring_fixture');
    const identity = await prisma.$queryRawUnsafe<Array<{ current_database: string }>>('SELECT current_database()');
    expect(identity[0]?.current_database).toBe('risk_monitoring_fixture');
    await redis.connect();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('隔离验收禁止外部投递'));
    for (const [index, name] of ['优先通知', '备用通知'].entries()) {
      await prisma.providerConfig.create({ data: {
        name, type: 'notification', enabled: true, priority: index + 1, capabilities: [],
        encryptedCredentials: encryptProviderCredential(`https://open.feishu.cn/open-apis/bot/v2/hook/isolated-${index}`),
      } });
    }
  });
  beforeEach(async () => {
    await prisma.notificationRoutingPreference.deleteMany();
    await prisma.notificationDelivery.deleteMany({ where: { subjectId: { startsWith: 'isolated-' } } });
    const keys = await redis.keys('*notification:*');
    if (keys.length) await redis.del(...keys);
  });
  afterAll(async () => { vi.restoreAllMocks(); await redis.quit(); await prisma.$disconnect(); });

  it('升级保持历史记录，新的三字段幂等键不会重开历史投递', async () => {
    const previous = await prisma.notificationDelivery.findUniqueOrThrow({ where: { id: '11111111-1111-4111-8111-111111111111' } });
    expect(previous.status).toBe('delivered');
    expect(previous.message).toMatchObject({ traceId: 'legacy-isolated' });
    await notifications.enqueue({ type: 'risk-event', id: 'legacy-event' }, message, policy);
    const after = await prisma.notificationDelivery.findMany({ where: { subjectId: 'legacy-event' } });
    expect(after).toHaveLength(1);
    expect(after[0]).toEqual(previous);
  });
  it('默认最高优先级，多选持久化并对同渠道分别入队', async () => {
    expect((await routing.read()).selectedProviders).toEqual(['优先通知']);
    await routing.save(['优先通知', '备用通知']);
    expect((await new RiskNotificationRoutingService(prisma as never).read()).selectedProviders).toEqual(['优先通知', '备用通知']);
    const subject = { type: 'risk-event', id: 'isolated-multiple', dedupKey: 'isolated-rule' };
    await notifications.enqueue(subject, message, policy);
    await notifications.enqueue(subject, { ...message, severity: 'critical' }, policy);
    const rows = await prisma.notificationDelivery.findMany({ where: { subjectId: subject.id } });
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.provider).sort()).toEqual(['优先通知', '备用通知'].sort());
    expect(rows.every((row) => row.status === 'pending' && row.attemptCount === 0)).toBe(true);
    expect(rows.every((row) => (row.message as typeof message).severity === 'warning')).toBe(true);
  });
  it('任一提供方入队失败时整批回滚，释放冷却后可完整重试', async () => {
    await routing.save(['优先通知', '备用通知']);
    await prisma.$executeRawUnsafe(`CREATE FUNCTION fixture_reject_provider() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."provider"='备用通知' THEN RAISE EXCEPTION 'isolated admission failure'; END IF; RETURN NEW; END $$`);
    await prisma.$executeRawUnsafe('CREATE TRIGGER fixture_reject_provider BEFORE INSERT ON "NotificationDelivery" FOR EACH ROW EXECUTE FUNCTION fixture_reject_provider()');
    const subject = { type: 'risk-event', id: 'isolated-rollback', dedupKey: 'isolated-rollback' };
    try {
      await expect(notifications.enqueue(subject, message, policy)).rejects.toThrow('isolated admission failure');
      expect(await prisma.notificationDelivery.count({ where: { subjectId: subject.id } })).toBe(0);
      expect(await redis.keys('*notification:*')).toEqual([]);
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER fixture_reject_provider ON "NotificationDelivery"');
      await prisma.$executeRawUnsafe('DROP FUNCTION fixture_reject_provider()');
    }
    await notifications.enqueue(subject, message, policy);
    expect(await prisma.notificationDelivery.count({ where: { subjectId: subject.id } })).toBe(2);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
  it('其它主题在优先级变化后仍复用原渠道投递，不重新排队', async () => {
    const subject = { type: 'cash-plan', id: 'isolated-legacy-channel' };
    const critical = { ...message, severity: 'critical' as const };
    await notifications.enqueue(subject, critical, policy);
    const original = await prisma.notificationDelivery.findFirstOrThrow({ where: { subjectId: subject.id } });
    await prisma.providerConfig.update({ where: { name: '备用通知' }, data: { priority: 0 } });
    try {
      await Promise.all([
        notifications.enqueue(subject, { ...critical, body: '不得覆盖' }, policy),
        notifications.enqueue(subject, { ...critical, body: '并发不得覆盖' }, policy),
      ]);
      expect(await prisma.notificationDelivery.findMany({ where: { subjectId: subject.id } })).toEqual([original]);
    } finally {
      await prisma.providerConfig.update({ where: { name: '备用通知' }, data: { priority: 2 } });
    }
  });

});
