import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../src/platform/prisma.service.js';
import type { DsaClient } from '../../src/integration/dsa/dsa.client.js';
import { MarketRoutingConfigService } from '../../src/market/market-routing-config.service.js';
import { inferRoutingConfig } from '../../src/market/market-routing-rules.js';
import {
  persistMarketPolicyRevision,
  encodeMarketPolicyRoutes,
} from '../../src/market/market-policy-storage.js';
import {
  isExactRoutingScope,
  type DesiredProviderPolicyV3,
  type RoutingAuthoring,
} from '@thesis-ledger/schemas';

const key = {
  kind: 'data',
  market: 'CN',
  assetType: 'STOCK',
  capability: 'REALTIME_QUOTE',
} as const;
const target = { providerId: 'one', upstreamSource: 'one' };
const routes = [{ key, targets: [target], enabled: true }];
const catalog = {
  contractVersion: 3,
  consumer: 'thesis-ledger',
  catalogRevision: 10,
  generatedAt: '2026-11-09T00:00:00Z',
  integrity: 'complete',
  entries: [{ key, target, state: 'ready' }],
};
function fixture() {
  const row = {
    revision: 9,
    enabled: true,
    syncState: 'applied',
    routes: encodeMarketPolicyRoutes(routes),
  };
  const transaction = vi.fn();
  const prisma = {
    desiredProviderPolicy: { findUniqueOrThrow: vi.fn().mockResolvedValue(row) },
    $transaction: transaction,
  };
  const dsa = { marketRouteCatalogV3: vi.fn().mockResolvedValue(catalog) };
  const service = new MarketRoutingConfigService(
    prisma as unknown as PrismaService,
    dsa as unknown as DsaClient,
  );
  return { row, prisma, dsa, service, transaction };
}
describe('分级配置读取预览和原子保存边界', () => {
  it('旧层级读取展开为精确项，待整理但来源不变，读取和预览均不写入', async () => {
    const { row, service, transaction } = fixture();
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
    row.routes = encodeMarketPolicyRoutes(routes, config);
    const before = structuredClone(row);
    const view = await service.read();
    expect(view.legacyRuleCount).toBe(1);
    expect(view.pendingChanges).toBe(0);
    expect(
      view.config.rules.every((rule) => !rule.scope.market || isExactRoutingScope(rule.scope)),
    ).toBe(true);
    const input = { expectedRevision: 9, catalogRevision: 10, config: view.config };
    const preview = await service.preview(input);
    expect(preview).toMatchObject({ legacyRuleCount: 1, changes: [], routes });
    expect(await service.preview({ ...input, config })).toEqual(preview);
    expect(row).toEqual(before);
    expect(transaction).not.toHaveBeenCalled();
  });
  it('资格恢复只报告待编译差异，不改变已存路由，原规则可直接预览', async () => {
    const { row, service, transaction } = fixture();
    const config = inferRoutingConfig({ enabled: true, routes }, [key]);
    config.preserved = [];
    row.routes = encodeMarketPolicyRoutes([], config);
    const view = await service.read();
    expect(view.pendingChanges).toBe(1);
    expect(row.routes.routes).toEqual([]);
    const preview = await service.preview({
      expectedRevision: 9,
      catalogRevision: 10,
      config: view.config,
    });
    expect(preview.changes).toHaveLength(1);
    expect(transaction).not.toHaveBeenCalled();
  });
  it('读取无损归纳与预览均不写入，不接受伪造保留来源', async () => {
    const { service, transaction } = fixture();
    const view = await service.read();
    expect(view.config.rules).toMatchObject([{ providers: ['one'] }]);
    const draft = structuredClone(view.config);
    draft.preserved[0]!.route.targets = [{ providerId: 'injected', upstreamSource: 'third' }];
    const preview = await service.preview({
      expectedRevision: 9,
      catalogRevision: 10,
      config: draft,
    });
    expect(preview.changes).toEqual([]);
    expect(preview.routes).toEqual(routes);
    expect(transaction).not.toHaveBeenCalled();
  });
  it('目录或策略修订改变及未预览的新草稿拒绝保存', async () => {
    const { service, transaction } = fixture();
    const view = await service.read();
    const input = { expectedRevision: 9, catalogRevision: 10, config: view.config };
    const preview = await service.preview(input);
    await expect(
      service.save({ ...input, expectedRevision: 8, previewToken: preview.previewToken }),
    ).rejects.toThrow('配置已改变');
    await expect(
      service.save({ ...input, catalogRevision: 9, previewToken: preview.previewToken }),
    ).rejects.toThrow('能力目录已改变');
    await expect(
      service.save({
        ...input,
        config: { ...view.config, rules: [] },
        previewToken: preview.previewToken,
      }),
    ).rejects.toThrow('请先预览');
    expect(transaction).not.toHaveBeenCalled();
  });
  it('元数据、精确路由和历史在同一持久化写入；旧入口不携带元数据', async () => {
    const config = inferRoutingConfig({ enabled: true, routes }, [key]);
    const update = vi.fn().mockResolvedValue({ revision: 10 });
    const transaction = {
      $queryRaw: vi.fn(),
      desiredProviderPolicy: {
        findUniqueOrThrow: vi
          .fn()
          .mockResolvedValue({ revision: 9, routes: encodeMarketPolicyRoutes(routes, config) }),
        update,
      },
    };
    const prisma = {
      $transaction: (work: (tx: typeof transaction) => unknown) => work(transaction),
    } as unknown as PrismaService;
    const policy: DesiredProviderPolicyV3 = {
      contractVersion: 3,
      consumer: 'thesis-ledger',
      requestId: 'atomic-test',
      revision: 10,
      enabled: true,
      routes,
    };
    await persistMarketPolicyRevision(prisma, policy, 9, config);
    const data = update.mock.calls[0]![0].data;
    expect(data.routes.routingConfig).toEqual(config);
    expect(data.history.create.routes).toEqual(data.routes);
    expect(encodeMarketPolicyRoutes(routes)).not.toHaveProperty('routingConfig');
  });
});
