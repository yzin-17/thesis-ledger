import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import type { DesiredProviderPolicyV3 } from '@thesis-ledger/schemas';
import { MarketControlService } from '../src/market/market-control.service.js';
import { encodeMarketPolicyRoutes } from '../src/market/market-policy-storage.js';

const key = {
  kind: 'bar' as const,
  market: 'CN' as const,
  assetType: 'ETF' as const,
  capability: 'DAILY_BAR' as const,
  timeframe: '1d' as const,
  adjustment: 'qfq' as const,
};
const target = { providerId: 'hithink', upstreamSource: 'hithink-financial-api' };
const routes = [{ key, targets: [target] }];

type PolicyState = {
  consumer: string;
  revision: number;
  enabled: boolean;
  routes: unknown;
  syncState: string;
  history: Array<Record<string, unknown>>;
  [key: string]: unknown;
};

const makeStore = (
  initial: PolicyState | null = {
    consumer: 'thesis-ledger',
    revision: 4,
    enabled: true,
    routes: encodeMarketPolicyRoutes([]),
    syncState: 'applied',
    history: [],
  },
) => {
  let state = initial;
  const record = () => (state ? { ...state, history: [...state.history] } : null);
  const update = ({ data }: { data: Record<string, unknown> }) => {
    if (!state) throw new Error('missing policy');
    const history = state.history;
    Object.assign(state, data);
    if (data.effectiveProjection === Prisma.JsonNull) state.effectiveProjection = null;
    if (data.lastError === Prisma.JsonNull) state.lastError = null;
    const next = (data.history as { create?: Record<string, unknown> } | undefined)?.create;
    state.history = next ? [...history, next] : history;
    return record();
  };
  const tx = {
    $queryRaw: vi.fn(async () => []),
    desiredProviderPolicy: {
      findUniqueOrThrow: vi.fn(async () => record()),
      update: vi.fn(async (args: { data: Record<string, unknown> }) => update(args)),
      updateMany: vi.fn(async (args: { data: Record<string, unknown> }) => {
        update(args);
        return { count: 1 };
      }),
    },
    desiredProviderPolicyRevision: { update: vi.fn(async () => ({})) },
  };
  const prisma = {
    desiredProviderPolicy: {
      findUnique: vi.fn(async () => record()),
      upsert: vi.fn(async ({ create }: { create: Record<string, unknown> }) => {
        if (!state)
          state = {
            consumer: create.consumer as string,
            revision: create.revision as number,
            enabled: create.enabled as boolean,
            routes: create.routes,
            history: [],
            syncState: 'pending',
          };
        return record();
      }),
    },
    desiredProviderPolicyRevision: {
      findUnique: vi.fn(async () => null as Record<string, unknown> | null),
    },
    $transaction: vi.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)),
    providerTombstone: { upsert: vi.fn(async () => ({})) },
  };
  return { prisma, tx, getState: () => state };
};

const completeCatalog = () => ({
  contractVersion: 3 as const,
  consumer: 'thesis-ledger' as const,
  catalogRevision: 9,
  generatedAt: '2026-09-25T04:00:00.000Z',
  integrity: 'complete' as const,
  entries: [{ key, target, state: 'ready' as const }],
});

const dsaReady = () => ({
  marketRouteCatalogV3: vi.fn(async () => completeCatalog()),
  applyControlPolicyV3: vi.fn(async (desired: DesiredProviderPolicyV3) => ({
    status: 'applied' as const,
    idempotent: false,
    requestId: desired.requestId,
    desired,
    effective: {
      contractVersion: 3 as const,
      consumer: 'thesis-ledger' as const,
      requestId: desired.requestId,
      revision: desired.revision,
      sourceDesiredRevision: desired.revision,
      enabled: desired.enabled,
      routes: desired.routes.map((route) => ({
        key: route.key,
        reason: null,
        targets: route.targets.map((item, routeIndex) => ({
          ...item,
          routeIndex,
          eligible: true,
          reason: null,
        })),
      })),
      appliedAt: '2026-09-25T04:00:01.000Z',
    },
  })),
  removeControlProvider: vi.fn(async () => ({})),
});

describe('MarketControlService', () => {
  it('新库只种下当前合同的空路由并通过 V3 目录同步', async () => {
    const store = makeStore(null);
    const dsa = dsaReady();
    const result = await new MarketControlService(store.prisma as never, dsa as never).getPolicy();
    expect(store.getState()?.routes).toMatchObject({ storageVersion: 3, routes: [] });
    expect(result).toMatchObject({
      contractVersion: 3,
      revision: 1,
      routes: [],
      syncState: 'applied',
    });
    expect(dsa.applyControlPolicyV3).toHaveBeenCalledOnce();
  });

  it('旧输入在查库前拒绝，旧持久化记录在读取时拒绝', async () => {
    const store = makeStore();
    const service = new MarketControlService(store.prisma as never, dsaReady() as never);
    await expect(
      service.applyPolicy({ contractVersion: 2, revision: 5, enabled: true, routes: {} }),
    ).rejects.toMatchObject({ status: 400 });
    expect(store.prisma.desiredProviderPolicy.findUnique).not.toHaveBeenCalled();

    const old = makeStore({
      consumer: 'thesis-ledger',
      revision: 4,
      enabled: true,
      routes: { DAILY_BAR: { ETF: [target] } },
      syncState: 'applied',
      history: [],
    });
    await expect(
      new MarketControlService(old.prisma as never, dsaReady() as never).getPolicy(),
    ).rejects.toMatchObject({ status: 409, message: 'Policy routes 存储格式不是当前版本' });
  });

  it('目录完整且目标就绪时，期望和生效路由身份一致才应用', async () => {
    const store = makeStore();
    const dsa = dsaReady();
    const result = await new MarketControlService(store.prisma as never, dsa as never).applyPolicy({
      contractVersion: 3,
      revision: 5,
      enabled: true,
      routes,
    });
    expect(result).toMatchObject({
      contractVersion: 3,
      revision: 5,
      routes,
      syncState: 'applied',
      effectiveStale: false,
      catalogAudit: { catalogRevision: 9, integrity: 'complete' },
    });
    expect(store.getState()?.routes).toMatchObject({ storageVersion: 3, routes });
    expect(dsa.applyControlPolicyV3).toHaveBeenCalledOnce();
  });

  it('partial 目录保留新修订但拒绝应用，重试仍执行目录门禁', async () => {
    const store = makeStore();
    const dsa = {
      ...dsaReady(),
      marketRouteCatalogV3: vi.fn(async () => ({
        ...completeCatalog(),
        integrity: 'partial' as const,
        entries: [],
      })),
    };
    const service = new MarketControlService(store.prisma as never, dsa as never);
    const first = await service.applyPolicy({
      contractVersion: 3,
      revision: 5,
      enabled: true,
      routes,
    });
    const retried = await service.retryLatest();
    expect(first).toMatchObject({
      syncState: 'rejected',
      lastError: { code: 'route_catalog_partial' },
    });
    expect(retried).toMatchObject({ revision: 5, syncState: 'rejected' });
    expect(dsa.marketRouteCatalogV3).toHaveBeenCalledTimes(2);
    expect(dsa.applyControlPolicyV3).not.toHaveBeenCalled();
  });

  it('数据库标记已应用但生效投影过期时重新执行精确目录门禁', async () => {
    const store = makeStore({
      consumer: 'thesis-ledger',
      revision: 4,
      enabled: true,
      routes: encodeMarketPolicyRoutes(routes),
      syncState: 'applied',
      effectiveProjection: {
        contractVersion: 3,
        consumer: 'thesis-ledger',
        requestId: 'previous-policy',
        revision: 3,
        sourceDesiredRevision: 3,
        enabled: true,
        routes: [],
        appliedAt: '2026-09-25T04:00:00Z',
      },
      history: [],
    });
    const dsa = dsaReady();
    const result = await new MarketControlService(
      store.prisma as never,
      dsa as never,
    ).retryLatest();
    expect(result).toMatchObject({ revision: 4, syncState: 'applied', effectiveStale: false });
    expect(dsa.marketRouteCatalogV3).toHaveBeenCalledOnce();
    expect(dsa.applyControlPolicyV3).toHaveBeenCalledOnce();
  });

  it('回滚只读取当前格式的历史修订，并产生新的修订', async () => {
    const store = makeStore();
    store.prisma.desiredProviderPolicyRevision.findUnique.mockResolvedValue({
      revision: 2,
      enabled: true,
      routes: encodeMarketPolicyRoutes(routes),
    });
    const result = await new MarketControlService(
      store.prisma as never,
      dsaReady() as never,
    ).rollback(2);
    expect(result).toMatchObject({ rolledBackFrom: 4, rolledBackTo: 2, revision: 5, routes });
    expect(store.getState()?.routes).toMatchObject({ storageVersion: 3, routes });
  });

  it('删除 Provider 从精确路由移除目标，未生效时不删除 DSA Provider', async () => {
    const store = makeStore({
      consumer: 'thesis-ledger',
      revision: 4,
      enabled: true,
      routes: encodeMarketPolicyRoutes([
        { key, targets: [target, { providerId: 'akshare', upstreamSource: 'eastmoney' }] },
      ]),
      syncState: 'rejected',
      history: [],
    });
    const dsa = {
      ...dsaReady(),
      marketRouteCatalogV3: vi.fn(async () => ({
        ...completeCatalog(),
        integrity: 'partial' as const,
        entries: [],
      })),
    };
    const result = await new MarketControlService(
      store.prisma as never,
      dsa as never,
    ).removeProvider('hithink');
    expect(result).toMatchObject({
      removed: false,
      policy: {
        contractVersion: 3,
        revision: 5,
        routes: [{ targets: [{ providerId: 'akshare', upstreamSource: 'eastmoney' }] }],
        syncState: 'rejected',
      },
    });
    expect(dsa.removeControlProvider).not.toHaveBeenCalled();
  });

  it('保留 Provider 配置的原始凭据结构', async () => {
    const dsa = { saveControlProvider: vi.fn(async () => ({})) };
    await new MarketControlService({} as never, dsa as never).saveProvider('tushare', {
      requestId: 'request-1',
      credentials: { method: 'token', values: { token: 'secret' } },
    });
    expect(dsa.saveControlProvider).toHaveBeenCalledWith('tushare', {
      requestId: 'request-1',
      credentials: { method: 'token', values: { token: 'secret' } },
    });
  });

  it('旧单字符串凭据在调用 DSA 前被拒绝', () => {
    const dsa = {
      saveControlProvider: vi.fn(),
      testControlProvider: vi.fn(),
    };
    const service = new MarketControlService({} as never, dsa as never);
    expect(() => service.saveProvider('tushare', { credential: 'old' })).toThrow();
    expect(() => service.testProvider('tushare', { credential: 'old' })).toThrow();
    for (const contractVersion of [1, 2]) {
      expect(() => service.saveProvider('tushare', { contractVersion })).toThrow();
      expect(() => service.testProvider('tushare', { contractVersion })).toThrow();
    }
    expect(dsa.saveControlProvider).not.toHaveBeenCalled();
    expect(dsa.testControlProvider).not.toHaveBeenCalled();
  });

  it('错误移除信封在策略读取及 DSA 调用前拒绝', async () => {
    const prisma = {
      desiredProviderPolicy: { findUnique: vi.fn() },
      providerTombstone: { upsert: vi.fn() },
    };
    const dsa = { removeControlProvider: vi.fn() };
    const service = new MarketControlService(prisma as never, dsa as never);
    for (const input of [
      { contractVersion: 1 },
      { contractVersion: 2 },
      { consumer: 'other' },
      { requestId: '' },
    ]) {
      await expect(service.removeProvider('tushare', input)).rejects.toThrow(
        'Provider 请求不符合当前合同',
      );
    }
    expect(prisma.desiredProviderPolicy.findUnique).not.toHaveBeenCalled();
    expect(prisma.providerTombstone.upsert).not.toHaveBeenCalled();
    expect(dsa.removeControlProvider).not.toHaveBeenCalled();
  });

  it('无效配置字段不能被静默丢弃后写入', () => {
    const dsa = { saveControlProvider: vi.fn(), testControlProvider: vi.fn() };
    const service = new MarketControlService({} as never, dsa as never);
    for (const input of [
      { credentials: null },
      { enabled: 'true' },
      { settings: [] },
      { requestId: '' },
      { consumer: 'other' },
      { credentialVersion: 1 },
      { clearCredentials: true, credentials: { method: 'token', values: { token: 'secret' } } },
    ]) {
      expect(() => service.saveProvider('tushare', input)).toThrow();
    }
    expect(() => service.testProvider('tushare', { credentials: [] })).toThrow();
    expect(dsa.saveControlProvider).not.toHaveBeenCalled();
    expect(dsa.testControlProvider).not.toHaveBeenCalled();
  });
});
