import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { DesiredProviderPolicyV3 } from '@thesis-ledger/schemas';
import { startIsolatedNavPostgres } from '../backtest/nav-postgres.integration-harness.js';
import { DsaError } from '../../src/integration/dsa/dsa.client.js';
import { applyDesiredProviderPolicyV3 } from '../../src/market/market-policy-catalog.js';
import {
  encodeMarketPolicyRoutes,
  marketPolicyResponse,
  persistMarketPolicyRevision,
} from '../../src/market/market-policy-storage.js';

const policy: DesiredProviderPolicyV3 = {
  contractVersion: 3,
  consumer: 'thesis-ledger',
  requestId: 'isolated-policy',
  revision: 5,
  enabled: true,
  routes: [],
};
const catalog = {
  contractVersion: 3,
  consumer: 'thesis-ledger',
  catalogRevision: 1,
  generatedAt: '2026-10-02T00:00:00Z',
  integrity: 'complete',
  entries: [],
};
const applied = (desired: DesiredProviderPolicyV3) => ({
  status: 'applied',
  idempotent: false,
  requestId: desired.requestId,
  desired,
  effective: {
    contractVersion: 3,
    consumer: 'thesis-ledger',
    requestId: desired.requestId,
    revision: desired.revision,
    sourceDesiredRevision: desired.revision,
    enabled: desired.enabled,
    routes: [],
    appliedAt: '2026-10-02T00:00:00Z',
  },
});

describe.skipIf(process.env.E04_POLICY_POSTGRES !== '1')('Policy 隔离 PostgreSQL 尝试 CAS', () => {
  let isolated: Awaited<ReturnType<typeof startIsolatedNavPostgres>>;
  beforeAll(async () => {
    isolated = await startIsolatedNavPostgres();
  }, 120_000);
  afterAll(async () => {
    await isolated?.cleanup();
  }, 30_000);

  async function seed() {
    await isolated.prisma.desiredProviderPolicyRevision.deleteMany();
    await isolated.prisma.desiredProviderPolicy.deleteMany();
    const routes = encodeMarketPolicyRoutes(policy.routes);
    return isolated.prisma.desiredProviderPolicy.create({
      data: {
        consumer: policy.consumer,
        revision: policy.revision,
        enabled: true,
        routes,
        syncState: 'rejected',
        history: {
          create: { revision: policy.revision, enabled: true, routes, syncState: 'rejected' },
        },
      },
    });
  }
  async function witness() {
    return {
      current: await isolated.prisma.desiredProviderPolicy.findUniqueOrThrow({
        where: { consumer: policy.consumer },
      }),
      history: await isolated.prisma.desiredProviderPolicyRevision.findMany({
        orderBy: { revision: 'asc' },
      }),
    };
  }

  for (const sameRequestId of [false, true])
    for (const lateFailure of [false, true]) {
      it(`同 revision ${sameRequestId ? '重复' : '不同'} requestId 晚到${lateFailure ? '失败' : '成功'}不更新当前与历史`, async () => {
        const current = await seed();
        let release!: () => void;
        let started!: () => void;
        const oldStarted = new Promise<void>((resolve) => {
          started = resolve;
        });
        const blocked = new Promise<void>((resolve) => {
          release = resolve;
        });
        const next = {
          ...policy,
          requestId: sameRequestId ? policy.requestId : 'isolated-new-attempt',
        };
        const dsa = {
          marketRouteCatalogV3: vi.fn(async () => catalog),
          applyControlPolicyV3: vi
            .fn()
            .mockImplementationOnce(async (input: DesiredProviderPolicyV3) => {
              started();
              await blocked;
              if (lateFailure) throw new DsaError('old failed', 'unavailable');
              return applied(input);
            })
            .mockImplementationOnce(async (input: DesiredProviderPolicyV3) => {
              if (!lateFailure) throw new DsaError('latest rejected', 'control-rejected');
              return applied(input);
            }),
        };
        const old = applyDesiredProviderPolicyV3(isolated.prisma, dsa as never, policy, current);
        await oldStarted;
        await applyDesiredProviderPolicyV3(isolated.prisma, dsa as never, next, current);
        const before = await witness();
        release();
        await old;
        expect(await witness()).toEqual(before);
        expect(before.current.syncState).toBe(lateFailure ? 'applied' : 'rejected');
        expect(before.history[0]?.syncState).toBe(before.current.syncState);
      });
    }

  it('跨 revision 晚到结果与未领取的旧请求都不写入', async () => {
    const current = await seed();
    let release!: () => void;
    let started!: () => void;
    const oldStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const dsa = {
      marketRouteCatalogV3: vi.fn(async () => catalog),
      applyControlPolicyV3: vi
        .fn()
        .mockImplementationOnce(async (input: DesiredProviderPolicyV3) => {
          started();
          await blocked;
          return applied(input);
        })
        .mockImplementation(async (input: DesiredProviderPolicyV3) => applied(input)),
    };
    const old = applyDesiredProviderPolicyV3(isolated.prisma, dsa as never, policy, current);
    await oldStarted;
    const next = { ...policy, revision: 6, requestId: 'isolated-revision-6' };
    const nextRow = await persistMarketPolicyRevision(isolated.prisma, next);
    await applyDesiredProviderPolicyV3(isolated.prisma, dsa as never, next, nextRow);
    const before = await witness();
    release();
    await old;
    expect(await witness()).toEqual(before);
    dsa.marketRouteCatalogV3.mockClear();
    dsa.applyControlPolicyV3.mockClear();
    await applyDesiredProviderPolicyV3(isolated.prisma, dsa as never, policy, current);
    expect(await witness()).toEqual(before);
    expect(dsa.marketRouteCatalogV3).not.toHaveBeenCalled();
    expect(dsa.applyControlPolicyV3).not.toHaveBeenCalled();
  });

  it('旧 Effective 读取拒绝，历史缺失时尝试事务回滚', async () => {
    await seed();
    await isolated.prisma.desiredProviderPolicy.update({
      where: { consumer: policy.consumer },
      data: {
        syncState: 'applied',
        effectiveProjection: { contractVersion: 2, sourceDesiredRevision: 5 },
      },
    });
    const before = await witness();
    expect(() => marketPolicyResponse(before.current)).toThrow(
      'Policy Effective 存储格式不是当前版本',
    );
    expect(await witness()).toEqual(before);
    const current = await seed();
    await isolated.prisma.desiredProviderPolicyRevision.deleteMany();
    const beforeFailure = await witness();
    const dsa = { marketRouteCatalogV3: vi.fn(), applyControlPolicyV3: vi.fn() };
    await expect(
      applyDesiredProviderPolicyV3(isolated.prisma, dsa as never, policy, current),
    ).rejects.toMatchObject({ code: 'P2025' });
    expect(await witness()).toEqual(beforeFailure);
    expect(dsa.marketRouteCatalogV3).not.toHaveBeenCalled();
    expect(dsa.applyControlPolicyV3).not.toHaveBeenCalled();
  });
});
