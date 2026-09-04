import { describe, expect, it, vi } from 'vitest';
import { ProviderHealthService } from '../../src/providers/provider-health.service.js';
import { ProviderHealthScheduler } from '../../src/providers/provider-health.scheduler.js';
import { ProviderConfigService } from '../../src/providers/provider-config.service.js';

describe('Provider 健康状态', () => {
  it('连续失败进入 down，恢复后回到 healthy，并持久化最近状态', async () => {
    const records = new Map<string, { consecutiveFailures: number }>();
    const prisma = {
      providerHealth: {
        findUnique: vi.fn(
          async ({ where }: { where: { provider: string } }) => records.get(where.provider) ?? null,
        ),
        upsert: vi.fn(
          async ({
            where,
            update,
          }: {
            where: { provider: string };
            update: { state: string; consecutiveFailures: number };
          }) => {
            records.set(where.provider, update);
            return { provider: where.provider, ...update };
          },
        ),
      },
    };
    const service = new ProviderHealthService(prisma as never, {} as never);
    await service.record('dsa', false, 10);
    await service.record('dsa', false, 20);
    await expect(service.record('dsa', false, 30)).resolves.toMatchObject({ state: 'down' });
    await expect(service.record('dsa', true, 10)).resolves.toMatchObject({
      state: 'healthy',
      consecutiveFailures: 0,
    });
  });

  it('统一 Provider 名称并记录健康检查来源', async () => {
    const createHistory = vi.fn(async ({ data }: { data: object }) => data);
    const prisma = {
      providerHealth: {
        findUnique: vi.fn(async () => null),
        upsert: vi.fn(async ({ create }: { create: object }) => create),
      },
      providerHealthCheck: { create: createHistory },
    };
    const service = new ProviderHealthService(prisma as never, {} as never);
    const checkedAt = new Date('2026-08-12T00:00:00.000Z');

    await service.record('feishu-webhook', true, 12, undefined, checkedAt, 'scheduled');

    expect(createHistory).toHaveBeenCalledWith({
      data: {
        provider: 'feishu',
        state: 'healthy',
        latencyMs: 12,
        errorCode: null,
        source: 'scheduled',
        checkedAt,
      },
    });
  });

  it('按页读取健康历史并限制每页数量', async () => {
    const count = vi.fn(async () => 45);
    const findMany = vi.fn(async () => [
      {
        id: 'health-check-21',
        provider: 'feishu',
        state: 'healthy',
        latencyMs: 12,
        errorCode: null,
        source: 'scheduled',
        checkedAt: new Date('2026-08-12T00:00:00.000Z'),
      },
    ]);
    const service = new ProviderHealthService(
      { providerHealthCheck: { count, findMany } } as never,
      {} as never,
    );

    await expect(service.history('feishu-webhook', 2, 20)).resolves.toMatchObject({
      page: 2,
      pageSize: 20,
      total: 45,
      totalPages: 3,
      items: [{ id: 'health-check-21' }],
    });
    expect(count).toHaveBeenCalledWith({ where: { provider: 'feishu' } });
    expect(findMany).toHaveBeenCalledWith({
      where: { provider: 'feishu' },
      orderBy: [{ checkedAt: 'desc' }, { id: 'desc' }],
      skip: 20,
      take: 20,
    });
  });

  it('定时调度器使用 scheduled 来源并避免并发探测', async () => {
    let release: (() => void) | undefined;
    const checkAll = vi.fn(
      () =>
        new Promise((resolve) => {
          release = () => resolve([{ state: 'healthy' }]);
        }),
    );
    const scheduler = new ProviderHealthScheduler({ checkAll } as never);

    const first = scheduler.runNow();
    await expect(scheduler.runNow()).resolves.toMatchObject({
      skipped: true,
      reason: '健康检查已有实例运行',
    });
    release?.();
    await expect(first).resolves.toMatchObject({ skipped: false });
    expect(checkAll).toHaveBeenCalledWith('scheduled');
  });
});

describe('专业 Provider 配置', () => {
  const createProviderHealthStub = () => ({
    record: vi.fn(
      async (
        provider: string,
        success: boolean,
        latencyMs: number,
        _errorCode?: string,
        checkedAt = new Date(),
      ) => ({
        provider,
        state: success ? 'healthy' : 'degraded',
        latencyMs,
        checkedAt,
      }),
    ),
  });

  it('保存配置时不回显密钥，连通性与额度状态可查询', async () => {
    const prisma = {
      providerConfig: {
        upsert: vi.fn(async ({ create }: { create: object }) => ({ name: 'tushare', ...create })),
        findUnique: vi.fn(async () => ({
          name: 'tushare',
          enabled: true,
          encryptedCredentials: Buffer.from('cipher'),
          quota: { limit: 100, used: 95 },
        })),
        findMany: vi.fn(async () => []),
        update: vi.fn(async ({ data }: { data: object }) => ({
          name: 'tushare',
          enabled: true,
          quota: { limit: 100, used: 95 },
          ...data,
        })),
      },
    };
    const service = new ProviderConfigService(prisma as never, createProviderHealthStub() as never);
    const saved = await service.save({
      name: 'tushare',
      type: 'tushare',
      priority: 1,
      capabilities: ['quote', 'financials'],
      credentialsRef: 'secret-ref',
      quota: { limit: 100, used: 95 },
    });
    expect(saved).toMatchObject({ credentialConfigured: true });
    expect(saved).not.toHaveProperty('credentialsRef');
    expect(saved).not.toHaveProperty('encryptedCredentials');
    await expect(service.test('tushare')).resolves.toMatchObject({ credentialConfigured: true });
    await expect(service.usage('tushare')).resolves.toMatchObject({
      state: 'warning',
      remaining: 5,
    });
  });

  it('连接测试按凭证形态识别渠道，Provider 名称不影响结果', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => JSON.stringify({ code: 0, msg: 'success' }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const prisma = {
        providerConfig: { findUnique: vi.fn(async () => null) },
      };
      const service = new ProviderConfigService(
        prisma as never,
        createProviderHealthStub() as never,
      );
      const draft = {
        name: '飞书',
        type: 'notification',
        priority: 1,
        capabilities: ['notification'],
        credentialsRef: 'https://open.feishu.cn/open-apis/bot/v2/hook/test',
      };

      await expect(service.testDraft(draft)).resolves.toMatchObject({ status: 'healthy' });
      await expect(
        service.testDraft({ ...draft, credentialsRef: 'https://example.com/hook' }),
      ).resolves.toMatchObject({
        status: 'untested',
        message: expect.stringContaining('凭证不是受支持的 Feishu/Lark Webhook 地址'),
      });
      await expect(service.testDraft({ ...draft, type: 'tushare' })).resolves.toMatchObject({
        status: 'untested',
        message: '该类型 Provider 尚未接入连接测试插件',
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('可在保存前测试飞书草稿，并在随后保存时保留成功状态', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => JSON.stringify({ code: 0, msg: 'success' }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const prisma = {
        providerConfig: {
          upsert: vi.fn(async ({ create }: { create: object }) => ({ name: 'feishu', ...create })),
          findUnique: vi.fn(async () => null),
          findMany: vi.fn(async () => []),
          update: vi.fn(async ({ data }: { data: object }) => ({ name: 'feishu', ...data })),
        },
      };
      const service = new ProviderConfigService(
        prisma as never,
        createProviderHealthStub() as never,
      );
      const draft = {
        name: 'feishu',
        type: 'notification',
        priority: 1,
        capabilities: ['notification'],
        credentialsRef: 'https://open.feishu.cn/open-apis/bot/v2/hook/test',
      };
      const result = await service.testDraft(draft);
      expect(result).toMatchObject({ status: 'healthy', message: '测试成功' });
      expect(result.testToken).toEqual(expect.any(String));
      expect(fetchMock).toHaveBeenCalledTimes(1);
      if (!result.testToken) throw new Error('测试成功但没有返回测试令牌');

      await expect(
        service.save({ ...draft, connectionTestToken: result.testToken }),
      ).resolves.toMatchObject({
        health: 'healthy',
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('编辑已配置的飞书 Provider 时复用 Uint8Array 凭证', async () => {
    const webhook = 'https://open.feishu.cn/open-apis/bot/v2/hook/test';
    const fetchMock = vi.fn(async (url: URL) => {
      expect(url.toString()).toBe(webhook);
      return {
        ok: true,
        text: async () => JSON.stringify({ code: 0, msg: 'success' }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const prisma = {
        providerConfig: {
          upsert: vi.fn(async ({ update }: { update: object }) => ({ name: 'feishu', ...update })),
          findUnique: vi.fn(async () => ({
            name: 'feishu',
            type: 'notification',
            enabled: true,
            encryptedCredentials: Uint8Array.from(Buffer.from(webhook)),
          })),
          findMany: vi.fn(async () => []),
          update: vi.fn(async ({ data }: { data: object }) => ({ name: 'feishu', ...data })),
        },
      };
      const service = new ProviderConfigService(
        prisma as never,
        createProviderHealthStub() as never,
      );
      const draft = {
        name: 'feishu',
        type: 'notification',
        priority: 1,
        capabilities: ['notification'],
      };

      const result = await service.testDraft(draft);
      expect(result).toMatchObject({ status: 'healthy', message: '测试成功' });
      expect(result.testToken).toEqual(expect.any(String));
      if (!result.testToken) throw new Error('测试成功但没有返回测试令牌');
      await expect(service.testDraft({ ...draft, credentialsRef: '' })).resolves.toMatchObject({
        status: 'healthy',
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);

      await expect(
        service.save({ ...draft, connectionTestToken: result.testToken }),
      ).resolves.toMatchObject({ health: 'healthy' });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('保存通过草稿测试的新 Webhook 后仍可从 Provider 列表再次测试', async () => {
    const webhook = 'https://open.feishu.cn/open-apis/bot/v2/hook/replaced';
    const fetchMock = vi.fn(async (url: URL) => {
      expect(url.toString()).toBe(webhook);
      return {
        ok: true,
        text: async () => JSON.stringify({ code: 0, msg: 'success' }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      let stored: Record<string, unknown> = {
        name: 'feishu',
        type: 'notification',
        enabled: true,
        priority: 1,
        capabilities: ['notification'],
        encryptedCredentials: Buffer.from('old-webhook'),
        health: 'down',
      };
      const prisma = {
        providerConfig: {
          findUnique: vi.fn(async () => stored),
          findMany: vi.fn(async () => [stored]),
          upsert: vi.fn(async ({ update }: { update: Record<string, unknown> }) => {
            stored = { ...stored, ...update };
            return stored;
          }),
          update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
            stored = { ...stored, ...data };
            return stored;
          }),
        },
      };
      const providerHealth = createProviderHealthStub();
      const service = new ProviderConfigService(prisma as never, providerHealth as never);
      const draft = {
        name: 'feishu',
        type: 'notification',
        priority: 1,
        capabilities: ['notification'],
        credentialsRef: webhook,
      };

      const result = await service.testDraft(draft);
      if (!result.testToken) throw new Error('测试成功但没有返回测试令牌');
      const saved = await service.save({
        name: draft.name,
        type: draft.type,
        priority: draft.priority,
        capabilities: draft.capabilities,
        connectionTestToken: result.testToken,
      });

      const encryptedCredential = Buffer.from(stored.encryptedCredentials as Uint8Array).toString(
        'utf8',
      );
      expect(encryptedCredential).not.toContain(webhook);
      expect(encryptedCredential).toContain('"algorithm":"aes-256-gcm"');
      expect(stored.health).toBe('healthy');
      expect(saved).toMatchObject({ credentialConfigured: true, health: 'healthy' });
      expect(saved).not.toHaveProperty('encryptedCredentials');
      await expect(service.test('feishu')).resolves.toMatchObject({ status: 'healthy' });
      expect(providerHealth.record).toHaveBeenCalledWith(
        'feishu',
        true,
        expect.any(Number),
        undefined,
        expect.any(Date),
        'manual',
      );
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
