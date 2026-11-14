import { describe, expect, it, vi } from 'vitest';
import { riskNotificationRoutingInputSchema } from '@thesis-ledger/schemas';
import { encryptProviderCredential } from '../../src/platform/credential-security.js';
import { NotificationService } from '../../src/notifications/notification.service.js';
import { RiskNotificationRoutingService } from '../../src/notifications/risk-notification-routing.service.js';

const fixture = (selected: string[] | null = null) => {
  let preference = selected === null ? null : { scope: 'risk-event', providers: selected, updatedAt: new Date('2026-11-07T00:00:00Z') };
  const configs = ['优先通知', '备用通知'].map((name, index) => ({
    name, type: 'notification', enabled: true, priority: index + 1,
    encryptedCredentials: encryptProviderCredential(`https://open.feishu.cn/open-apis/bot/v2/hook/isolated-${index}`),
  }));
  const deliveries = new Map<string, Record<string, unknown>>();
  const findMany = vi.fn(async () => configs);
  const upsert = vi.fn(async ({ where, create }: { where: unknown; create: Record<string, unknown> }) => {
    const key = JSON.stringify(where);
    if (!deliveries.has(key)) deliveries.set(key, create);
    return deliveries.get(key);
  });
  const preferenceUpsert = vi.fn(async ({ create, update }: { create: { providers: string[] }; update: { providers: string[] } }) => {
    preference = { scope: 'risk-event', providers: preference ? update.providers : create.providers, updatedAt: new Date() };
    return preference;
  });
  const store = {
    providerConfig: { findMany },
    notificationRoutingPreference: { findUnique: vi.fn(async () => preference), upsert: preferenceUpsert },
    notificationDelivery: { upsert, findFirst: vi.fn(async ({ where }: { where: { dedupKey: string; channel: string } }) =>
      [...deliveries.values()].find((row) => row.dedupKey === where.dedupKey && row.channel === where.channel) ?? null) },
    $queryRaw: vi.fn(async () => []),
    $transaction: async (run: ((tx: unknown) => unknown) | Promise<unknown>[]) => Array.isArray(run) ? Promise.all(run) : run(store),
  };
  const cooldown = new Set<string>();
  const redis = { client: {
    set: vi.fn(async (key: string) => { if (cooldown.has(key)) return null; cooldown.add(key); return 'OK'; }),
    get: vi.fn(async () => null), del: vi.fn(),
  } };
  return { configs, deliveries, findMany, upsert, preferenceUpsert, store, redis, routing: new RiskNotificationRoutingService(store as never),
    notifications: new NotificationService(store as never, redis as never, { record: vi.fn() } as never) };
};
const message = { title: '隔离验收', body: '不会发送真实通知', severity: 'warning' as const, traceId: 'isolated' };
const policy = { cooldownMinutes: 30, maxAttempts: 3, criticalBypassCooldown: true };

describe('风险通知提供方选择', () => {
  it('单条配置覆盖旧全局选择，并在提供方失效后停止而不改投', async () => {
    const f = fixture(['优先通知']);
    await f.notifications.enqueue({ type: 'risk-event', id: 'per-rule' }, message, { ...policy, providers: ['备用通知'] });
    expect([...f.deliveries.values()].map((row) => row.provider)).toEqual(['备用通知']);
    expect(f.store.notificationRoutingPreference.findUnique).not.toHaveBeenCalled();
    f.configs.splice(1, 1);
    f.upsert.mockClear();
    expect(await f.notifications.enqueue({ type: 'risk-event', id: 'missing' }, message, { ...policy, providers: ['备用通知'] })).toEqual([]);
    expect(f.upsert).not.toHaveBeenCalled();
  });
  it('明确零冷却不预留 Redis 锁，空提供方不投递', async () => {
    const f = fixture();
    await f.notifications.enqueue({ type: 'risk-event', id: 'zero' }, message, { ...policy, cooldownMinutes: 0, providers: ['备用通知'] });
    expect(f.redis.client.set).not.toHaveBeenCalled();
    f.upsert.mockClear();
    expect(await f.notifications.enqueue({ type: 'risk-event', id: 'empty' }, message, { ...policy, providers: [] })).toEqual([]);
    expect(f.upsert).not.toHaveBeenCalled();
  });
  it('默认选择最高优先级，同时完整公开同渠道候选且不泄露凭证', async () => {
    const f = fixture();
    const result = await f.routing.read();
    expect(result).toEqual({ availableRoutes: [
      { provider: '优先通知', channel: 'feishu', priority: 1 },
      { provider: '备用通知', channel: 'feishu', priority: 2 },
    ], selectedProviders: ['优先通知'], updatedAt: null });
    expect(JSON.stringify(result)).not.toContain('isolated-');
    expect(f.preferenceUpsert).not.toHaveBeenCalled();
    expect(f.findMany).toHaveBeenCalledWith({ where: { type: 'notification', enabled: true }, orderBy: [{ priority: 'asc' }, { name: 'asc' }] });
  });
  it('多选保存后重读仍保留；无效或空选不通过', async () => {
    const f = fixture();
    await f.routing.save(['优先通知', '备用通知']);
    expect((await f.routing.read()).selectedProviders).toEqual(['优先通知', '备用通知']);
    await expect(f.routing.save(['未知通知'])).rejects.toThrow('部分通知提供方当前不可用');
    expect((await f.routing.read()).selectedProviders).toHaveLength(2);
    expect(riskNotificationRoutingInputSchema.safeParse({ providers: [] }).success).toBe(false);
    expect(riskNotificationRoutingInputSchema.safeParse({ providers: ['优先通知', '优先通知'] }).success).toBe(false);
  });
  it('已选配置失效后保留选择意图，不自动投递到其它提供方', async () => {
    const f = fixture(['备用通知']);
    f.configs.splice(1, 1);
    expect((await f.routing.read()).selectedProviders).toEqual(['备用通知']);
    expect(await f.notifications.enqueue({ type: 'risk-event', id: 'event' }, message, policy)).toEqual([]);
    expect(f.upsert).not.toHaveBeenCalled();
  });
  it('同渠道多选分别冷却与幂等，重试不会新增记录或改写冻结消息', async () => {
    const f = fixture(['优先通知', '备用通知']);
    const subject = { type: 'risk-event', id: 'event', dedupKey: 'rule' };
    await f.notifications.enqueue(subject, message, policy);
    await f.notifications.enqueue(subject, message, policy);
    expect(f.deliveries.size).toBe(2);
    expect(f.upsert).toHaveBeenCalledTimes(2);
    expect([...f.deliveries.values()].map((d) => d.provider)).toEqual(['优先通知', '备用通知']);
    const critical = { ...message, severity: 'critical' as const };
    await f.notifications.enqueue(subject, critical, policy);
    expect(f.deliveries.size).toBe(2);
    expect([...f.deliveries.values()].map((d) => d.message)).toEqual([message, message]);
    const keys = f.redis.client.set.mock.calls.map(([key]) => key);
    expect(new Set(keys).size).toBe(2);
    expect(keys[0]).toContain('notification:feishu:');
  });
  it('其它通知主题继续使用最高优先级，不消费风险多选配置', async () => {
    const f = fixture(['优先通知', '备用通知']);
    await f.notifications.enqueue({ type: 'cash-plan', id: 'cash' }, message, policy);
    expect(f.upsert).toHaveBeenCalledOnce();
    expect([...f.deliveries.values()][0]?.provider).toBe('优先通知');
    expect(f.store.notificationRoutingPreference.findUnique).not.toHaveBeenCalled();
    expect(await f.notifications.routing()).toEqual({ routes: [{ channel: 'feishu', provider: '优先通知' }] });
  });
});
