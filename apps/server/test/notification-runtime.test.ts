import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotificationDispatcher } from '../src/notifications/notification.dispatcher.js';
import {
  FeishuWebhookProvider,
  NotificationService,
  type NotificationMessage,
  type NotificationPolicy,
} from '../src/notifications/notification.service.js';

const message: NotificationMessage = {
  title: '风险提醒',
  body: '测试消息',
  severity: 'warning',
  traceId: 'trace-1',
};

const policy: NotificationPolicy = {
  channels: { warning: ['feishu'], critical: ['feishu'] },
  cooldownMinutes: 30,
  maxAttempts: 3,
  criticalBypassCooldown: true,
};

const redisFixture = () => {
  const values = new Map<string, string>();
  return {
    values,
    client: {
      set: vi.fn(
        async (
          key: string,
          value: string,
          _mode: string,
          _ttl: number,
          modifier: string,
        ) => {
          if (modifier === 'NX' && values.has(key)) return null;
          values.set(key, value);
          return 'OK';
        },
      ),
      get: vi.fn(async (key: string) => values.get(key) ?? null),
      del: vi.fn(async (key: string) => (values.delete(key) ? 1 : 0)),
    },
  };
};

const riskRule = {
  kind: 'price-below',
  threshold: 100,
  condition: { operator: '<' },
  parameters: { window: 1 },
};

const riskEvent = (id: string, symbol = '600519.SH', accountId = 'account-1') => ({
  id,
  ruleId: 'rule-1',
  accountId,
  symbol,
  message: '价格跌破阈值',
  severity: 'warning',
  context: { traceId: `trace-${id}` },
  rule: riskRule,
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.FEISHU_WEBHOOK_URL;
});

describe('Feishu provider', () => {
  it('HTTP 200 但业务码非 0 时仍视为失败', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ code: 19002, msg: 'invalid webhook' }), { status: 200 }),
      ),
    );
    const provider = new FeishuWebhookProvider('https://example.com/webhook');
    await expect(provider.send(message, AbortSignal.timeout(1000))).rejects.toThrow(
      'feishu_business_19002:invalid webhook',
    );
  });
});

describe('Notification cooldown', () => {
  it('不同 eventId 但相同风险语义在 30 分钟内只排队一次', async () => {
    const redis = redisFixture();
    const upsert = vi.fn(async ({ create }: { create: object }) => create);
    const prisma = {
      riskEvent: {
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) => riskEvent(where.id)),
      },
      notificationDelivery: { upsert },
    };
    const service = new NotificationService(prisma as never, redis as never, { record: vi.fn() } as never);

    const first = await service.enqueue('event-a', 'warning', policy, new Date('2026-08-20T10:00:00Z'));
    const second = await service.enqueue('event-b', 'warning', policy, new Date('2026-08-20T10:01:00Z'));

    expect(first[0]).not.toBeNull();
    expect(second).toEqual([null]);
    expect(upsert).toHaveBeenCalledOnce();
  });

  it('不同 symbol 或 account 不会互相误去重', async () => {
    const redis = redisFixture();
    const upsert = vi.fn(async ({ create }: { create: object }) => create);
    const prisma = {
      riskEvent: {
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
          where.id === 'event-a'
            ? riskEvent(where.id, '600519.SH', 'account-1')
            : riskEvent(where.id, '000001.SZ', 'account-2'),
        ),
      },
      notificationDelivery: { upsert },
    };
    const service = new NotificationService(prisma as never, redis as never, { record: vi.fn() } as never);

    await service.enqueue('event-a', 'warning', policy);
    await service.enqueue('event-b', 'warning', policy);

    expect(upsert).toHaveBeenCalledTimes(2);
  });

  it('critical 可按 policy 绕过 cooldown', async () => {
    const redis = redisFixture();
    const upsert = vi.fn(async ({ create }: { create: object }) => create);
    const prisma = {
      riskEvent: {
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) => riskEvent(where.id)),
      },
      notificationDelivery: { upsert },
    };
    const service = new NotificationService(prisma as never, redis as never, { record: vi.fn() } as never);

    await service.enqueue('critical-a', 'critical', policy);
    await service.enqueue('critical-b', 'critical', policy);

    expect(upsert).toHaveBeenCalledTimes(2);
    expect(redis.client.set).not.toHaveBeenCalled();
  });
});

describe('Notification dispatch', () => {
  it('实际发送优先使用 ProviderConfig，而不是环境变量', async () => {
    process.env.FEISHU_WEBHOOK_URL = 'https://env.example/webhook';
    const redis = redisFixture();
    const delivery = {
      id: 'delivery-1',
      eventId: 'event-1',
      channel: 'feishu',
      provider: 'feishu',
      severity: 'warning',
      status: 'pending',
      attemptCount: 0,
      scheduledAt: new Date('2026-08-20T10:00:00Z'),
    };
    const prisma = {
      notificationDelivery: {
        findUniqueOrThrow: vi.fn(async () => delivery),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          ...delivery,
          ...data,
          status: data.status,
        })),
      },
      providerConfig: {
        findMany: vi.fn(async () => [
          {
            name: 'feishu',
            type: 'notification',
            enabled: true,
            priority: 1,
            encryptedCredentials: Buffer.from('https://provider.example/webhook'),
          },
        ]),
      },
    };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ code: 0 }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const service = new NotificationService(prisma as never, redis as never, { record: vi.fn() } as never);

    await expect(
      service.dispatchOne('delivery-1', new Date('2026-08-20T10:01:00Z'), message),
    ).resolves.toMatchObject({ skipped: false, delivery: { status: 'delivered' } });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://provider.example/webhook',
      expect.any(Object),
    );
  });

  it('业务错误进入 retrying，而不是 delivered', async () => {
    const redis = redisFixture();
    const delivery = {
      id: 'delivery-1',
      eventId: 'event-1',
      channel: 'feishu',
      provider: 'feishu',
      severity: 'warning',
      status: 'pending',
      attemptCount: 0,
      scheduledAt: new Date('2026-08-20T10:00:00Z'),
    };
    const update = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      ...delivery,
      ...data,
      status: data.status,
    }));
    const prisma = {
      notificationDelivery: {
        findUniqueOrThrow: vi.fn(async () => delivery),
        update,
      },
      providerConfig: {
        findMany: vi.fn(async () => [
          {
            name: 'feishu',
            type: 'notification',
            enabled: true,
            priority: 1,
            encryptedCredentials: Buffer.from('https://provider.example/webhook'),
          },
        ]),
      },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ code: 19002, msg: 'bad webhook' }), { status: 200 })),
    );
    const service = new NotificationService(prisma as never, redis as never, { record: vi.fn() } as never);

    await expect(
      service.dispatchOne('delivery-1', new Date('2026-08-20T10:01:00Z'), message),
    ).resolves.toMatchObject({ skipped: false, delivery: { status: 'retrying' } });
    expect(update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'delivered' }) }),
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'retrying',
          errorCode: 'feishu_business_19002',
          scheduledAt: expect.any(Date),
        }),
      }),
    );
  });

  it('并发 dispatcher 对同一 delivery 只实际发送一次', async () => {
    const redis = redisFixture();
    const delivery = {
      id: 'delivery-1',
      eventId: 'event-1',
      channel: 'feishu',
      provider: 'feishu',
      severity: 'warning',
      status: 'pending',
      attemptCount: 0,
      scheduledAt: new Date('2026-08-20T10:00:00Z'),
    };
    const prisma = {
      notificationDelivery: {
        findUniqueOrThrow: vi.fn(async () => delivery),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          ...delivery,
          ...data,
          status: data.status,
        })),
      },
      providerConfig: {
        findMany: vi.fn(async () => [
          {
            name: 'feishu',
            type: 'notification',
            enabled: true,
            priority: 1,
            encryptedCredentials: Buffer.from('https://provider.example/webhook'),
          },
        ]),
      },
    };
    let release: (() => void) | undefined;
    const fetchMock = vi.fn(
      async () =>
        new Promise<Response>((resolve) => {
          release = () => resolve(new Response(JSON.stringify({ code: 0 }), { status: 200 }));
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const service = new NotificationService(prisma as never, redis as never, { record: vi.fn() } as never);
    const now = new Date('2026-08-20T10:01:00Z');

    const first = service.dispatchOne('delivery-1', now, message);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    await expect(service.dispatchOne('delivery-1', now, message)).resolves.toMatchObject({
      skipped: true,
      reason: '通知已有 dispatcher 处理',
    });
    release?.();
    await expect(first).resolves.toMatchObject({ skipped: false, delivery: { status: 'delivered' } });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('只消费 pending/retrying 且 scheduledAt 已到期的 delivery', async () => {
    const now = new Date('2026-08-20T10:01:00Z');
    const due = [
      { id: 'pending-1' },
      { id: 'retrying-1' },
    ];
    const prisma = {
      notificationDelivery: {
        findMany: vi.fn(async () => due),
      },
    };
    const service = new NotificationService(prisma as never, redisFixture() as never, { record: vi.fn() } as never);
    const dispatchOne = vi
      .spyOn(service, 'dispatchOne')
      .mockResolvedValue({ skipped: false, delivery: { status: 'delivered' } } as never);

    await service.dispatchDue(now);

    expect(prisma.notificationDelivery.findMany).toHaveBeenCalledWith({
      where: {
        status: { in: ['pending', 'retrying'] },
        scheduledAt: { lte: now },
      },
      orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
      take: 100,
    });
    expect(dispatchOne).toHaveBeenCalledTimes(2);
  });
});

describe('NotificationDispatcher', () => {
  it('runNow 自动驱动 due delivery 消费', async () => {
    const now = new Date('2026-08-20T10:01:00Z');
    const notifications = { dispatchDue: vi.fn(async () => [{ skipped: false }]) };
    const dispatcher = new NotificationDispatcher(notifications as never);

    await expect(dispatcher.runNow(now)).resolves.toEqual({
      skipped: false,
      deliveries: [{ skipped: false }],
    });
    expect(notifications.dispatchDue).toHaveBeenCalledWith(now);
  });
});
