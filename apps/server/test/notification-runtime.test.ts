import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotificationDispatcher } from '../src/notifications/notification.dispatcher.js';
import {
  FeishuWebhookProvider,
  NotificationService,
  type NotificationMessage,
  type NotificationPolicy,
  notificationRiskFingerprint,
} from '../src/notifications/notification.service.js';
import { encryptProviderCredential } from '../src/platform/credential-security.js';

const providerWebhook = 'https://open.feishu.cn/open-apis/bot/v2/hook/provider-test';

const message: NotificationMessage = {
  title: '风险提醒',
  body: '测试消息',
  severity: 'warning',
  traceId: 'trace-1',
};

const policy: NotificationPolicy = {
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
        async (key: string, value: string, _mode: string, _ttl: number, modifier: string) => {
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

/** 已配置且启用、带有效飞书 webhook 的 notification provider。 */
const providerConfigFixture = (webhook = providerWebhook) => ({
  findMany: vi.fn(async () => [
    {
      name: 'feishu',
      type: 'notification',
      enabled: true,
      priority: 1,
      encryptedCredentials: encryptProviderCredential(webhook),
    },
  ]),
});

const riskRule = {
  kind: 'price-below',
  threshold: 100,
  condition: { operator: '<' },
  parameters: { window: 1 },
};

const riskSubject = (
  id: string,
  symbol = '600519.SH',
  accountId = 'account-1',
  severity: NotificationMessage['severity'] = 'warning',
) => ({
  type: 'risk-event',
  id,
  dedupKey: notificationRiskFingerprint({
    ruleId: 'rule-1',
    accountId,
    symbol,
    severity,
    kind: riskRule.kind,
    threshold: riskRule.threshold,
    condition: riskRule.condition,
    parameters: riskRule.parameters,
  }),
});

const riskMessage = (
  traceId: string,
  severity: NotificationMessage['severity'] = 'warning',
): NotificationMessage => ({
  title: '风险提醒',
  body: '价格跌破阈值',
  severity,
  traceId,
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Feishu provider', () => {
  it('HTTP 200 但业务码非 0 时仍视为失败', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ code: 19002, msg: 'invalid webhook' }), { status: 200 }),
      ),
    );
    const provider = new FeishuWebhookProvider(
      'https://open.feishu.cn/open-apis/bot/v2/hook/business-error',
    );
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
      notificationDelivery: { upsert },
      providerConfig: providerConfigFixture(),
    };
    const service = new NotificationService(
      prisma as never,
      redis as never,
      { record: vi.fn() } as never,
    );

    const first = await service.enqueue(
      riskSubject('event-a'),
      riskMessage('trace-event-a'),
      policy,
      new Date('2026-08-20T10:00:00Z'),
    );
    const second = await service.enqueue(
      riskSubject('event-b'),
      riskMessage('trace-event-b'),
      policy,
      new Date('2026-08-20T10:01:00Z'),
    );

    expect(first[0]).not.toBeNull();
    expect(second).toEqual([null]);
    expect(upsert).toHaveBeenCalledOnce();
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          subjectType: 'risk-event',
          subjectId: 'event-a',
          message: riskMessage('trace-event-a'),
          severity: 'warning',
        }),
      }),
    );
  });

  it('不同 symbol 或 account 不会互相误去重', async () => {
    const redis = redisFixture();
    const upsert = vi.fn(async ({ create }: { create: object }) => create);
    const prisma = {
      notificationDelivery: { upsert },
      providerConfig: providerConfigFixture(),
    };
    const service = new NotificationService(
      prisma as never,
      redis as never,
      { record: vi.fn() } as never,
    );

    await service.enqueue(
      riskSubject('event-a', '600519.SH', 'account-1'),
      riskMessage('trace-event-a'),
      policy,
    );
    await service.enqueue(
      riskSubject('event-b', '000001.SZ', 'account-2'),
      riskMessage('trace-event-b'),
      policy,
    );

    expect(upsert).toHaveBeenCalledTimes(2);
  });

  it('critical 可按 policy 绕过 cooldown', async () => {
    const redis = redisFixture();
    const upsert = vi.fn(async ({ create }: { create: object }) => create);
    const prisma = {
      notificationDelivery: { upsert },
      providerConfig: providerConfigFixture(),
    };
    const service = new NotificationService(
      prisma as never,
      redis as never,
      { record: vi.fn() } as never,
    );

    await service.enqueue(
      riskSubject('critical-a', '600519.SH', 'account-1', 'critical'),
      riskMessage('trace-critical-a', 'critical'),
      policy,
    );
    await service.enqueue(
      riskSubject('critical-b', '600519.SH', 'account-1', 'critical'),
      riskMessage('trace-critical-b', 'critical'),
      policy,
    );

    expect(upsert).toHaveBeenCalledTimes(2);
    expect(redis.client.set).not.toHaveBeenCalled();
  });
});

describe('Notification provider gating', () => {
  const enqueueWith = async (providerConfig: unknown) => {
    const redis = redisFixture();
    const upsert = vi.fn(async ({ create }: { create: object }) => create);
    const service = new NotificationService(
      { notificationDelivery: { upsert }, providerConfig } as never,
      redis as never,
      { record: vi.fn() } as never,
    );
    const result = await service.enqueue(
      riskSubject('event-a'),
      riskMessage('trace-event-a'),
      policy,
    );
    return { result, upsert, redis };
  };

  it('没有配置通知 provider 时直接跳过入队，不占用 cooldown', async () => {
    const { result, upsert, redis } = await enqueueWith({ findMany: vi.fn(async () => []) });

    expect(result).toEqual([]);
    expect(upsert).not.toHaveBeenCalled();
    expect(redis.client.set).not.toHaveBeenCalled();
  });

  it('provider 凭据为空时同样跳过入队', async () => {
    const { result, upsert } = await enqueueWith(providerConfigFixture('   '));

    expect(result).toEqual([]);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('provider 被禁用时不入队', async () => {
    const findMany = vi.fn(async () => []);
    const { result, upsert } = await enqueueWith({
      findMany,
    });

    expect(result).toEqual([]);
    expect(upsert).not.toHaveBeenCalled();
    expect(findMany).toHaveBeenCalledWith({
      where: { type: 'notification', enabled: true },
      orderBy: [{ priority: 'asc' }, { name: 'asc' }],
    });
  });

  it('没有投递适配器的 Provider 直接跳过，不产生必然失败的投递', async () => {
    const { result, upsert } = await enqueueWith({
      findMany: vi.fn(async () => [
        {
          name: 'email',
          type: 'notification',
          enabled: true,
          priority: 1,
          encryptedCredentials: encryptProviderCredential('secret'),
        },
      ]),
    });

    expect(result).toEqual([]);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('渠道可用时正常入队', async () => {
    const { result, upsert } = await enqueueWith(providerConfigFixture());

    expect(result).toHaveLength(1);
    expect(upsert).toHaveBeenCalledOnce();
  });

  it('同一渠道按 Provider 优先级选择一个配置并公开无凭证路由摘要', async () => {
    const providerConfig = {
      findMany: vi.fn(async () => [
        {
          name: 'lark-webhook',
          type: 'notification',
          enabled: true,
          priority: 1,
          encryptedCredentials: encryptProviderCredential(providerWebhook),
        },
        {
          name: 'feishu',
          type: 'notification',
          enabled: true,
          priority: 2,
          encryptedCredentials: encryptProviderCredential(providerWebhook),
        },
      ]),
    };
    const { result, upsert } = await enqueueWith(providerConfig);
    const service = new NotificationService({ providerConfig } as never, {} as never, {} as never);

    expect(result).toHaveLength(1);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ channel: 'feishu', provider: 'lark-webhook' }),
      }),
    );
    await expect(service.routing()).resolves.toEqual({
      routes: [{ channel: 'feishu', provider: 'lark-webhook' }],
    });
  });
});

describe('Notification dispatch', () => {
  it('风险提示标题不重复证券名称，正文使用事件消息', async () => {
    const redis = redisFixture();
    const delivery = {
      id: 'delivery-1',
      subjectType: 'risk-event',
      subjectId: 'event-1',
      message,
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
            encryptedCredentials: encryptProviderCredential(providerWebhook),
          },
        ]),
      },
    };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ code: 0 }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const service = new NotificationService(
      prisma as never,
      redis as never,
      { record: vi.fn() } as never,
    );

    await service.dispatchOne('delivery-1', new Date('2026-08-20T10:01:00Z'));

    expect(fetchMock).toHaveBeenCalledWith(
      new URL(providerWebhook),
      expect.objectContaining({
        body: expect.stringContaining('风险提醒\\n测试消息'),
      }),
    );
  });

  it('事件上下文中的证券名称不会重复拼入通知标题', async () => {
    const redis = redisFixture();
    const delivery = {
      id: 'delivery-context-name',
      subjectType: 'risk-event',
      subjectId: 'event-context-name',
      message,
      channel: 'feishu',
      provider: 'feishu',
      severity: 'warning',
      status: 'pending',
      attemptCount: 0,
      scheduledAt: new Date('2026-08-20T10:00:00Z'),
    };
    const assetLookup = vi.fn(async () => Promise.reject(new Error('asset db down')));
    const riskEventLookup = vi.fn();
    const prisma = {
      notificationDelivery: {
        findUniqueOrThrow: vi.fn(async () => delivery),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          ...delivery,
          ...data,
          status: data.status,
        })),
      },
      riskEvent: {
        findUnique: riskEventLookup,
      },
      asset: { findUnique: assetLookup },
      providerConfig: {
        findMany: vi.fn(async () => [
          {
            name: 'feishu',
            type: 'notification',
            enabled: true,
            priority: 1,
            encryptedCredentials: encryptProviderCredential(providerWebhook),
          },
        ]),
      },
    };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ code: 0 }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const service = new NotificationService(
      prisma as never,
      redis as never,
      { record: vi.fn() } as never,
    );

    await expect(
      service.dispatchOne('delivery-context-name', new Date('2026-08-20T10:01:00Z')),
    ).resolves.toMatchObject({ skipped: false, delivery: { status: 'delivered' } });
    expect(riskEventLookup).not.toHaveBeenCalled();
    expect(assetLookup).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      new URL(providerWebhook),
      expect.objectContaining({
        body: expect.stringContaining('风险提醒\\n测试消息'),
      }),
    );
  });

  it('实际发送使用 ProviderConfig 中的凭证', async () => {
    const redis = redisFixture();
    const delivery = {
      id: 'delivery-1',
      subjectType: 'risk-event',
      subjectId: 'event-1',
      message,
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
            encryptedCredentials: encryptProviderCredential(providerWebhook),
          },
        ]),
      },
    };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ code: 0 }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const service = new NotificationService(
      prisma as never,
      redis as never,
      { record: vi.fn() } as never,
    );

    await expect(
      service.dispatchOne('delivery-1', new Date('2026-08-20T10:01:00Z'), message),
    ).resolves.toMatchObject({ skipped: false, delivery: { status: 'delivered' } });
    expect(fetchMock).toHaveBeenCalledWith(new URL(providerWebhook), expect.any(Object));
  });

  it('业务错误进入 retrying，而不是 delivered', async () => {
    const redis = redisFixture();
    const delivery = {
      id: 'delivery-1',
      subjectType: 'risk-event',
      subjectId: 'event-1',
      message,
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
            encryptedCredentials: encryptProviderCredential(providerWebhook),
          },
        ]),
      },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ code: 19002, msg: 'bad webhook' }), { status: 200 }),
      ),
    );
    const service = new NotificationService(
      prisma as never,
      redis as never,
      { record: vi.fn() } as never,
    );

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
      subjectType: 'risk-event',
      subjectId: 'event-1',
      message,
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
            encryptedCredentials: encryptProviderCredential(providerWebhook),
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
    const service = new NotificationService(
      prisma as never,
      redis as never,
      { record: vi.fn() } as never,
    );
    const now = new Date('2026-08-20T10:01:00Z');

    const first = service.dispatchOne('delivery-1', now, message);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    await expect(service.dispatchOne('delivery-1', now, message)).resolves.toMatchObject({
      skipped: true,
      reason: '通知已有 dispatcher 处理',
    });
    release?.();
    await expect(first).resolves.toMatchObject({
      skipped: false,
      delivery: { status: 'delivered' },
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('只消费 pending/retrying 且 scheduledAt 已到期的 delivery', async () => {
    const now = new Date('2026-08-20T10:01:00Z');
    const due = [{ id: 'pending-1' }, { id: 'retrying-1' }];
    const prisma = {
      notificationDelivery: {
        findMany: vi.fn(async () => due),
      },
    };
    const service = new NotificationService(
      prisma as never,
      redisFixture() as never,
      { record: vi.fn() } as never,
    );
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
