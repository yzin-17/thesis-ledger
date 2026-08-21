import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  decryptProviderCredential,
  encryptProviderCredential,
  normalizeProviderCredential,
  type CredentialKeyRing,
} from '../src/platform/credential-security.js';
import {
  authorizedBearer,
  resolveServerNetworkSecurity,
} from '../src/platform/network-security.js';
import { assertAllowedFeishuWebhookUrl } from '../src/notifications/feishu-webhook-security.js';
import { ProviderConfigService } from '../src/providers/provider-config.service.js';
import { LedgerService } from '../src/ledger/ledger.service.js';
import { ImportService } from '../src/imports/import.service.js';
import { IntegrityService } from '../src/integrity/integrity.service.js';

const ring = (activeVersion: string, keys: Record<string, Buffer>): CredentialKeyRing => ({
  activeVersion,
  keys: new Map(Object.entries(keys)),
});

const providerHealthStub = () => ({
  record: vi.fn(async (provider: string, success: boolean, latencyMs: number) => ({
    provider,
    state: success ? 'healthy' : 'degraded',
    latencyMs,
    checkedAt: new Date(),
  })),
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Provider credential security', () => {
  it('AES-GCM 密文不包含明文且错误 key 无法解密', () => {
    const secret = 'https://open.feishu.cn/open-apis/bot/v2/hook/secret-id';
    const first = ring('v1', { v1: Buffer.alloc(32, 1) });
    const encrypted = encryptProviderCredential(secret, first);

    expect(encrypted.toString('utf8')).not.toContain(secret);
    expect(decryptProviderCredential(encrypted, first)).toMatchObject({
      credential: secret,
      keyVersion: 'v1',
      legacyPlaintext: false,
      needsRotation: false,
    });
    expect(() =>
      decryptProviderCredential(encrypted, ring('v1', { v1: Buffer.alloc(32, 9) })),
    ).toThrow();
  });

  it('旧 keyVersion 与历史明文都可安全迁移到 active key', () => {
    const secret = 'provider-secret';
    const v1 = Buffer.alloc(32, 1);
    const v2 = Buffer.alloc(32, 2);
    const oldPayload = encryptProviderCredential(secret, ring('v1', { v1 }));
    const rotating = ring('v2', { v1, v2 });

    const rotated = normalizeProviderCredential(oldPayload, rotating);
    expect(rotated.needsRotation).toBe(true);
    expect(rotated.payload.equals(oldPayload)).toBe(false);
    expect(decryptProviderCredential(rotated.payload, rotating)).toMatchObject({
      credential: secret,
      keyVersion: 'v2',
      needsRotation: false,
    });

    const legacy = normalizeProviderCredential(Buffer.from(secret), rotating);
    expect(legacy.legacyPlaintext).toBe(true);
    expect(legacy.payload.toString('utf8')).not.toContain(secret);
    expect(decryptProviderCredential(legacy.payload, rotating).credential).toBe(secret);
  });

  it('ProviderConfig 新写入凭证不会以明文进入 DB mock', async () => {
    let storedCredential: Uint8Array | undefined;
    const prisma = {
      providerConfig: {
        findUnique: vi.fn(async () => null),
        upsert: vi.fn(async ({ create }: { create: Record<string, unknown> }) => {
          storedCredential = create.encryptedCredentials as Uint8Array;
          return { name: 'tushare', health: 'unknown', ...create };
        }),
      },
    };
    const service = new ProviderConfigService(prisma as never, providerHealthStub() as never);

    await service.save({
      name: 'tushare',
      type: 'tushare',
      priority: 1,
      capabilities: ['quote'],
      credentialsRef: 'plain-provider-secret',
    });

    expect(storedCredential).toBeDefined();
    expect(Buffer.from(storedCredential!).toString('utf8')).not.toContain('plain-provider-secret');
    expect(decryptProviderCredential(storedCredential!).credential).toBe('plain-provider-secret');
  });

  it('未消费的 draft credential 五分钟后自动过期且 token 不可复用', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-20T10:00:00Z'));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ code: 0 }), { status: 200 })),
    );
    const upsert = vi.fn(async ({ create }: { create: Record<string, unknown> }) => ({
      name: 'feishu',
      health: 'unknown',
      ...create,
    }));
    const prisma = {
      providerConfig: {
        findUnique: vi.fn(async () => null),
        upsert,
      },
    };
    const service = new ProviderConfigService(prisma as never, providerHealthStub() as never);
    const draft = await service.testDraft({
      name: 'feishu',
      type: 'notification',
      priority: 1,
      capabilities: ['notification'],
      credentialsRef: 'https://open.feishu.cn/open-apis/bot/v2/hook/test-token',
    });
    expect(draft.testToken).toEqual(expect.any(String));
    if (!draft.testToken) throw new Error('测试成功但没有返回 draft token');

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1);
    await service.save({
      name: 'feishu',
      type: 'notification',
      priority: 1,
      capabilities: ['notification'],
      connectionTestToken: draft.testToken,
    });

    const create = (upsert.mock.calls[0]![0] as { create: Record<string, unknown> }).create;
    expect(create).not.toHaveProperty('encryptedCredentials');
  });
});

describe('Feishu SSRF boundary', () => {
  it('只接受官方 HTTPS webhook 地址', () => {
    expect(
      assertAllowedFeishuWebhookUrl('https://open.feishu.cn/open-apis/bot/v2/hook/abc123').hostname,
    ).toBe('open.feishu.cn');
    expect(
      assertAllowedFeishuWebhookUrl('https://open.larksuite.com/open-apis/bot/v2/hook/abc123')
        .hostname,
    ).toBe('open.larksuite.com');
    expect(() =>
      assertAllowedFeishuWebhookUrl('http://open.feishu.cn/open-apis/bot/v2/hook/abc'),
    ).toThrow('HTTPS');
    expect(() =>
      assertAllowedFeishuWebhookUrl('https://127.0.0.1/open-apis/bot/v2/hook/abc'),
    ).toThrow('官方');
    expect(() =>
      assertAllowedFeishuWebhookUrl('https://169.254.169.254/open-apis/bot/v2/hook/abc'),
    ).toThrow('官方');
    expect(() => assertAllowedFeishuWebhookUrl('https://open.feishu.cn/internal/admin')).toThrow(
      '路径',
    );
  });
});

describe('Server network exposure', () => {
  it('默认 desktop-local 只绑定 loopback', () => {
    expect(resolveServerNetworkSecurity({})).toEqual({
      mode: 'desktop-local',
      host: '127.0.0.1',
    });
  });

  it('LAN 暴露必须显式配置足够长度的 API token', () => {
    expect(() => resolveServerNetworkSecurity({ SERVER_EXPOSURE_MODE: 'lan' })).toThrow(
      'THESIS_LEDGER_API_TOKEN',
    );
    expect(
      resolveServerNetworkSecurity({
        SERVER_EXPOSURE_MODE: 'lan',
        THESIS_LEDGER_API_TOKEN: '0123456789abcdef',
      }),
    ).toEqual({
      mode: 'lan',
      host: '0.0.0.0',
      apiToken: '0123456789abcdef',
    });
    expect(authorizedBearer('Bearer 0123456789abcdef', '0123456789abcdef')).toBe(true);
    expect(authorizedBearer('Bearer wrong-token-value', '0123456789abcdef')).toBe(false);
  });
});

describe('Ledger transactional migration', () => {
  it('Position migration 的读写和 rebuild 都在同一 transaction client', async () => {
    const ledgerEvents: Array<Record<string, unknown>> = [];
    const tx = {
      position: {
        findMany: vi.fn(async () => [
          {
            id: '11111111-1111-4111-8111-111111111115',
            accountId: '11111111-1111-4111-8111-111111111111',
            symbol: '600519.SH',
            quantity: 10,
            costPrice: 100,
          },
        ]),
        deleteMany: vi.fn(async () => ({ count: 1 })),
        create: vi.fn(async ({ data }: { data: object }) => data),
      },
      asset: {
        findUnique: vi.fn(async () => null),
        upsert: vi.fn(async ({ create }: { create: object }) => create),
      },
      ledgerEvent: {
        upsert: vi.fn(async ({ create }: { create: Record<string, unknown> }) => {
          ledgerEvents.push(create);
          return create;
        }),
        findMany: vi.fn(async () =>
          ledgerEvents.map((event) => ({
            ...event,
            occurredAt: event.occurredAt as Date,
            symbol: event.symbol ?? null,
            quantity: event.quantity ?? null,
            price: event.price ?? null,
            amount: event.amount ?? null,
            fee: event.fee ?? null,
            tax: event.tax ?? null,
            source: event.source ?? null,
            correctionOf: event.correctionOf ?? null,
            metadata: event.metadata,
          })),
        ),
      },
    };
    const transaction = vi.fn(async (operation: (client: typeof tx) => unknown) => operation(tx));
    const service = new LedgerService({ $transaction: transaction } as never);

    await expect(service.migratePositions()).resolves.toMatchObject({
      migrated: [{ symbol: '600519.SH', quantity: 10, costPrice: 100 }],
    });
    expect(transaction).toHaveBeenCalledOnce();
    expect(tx.position.findMany).toHaveBeenCalledOnce();
    expect(tx.ledgerEvent.upsert).toHaveBeenCalledOnce();
    expect(tx.position.deleteMany).toHaveBeenCalledOnce();
    expect(tx.position.create).toHaveBeenCalledOnce();
  });
});

describe('Screenshot rollback protection', () => {
  it('导入提交后同账户同标的出现新 Ledger 事件时拒绝自动回滚', async () => {
    const append = vi.fn();
    const tx = {
      importDraft: {
        findUnique: vi.fn(async () => ({
          id: '11111111-1111-4111-8111-111111111114',
          accountId: '11111111-1111-4111-8111-111111111111',
          status: 'committed',
          committedAt: new Date('2026-08-20T10:00:00Z'),
          beforeState: [{ symbol: '600519.SH', quantity: 5, costPrice: 90 }],
          rows: [{ symbol: '600519.SH' }],
        })),
        update: vi.fn(),
      },
      ledgerEvent: {
        findFirst: vi.fn(async () => ({
          id: 'manual-after-import',
          symbol: '600519.SH',
          createdAt: new Date('2026-08-20T10:05:00Z'),
        })),
        upsert: append,
      },
    };
    const prisma = {
      $transaction: (operation: (client: typeof tx) => unknown) => operation(tx),
    };
    const service = new ImportService(prisma as never);

    await expect(service.rollback('11111111-1111-4111-8111-111111111114')).rejects.toThrow(
      '已有新的 Ledger 事件',
    );
    expect(append).not.toHaveBeenCalled();
    expect(tx.importDraft.update).not.toHaveBeenCalled();
  });
});

describe('Integrity position projection', () => {
  const event = (
    id: string,
    type: 'BUY' | 'SELL',
    quantity: number,
    price: number,
    occurredAt: string,
  ) => ({
    id,
    accountId: 'account-1',
    type,
    occurredAt: new Date(occurredAt),
    symbol: '600519.SH',
    quantity,
    price,
    amount: null,
    fee: null,
    tax: null,
    externalId: id,
    metadata: null,
  });

  it('Ledger 投影归零时不要求 DB Position 存在', async () => {
    const service = new IntegrityService({
      account: {
        findMany: vi.fn(async () => [
          {
            id: 'account-1',
            ledger: [
              event('buy', 'BUY', 10, 100, '2026-08-19T10:00:00Z'),
              event('sell', 'SELL', 10, 110, '2026-08-20T10:00:00Z'),
            ],
            positions: [],
            snapshots: [],
          },
        ]),
      },
    } as never);

    const result = await service.check();
    expect(result.issues.filter((issue) => issue.code === 'position_projection_mismatch')).toEqual(
      [],
    );
  });

  it('DB Position 存在但 Ledger 无非零投影时报告反向不一致', async () => {
    const service = new IntegrityService({
      account: {
        findMany: vi.fn(async () => [
          {
            id: 'account-1',
            ledger: [],
            positions: [{ symbol: '600519.SH', quantity: 10, costPrice: 100 }],
            snapshots: [],
          },
        ]),
      },
    } as never);

    const result = await service.check();
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: 'position_without_ledger_projection',
        entity: 'account-1:600519.SH',
      }),
    );
  });
});
