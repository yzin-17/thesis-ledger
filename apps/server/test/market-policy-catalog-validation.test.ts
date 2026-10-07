import { describe, expect, it } from 'vitest';
import type {
  DesiredProviderPolicyV3,
  EffectiveProviderPolicyV3,
  MarketRouteCatalogV3,
} from '@thesis-ledger/schemas';
import { marketPolicyCatalogIssues } from '../src/market/market-policy-catalog-validation.js';

const nav: DesiredProviderPolicyV3['routes'][number] = {
  key: { kind: 'data', market: 'CN', assetType: 'MUTUAL_FUND', capability: 'FUND_NAV_HISTORY' },
  targets: [{ providerId: 'efinance', upstreamSource: 'eastmoney' }],
};
const hfq = {
  key: {
    kind: 'bar',
    market: 'CN',
    assetType: 'ETF',
    capability: 'DAILY_BAR',
    timeframe: '1d',
    adjustment: 'hfq',
  },
  targets: [{ providerId: 'tencent', upstreamSource: 'tencent' }],
} satisfies DesiredProviderPolicyV3['routes'][number];
const saved: DesiredProviderPolicyV3 = {
  contractVersion: 3,
  consumer: 'thesis-ledger',
  requestId: 'retained-route-test',
  revision: 8,
  enabled: true,
  routes: [nav],
};
const desired = { ...saved, revision: 9, routes: [nav, hfq] };
const catalog: MarketRouteCatalogV3 = {
  contractVersion: 3,
  consumer: 'thesis-ledger',
  catalogRevision: 12,
  generatedAt: '2026-10-03T00:00:00Z',
  integrity: 'complete',
  entries: [
    { key: nav.key, target: nav.targets[0]!, state: 'not_admitted' },
    { key: hfq.key, target: hfq.targets[0]!, state: 'ready' },
  ],
};
const effective = (policy = saved): EffectiveProviderPolicyV3 => ({
  ...policy,
  sourceDesiredRevision: policy.revision,
  routes: policy.routes.map((route) => ({
    key: route.key,
    reason: 'not_admitted',
    targets: route.targets.map((target, routeIndex) => ({
      ...target,
      routeIndex,
      eligible: false,
      reason: 'not_admitted',
    })),
  })),
  appliedAt: '2026-10-03T00:00:01Z',
});
const navIssue = (reason: string) => [{ path: ['routes', 0, 'targets', 0], reason }];

describe('已应用路由的配置保留资格', () => {
  it.each(['credential_missing', 'quota_unavailable', 'not_admitted'] as const)(
    '保留未改变且暂不可用的旧路由（%s），允许新增就绪 HFQ',
    (state) => {
      const currentCatalog = structuredClone(catalog);
      currentCatalog.entries[0]!.state = state;
      expect(marketPolicyCatalogIssues(desired, currentCatalog, effective())).toEqual([]);
    },
  );

  it('路由列表位置改变不影响按精确 RouteKey 保留', () => {
    expect(
      marketPolicyCatalogIssues({ ...desired, routes: [hfq, nav] }, catalog, effective()),
    ).toEqual([]);
  });

  it('新增的不可用目标仍然拒绝', () => {
    const currentCatalog = structuredClone(catalog);
    currentCatalog.entries[1]!.state = 'not_admitted';
    expect(marketPolicyCatalogIssues(desired, currentCatalog, effective())).toEqual([
      { path: ['routes', 1, 'targets', 0], reason: 'not_admitted' },
    ]);
  });

  it.each([null, {}, saved])('缺失、无效或只有 Desired 时不继承保留资格：%j', (previous) => {
    expect(marketPolicyCatalogIssues(desired, catalog, previous)).toEqual(navIssue('not_admitted'));
  });

  it('不从晚于当前 Desired 的投影继承保留资格', () => {
    expect(
      marketPolicyCatalogIssues(desired, catalog, effective({ ...saved, revision: 10 })),
    ).toEqual(navIssue('not_admitted'));
  });

  it('全局重新启用时重新验证全部目标', () => {
    expect(
      marketPolicyCatalogIssues(desired, catalog, effective({ ...saved, enabled: false })),
    ).toEqual(navIssue('not_admitted'));
  });

  it('部分目录不能授予配置保留资格', () => {
    expect(
      marketPolicyCatalogIssues(desired, { ...catalog, integrity: 'partial' }, effective()),
    ).toEqual([
      ...navIssue('catalog_partial'),
      { path: ['routes', 1, 'targets', 0], reason: 'catalog_partial' },
    ]);
  });

  it('既有路由的适配已从目录消失时仍拒绝', () => {
    expect(
      marketPolicyCatalogIssues(
        desired,
        { ...catalog, entries: catalog.entries.slice(1) },
        effective(),
      ),
    ).toEqual(navIssue('not_adapted'));
  });

  it('既有路由的口径已不受支持时仍拒绝', () => {
    const hfqPolicy = { ...saved, routes: [hfq] };
    const qfq = { ...hfq.key, kind: 'bar' as const, adjustment: 'qfq' as const };
    expect(
      marketPolicyCatalogIssues(
        hfqPolicy,
        { ...catalog, entries: [{ ...catalog.entries[1]!, key: qfq }] },
        effective(hfqPolicy),
      ),
    ).toEqual(navIssue('unsupported_adjustment'));
  });

  it('改动目标身份时必须重新验证', () => {
    const changed = { ...nav, targets: [{ providerId: 'akshare', upstreamSource: 'eastmoney' }] };
    expect(
      marketPolicyCatalogIssues(
        { ...desired, routes: [changed, hfq] },
        {
          ...catalog,
          entries: [{ ...catalog.entries[0]!, target: changed.targets[0]! }, catalog.entries[1]!],
        },
        effective(),
      ),
    ).toEqual(navIssue('not_admitted'));
  });

  it('主备顺序变化时必须重新验证整条路由', () => {
    const backup = { providerId: 'akshare', upstreamSource: 'eastmoney' };
    const previous = { ...saved, routes: [{ ...nav, targets: [...nav.targets, backup] }] };
    const reordered = { ...desired, routes: [{ ...nav, targets: [backup, ...nav.targets] }] };
    expect(
      marketPolicyCatalogIssues(
        reordered,
        {
          ...catalog,
          entries: [...catalog.entries, { key: nav.key, target: backup, state: 'ready' }],
        },
        effective(previous),
      ),
    ).toEqual([{ path: ['routes', 0, 'targets', 1], reason: 'not_admitted' }]);
  });
});
