import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  isExactRoutingScope,
  type DesiredProviderPolicyV3,
  type RoutingAuthoring,
} from '@thesis-ledger/schemas';
import { startIsolatedNavPostgres } from '../backtest/nav-postgres.integration-harness.js';
import { DsaError, type DsaClient } from '../../src/integration/dsa/dsa.client.js';
import { MarketRoutingConfigService } from '../../src/market/market-routing-config.service.js';
import {
  encodeMarketPolicyRoutes,
  persistMarketPolicyRevision,
} from '../../src/market/market-policy-storage.js';
import { retryDesiredProviderPolicyV3 } from '../../src/market/market-policy-catalog.js';

const key = {
  kind: 'data',
  market: 'CN',
  assetType: 'STOCK',
  capability: 'REALTIME_QUOTE',
} as const;
const target = { providerId: 'one', upstreamSource: 'one' };
const routes = [{ key, targets: [target], enabled: true }];
const catalog = {
  contractVersion: 1,
  consumer: 'thesis-ledger',
  catalogRevision: 1,
  generatedAt: '2026-11-09T00:00:00Z',
  integrity: 'complete',
  entries: [{ key, target, state: 'ready' }],
};
const applied = (desired: DesiredProviderPolicyV3) => ({
  status: 'applied',
  idempotent: false,
  requestId: desired.requestId,
  desired,
  effective: {
    ...desired,
    sourceDesiredRevision: desired.revision,
    appliedAt: '2026-11-09T00:00:00Z',
    routes: desired.routes.map((route) => ({
      ...route,
      reason: null,
      targets: route.targets.map((item, routeIndex) => ({
        ...item,
        routeIndex,
        eligible: true,
        reason: null,
      })),
    })),
  },
});

describe.skipIf(process.env.MARKET_ROUTING_POSTGRES !== '1')(
  '分级路由隔离 PostgreSQL 保存与恢复',
  () => {
    let isolated: Awaited<ReturnType<typeof startIsolatedNavPostgres>>;
    beforeAll(async () => {
      isolated = await startIsolatedNavPostgres();
    }, 120000);
    afterAll(async () => {
      await isolated?.cleanup();
    }, 30000);
    async function fixture(legacy = false) {
      const parent = { category: 'market', market: 'CN' } as const;
      const config: RoutingAuthoring = {
        version: 1,
        keys: [key],
        rules: [
          { scope: { category: 'market' }, providers: [] },
          { scope: parent, providers: ['one'] },
        ],
        preserved: [{ route: routes[0]!, rule: { scope: parent, providers: ['one'] } }],
      };
      const stored = encodeMarketPolicyRoutes(routes, legacy ? config : undefined);
      await isolated.prisma.desiredProviderPolicyRevision.deleteMany();
      await isolated.prisma.desiredProviderPolicy.deleteMany();
      await isolated.prisma.desiredProviderPolicy.create({
        data: {
          consumer: 'thesis-ledger',
          revision: 9,
          enabled: true,
          routes: stored,
          syncState: 'rejected',
          history: {
            create: {
              revision: 9,
              enabled: true,
              routes: stored,
              syncState: 'rejected',
            },
          },
        },
      });
      const dsa = {
        marketRouteCatalogV3: vi.fn(async () => catalog),
        applyControlPolicyV3: vi.fn(async (desired: DesiredProviderPolicyV3) => applied(desired)),
      };
      const service = new MarketRoutingConfigService(isolated.prisma, dsa as unknown as DsaClient);
      const view = await service.read();
      const input = { expectedRevision: view.revision, catalogRevision: 1, config: view.config };
      const preview = await service.preview(input);
      return { service, dsa, input: { ...input, previewToken: preview.previewToken } };
    }
    async function witness() {
      const current = await isolated.prisma.desiredProviderPolicy.findUniqueOrThrow({
        where: { consumer: 'thesis-ledger' },
      });
      const history = await isolated.prisma.desiredProviderPolicyRevision.findMany({
        orderBy: { revision: 'asc' },
      });
      return { current, history };
    }
    it('并发保存只有一个修订胜出，元数据与历史一致', async () => {
      const { service, input } = await fixture(true);
      const result = await Promise.allSettled([service.save(input), service.save(input)]);
      expect(result.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
      const { current, history } = await witness();
      expect(current.revision).toBe(10);
      expect(history).toHaveLength(2);
      expect(history.at(-1)!.routes).toEqual(current.routes);
      expect(current.routes).toHaveProperty('routingConfig');
    });
    it('应用超时保留元数据和精确来源，重试后历史与当前一起收敛', async () => {
      const { service, input, dsa } = await fixture(true);
      dsa.applyControlPolicyV3.mockRejectedValueOnce(new DsaError('controlled timeout', 'timeout'));
      const saved = await service.save(input);
      expect(saved.syncState).toBe('pending');
      const before = await witness();
      const response = await retryDesiredProviderPolicyV3(
        isolated.prisma,
        dsa as unknown as DsaClient,
        before.current,
      );
      expect(response.syncState).toBe('applied');
      const after = await witness();
      expect(after.current.routes).toHaveProperty(
        'routingConfig',
        (before.current.routes as Record<string, unknown>).routingConfig,
      );
      expect(after.history.at(-1)!.routes).toEqual(after.current.routes);
      expect(after.current.revision).toBe(10);
    });
    it('历史写入约束失败回滚当前规则和来源，旧精确入口清除元数据', async () => {
      const { service, input } = await fixture(true);
      await service.save(input);
      const before = await witness();
      await isolated.prisma.desiredProviderPolicyRevision.create({
        data: {
          consumer: 'thesis-ledger',
          revision: 11,
          enabled: true,
          routes: encodeMarketPolicyRoutes([]),
          syncState: 'rejected',
        },
      });
      const policy: DesiredProviderPolicyV3 = {
        contractVersion: 1,
        consumer: 'thesis-ledger',
        requestId: 'failed-atomic-write',
        revision: 11,
        enabled: true,
        routes: [],
      };
      await expect(persistMarketPolicyRevision(isolated.prisma, policy, 10)).rejects.toThrow();
      expect((await witness()).current.routes).toEqual(before.current.routes);
      expect((await witness()).current.revision).toBe(10);
      await persistMarketPolicyRevision(isolated.prisma, { ...policy, revision: 12 }, 10);
      expect((await witness()).current.routes).not.toHaveProperty('routingConfig');
    });
    it('旧汇总整理仅在保存落库，保留所有原精确来源和旧历史内容', async () => {
      const { service, input } = await fixture(true);
      const before = await witness();
      expect((await service.read()).legacyRuleCount).toBe(1);
      expect(await witness()).toEqual(before);
      await service.save(input);
      const after = await witness();
      expect(after.history[0]?.routes).toEqual(before.history[0]?.routes);
      expect(after.current.routes).toMatchObject({ routes });
      const read = await service.read();
      expect(read.legacyRuleCount).toBe(0);
      expect(
        read.config.rules.every((rule) => !rule.scope.market || isExactRoutingScope(rule.scope)),
      ).toBe(true);
      const preview = await service.preview({
        expectedRevision: 10,
        catalogRevision: 1,
        config: read.config,
      });
      expect(preview.changes).toEqual([]);
    });
  },
);
