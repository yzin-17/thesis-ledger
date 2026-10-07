import { describe, expect, it, vi } from 'vitest';
import type { DesiredProviderPolicyV3 } from '@thesis-ledger/schemas';
import { DsaError } from '../src/integration/dsa/dsa.client.js';
import {
  applyDesiredProviderPolicyV3,
  marketPolicyCatalogResponse,
} from '../src/market/market-policy-catalog.js';
import { encodeMarketPolicyRoutes } from '../src/market/market-policy-storage.js';

const key: DesiredProviderPolicyV3['routes'][number]['key'] = {
  kind: 'bar',
  market: 'CN',
  assetType: 'ETF',
  capability: 'DAILY_BAR',
  timeframe: '1d',
  adjustment: 'qfq',
};
const target = { providerId: 'hithink', upstreamSource: 'hithink-financial-api' };
const policy: DesiredProviderPolicyV3 = {
  contractVersion: 3,
  consumer: 'thesis-ledger',
  requestId: 'catalog-test',
  revision: 5,
  enabled: true,
  routes: [{ key, targets: [target] }],
};
const catalog = (
  state: 'ready' | 'credential_missing' = 'ready',
  integrity: 'complete' | 'partial' = 'complete',
) => ({
  contractVersion: 3 as const,
  consumer: 'thesis-ledger' as const,
  catalogRevision: 12,
  generatedAt: '2026-09-25T04:00:00.000Z',
  integrity,
  entries: [{ key, target, state }],
});

const applyResponse = (desired: DesiredProviderPolicyV3) => ({
  status: 'applied' as const,
  idempotent: false,
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
      targets: route.targets.map((routeTarget, routeIndex) => ({
        ...routeTarget,
        routeIndex,
        eligible: true,
        reason: null,
      })),
    })),
    appliedAt: '2026-09-25T04:00:01.000Z',
  },
  requestId: desired.requestId,
});

const policyStore = () => {
  const current: Record<string, unknown> = {
    consumer: 'thesis-ledger',
    revision: policy.revision,
    enabled: policy.enabled,
    routes: encodeMarketPolicyRoutes(policy.routes),
    syncState: 'rejected',
    effectiveProjection: applyResponse({ ...policy, revision: 4 }).effective,
  };
  const transaction = {
    desiredProviderPolicyRevision: { update: vi.fn(async () => ({})) },
    desiredProviderPolicy: {
      updateMany: vi.fn(
        async ({
          data,
          where,
        }: {
          data: Record<string, unknown>;
          where: {
            revision?: number;
            routes?: { equals: string };
            AND?: Array<{ routes: { equals: string } }>;
          };
        }) => {
          const attempt = (
            current.routes as { applyAttempt?: { requestId: string; attemptId: string } }
          ).applyAttempt;
          if (
            where.revision !== current.revision ||
            (where.routes && where.routes.equals !== attempt?.requestId) ||
            (where.AND && where.AND[0]?.routes.equals !== attempt?.attemptId)
          )
            return { count: 0 };
          Object.assign(current, data);
          return { count: 1 };
        },
      ),
      findUniqueOrThrow: vi.fn(async () => ({ ...current })),
    },
  };
  return {
    current,
    transaction,
    prisma: {
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
      ),
    },
  };
};

describe('market-policy-catalog', () => {
  it('拒绝 partial 目录并保留目标级路径、原因和目录审计', async () => {
    const store = policyStore();
    const dsa = {
      marketRouteCatalogV3: vi.fn(async () => catalog('ready', 'partial')),
      applyControlPolicyV3: vi.fn(),
    };

    const result = marketPolicyCatalogResponse(
      await applyDesiredProviderPolicyV3(
        store.prisma as never,
        dsa as never,
        policy,
        store.current,
      ),
    );

    expect(result).toMatchObject({
      syncState: 'rejected',
      lastError: {
        code: 'route_catalog_partial',
        issues: [{ path: ['routes', 0, 'targets', 0], reason: 'catalog_partial' }],
      },
      catalogAudit: {
        catalogRevision: 12,
        generatedAt: '2026-09-25T04:00:00.000Z',
        integrity: 'partial',
      },
      effectiveProjection: { contractVersion: 3, sourceDesiredRevision: 4 },
    });
    expect(dsa.applyControlPolicyV3).not.toHaveBeenCalled();
  });

  it('新增的精确 target 非 ready 时按目录 reason 拒绝，且不调用 Apply', async () => {
    const store = policyStore();
    store.current.effectiveProjection = null;
    const dsa = {
      marketRouteCatalogV3: vi.fn(async () => catalog('credential_missing')),
      applyControlPolicyV3: vi.fn(),
    };

    const result = marketPolicyCatalogResponse(
      await applyDesiredProviderPolicyV3(
        store.prisma as never,
        dsa as never,
        policy,
        store.current,
      ),
    );

    expect(result).toMatchObject({
      syncState: 'rejected',
      lastError: {
        code: 'route_not_ready',
        issues: [{ path: ['routes', 0, 'targets', 0], reason: 'credential_missing' }],
      },
    });
    expect(dsa.applyControlPolicyV3).not.toHaveBeenCalled();
  });

  it('保留旧不可用路由并新增就绪路由，按 DSA 实际状态保存 Effective', async () => {
    const store = policyStore();
    const hfqKey = { ...key, kind: 'bar' as const, adjustment: 'hfq' as const };
    const hfqTarget = { providerId: 'tencent', upstreamSource: 'tencent' };
    const desired = {
      ...policy,
      routes: [...policy.routes, { key: hfqKey, targets: [hfqTarget] }],
    };
    store.current.routes = encodeMarketPolicyRoutes(desired.routes);
    const response = applyResponse(desired);
    const unavailable = { eligible: false, reason: 'credential_missing' };
    Object.assign(response.effective.routes[0]!, { reason: unavailable.reason });
    Object.assign(response.effective.routes[0]!.targets[0]!, unavailable);
    const dsa = {
      marketRouteCatalogV3: vi.fn(async () => ({
        ...catalog(),
        entries: [
          ...catalog('credential_missing').entries,
          { key: hfqKey, target: hfqTarget, state: 'ready' },
        ],
      })),
      applyControlPolicyV3: vi.fn(async () => response),
    };

    const result = marketPolicyCatalogResponse(
      await applyDesiredProviderPolicyV3(
        store.prisma as never,
        dsa as never,
        desired,
        store.current,
      ),
    );

    expect(dsa.applyControlPolicyV3).toHaveBeenCalledWith(desired);
    expect(result).toMatchObject({
      syncState: 'applied',
      effectiveStale: false,
      effectiveProjection: {
        sourceDesiredRevision: policy.revision,
        routes: [
          { targets: [{ ...target, ...unavailable }] },
          { targets: [{ ...hfqTarget, eligible: true, reason: null }] },
        ],
      },
    });
  });

  it('complete 目录缺少精确 key/target 时以 not_adapted 拒绝', async () => {
    const store = policyStore();
    const missingRoute = { ...catalog(), entries: [] };
    const dsa = {
      marketRouteCatalogV3: vi.fn(async () => missingRoute),
      applyControlPolicyV3: vi.fn(),
    };

    const result = await applyDesiredProviderPolicyV3(
      store.prisma as never,
      dsa as never,
      policy,
      store.current,
    );

    expect(result).toMatchObject({
      syncState: 'rejected',
      lastError: {
        code: 'route_not_ready',
        issues: [{ path: ['routes', 0, 'targets', 0], reason: 'not_adapted' }],
      },
    });
    expect(dsa.applyControlPolicyV3).not.toHaveBeenCalled();
  });

  it('complete ready 目录允许 Apply，并记录匹配的 Effective projection', async () => {
    const store = policyStore();
    const dsa = {
      marketRouteCatalogV3: vi.fn(async () => catalog()),
      applyControlPolicyV3: vi.fn(async (desired: DesiredProviderPolicyV3) =>
        applyResponse(desired),
      ),
    };

    const result = marketPolicyCatalogResponse(
      await applyDesiredProviderPolicyV3(
        store.prisma as never,
        dsa as never,
        policy,
        store.current,
      ),
    );

    expect(dsa.marketRouteCatalogV3).toHaveBeenCalledOnce();
    expect(dsa.applyControlPolicyV3).toHaveBeenCalledWith(policy);
    expect(result).toMatchObject({
      syncState: 'applied',
      dsaRevision: policy.revision,
      effectiveProjection: { sourceDesiredRevision: policy.revision },
      catalogAudit: { catalogRevision: 12, integrity: 'complete' },
    });
  });

  it('Apply 响应的 Effective revision 来源不匹配时不覆盖旧 Effective', async () => {
    const store = policyStore();
    const response = applyResponse(policy);
    const dsa = {
      marketRouteCatalogV3: vi.fn(async () => catalog()),
      applyControlPolicyV3: vi.fn(async () => ({
        ...response,
        effective: { ...response.effective, sourceDesiredRevision: policy.revision - 1 },
      })),
    };

    const result = marketPolicyCatalogResponse(
      await applyDesiredProviderPolicyV3(
        store.prisma as never,
        dsa as never,
        policy,
        store.current,
      ),
    );

    expect(result).toMatchObject({
      syncState: 'rejected',
      lastError: { code: 'invalid-response' },
      effectiveProjection: { contractVersion: 3, sourceDesiredRevision: 4 },
      effectiveStale: true,
    });
  });

  it('目录请求失败时 fail-closed；Apply 失败时旧 Effective 保持不变', async () => {
    const unavailableStore = policyStore();
    const unavailableDsa = {
      marketRouteCatalogV3: vi.fn(async () => {
        throw new DsaError('catalog unavailable', 'unavailable');
      }),
      applyControlPolicyV3: vi.fn(),
    };
    const unavailable = marketPolicyCatalogResponse(
      await applyDesiredProviderPolicyV3(
        unavailableStore.prisma as never,
        unavailableDsa as never,
        policy,
        unavailableStore.current,
      ),
    );

    expect(unavailable).toMatchObject({
      syncState: 'rejected',
      lastError: {
        code: 'route_catalog_unavailable',
        issues: [{ path: ['routes', 0, 'targets', 0], reason: 'catalog_unavailable' }],
      },
      effectiveProjection: { contractVersion: 3, sourceDesiredRevision: 4 },
      effectiveStale: true,
    });
    expect(unavailableDsa.applyControlPolicyV3).not.toHaveBeenCalled();

    const applyFailureStore = policyStore();
    const applyFailureDsa = {
      marketRouteCatalogV3: vi.fn(async () => catalog()),
      applyControlPolicyV3: vi.fn(async () => {
        throw new DsaError('apply unavailable', 'unavailable');
      }),
    };
    const failed = marketPolicyCatalogResponse(
      await applyDesiredProviderPolicyV3(
        applyFailureStore.prisma as never,
        applyFailureDsa as never,
        policy,
        applyFailureStore.current,
      ),
    );

    expect(failed).toMatchObject({
      syncState: 'pending',
      effectiveProjection: { contractVersion: 3, sourceDesiredRevision: 4 },
      effectiveStale: true,
    });
  });

  for (const sameRequestId of [false, true]) {
    for (const lateFailure of [false, true]) {
      it(`同 revision ${sameRequestId ? '重复' : '不同'} requestId 的晚到${lateFailure ? '失败' : '成功'}不覆盖最新尝试`, async () => {
        const store = policyStore();
        let release!: () => void;
        let started!: () => void;
        const oldStarted = new Promise<void>((resolve) => {
          started = resolve;
        });
        const blocked = new Promise<void>((resolve) => {
          release = resolve;
        });
        const next = { ...policy, requestId: sameRequestId ? policy.requestId : 'new-attempt' };
        const dsa = {
          marketRouteCatalogV3: vi.fn(async () => catalog()),
          applyControlPolicyV3: vi
            .fn()
            .mockImplementationOnce(async (input: DesiredProviderPolicyV3) => {
              started();
              await blocked;
              if (lateFailure) throw new DsaError('old attempt failed', 'unavailable');
              return applyResponse(input);
            })
            .mockImplementationOnce(async (input: DesiredProviderPolicyV3) => {
              if (!lateFailure) throw new DsaError('latest attempt failed', 'control-rejected');
              return applyResponse(input);
            }),
        };
        const old = applyDesiredProviderPolicyV3(store.prisma as never, dsa as never, policy, {
          ...store.current,
        });
        await oldStarted;
        await applyDesiredProviderPolicyV3(store.prisma as never, dsa as never, next, {
          ...store.current,
        });
        const latest = structuredClone(store.current);
        const historyWrites =
          store.transaction.desiredProviderPolicyRevision.update.mock.calls.length;
        release();
        expect(await old).toEqual(latest);
        expect(store.current).toEqual(latest);
        expect(store.current.syncState).toBe(lateFailure ? 'applied' : 'rejected');
        expect(store.transaction.desiredProviderPolicyRevision.update).toHaveBeenCalledTimes(
          historyWrites,
        );
      });
    }
  }

  it('旧目录和旧 Apply 响应不能成为当前投影', async () => {
    const store = policyStore();
    const dsa = {
      marketRouteCatalogV3: vi.fn(async () => ({ ...catalog(), contractVersion: 2 })),
      applyControlPolicyV3: vi.fn(async () => applyResponse(policy)),
    };
    await applyDesiredProviderPolicyV3(store.prisma as never, dsa as never, policy, store.current);
    expect(store.current.syncState).toBe('rejected');
    expect(dsa.applyControlPolicyV3).not.toHaveBeenCalled();
    dsa.marketRouteCatalogV3.mockResolvedValue(catalog() as never);
    dsa.applyControlPolicyV3.mockResolvedValue({
      ...applyResponse(policy),
      effective: { ...applyResponse(policy).effective, contractVersion: 2 },
    } as never);
    await applyDesiredProviderPolicyV3(store.prisma as never, dsa as never, policy, store.current);
    expect(store.current).toMatchObject({
      syncState: 'rejected',
      lastError: { code: 'invalid-response' },
      effectiveProjection: { contractVersion: 3, sourceDesiredRevision: 4 },
    });
  });
});
