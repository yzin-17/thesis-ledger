import { describe, expect, it } from 'vitest';
import {
  desiredProviderPolicyV3Schema,
  marketReferenceCatalog,
  type MarketRouteKeyV3,
} from '@thesis-ledger/schemas';
import {
  configuredPolicyDraftV3,
  changedPolicyRouteIdsV3,
} from '../src/features/market-data/market-policy-draft-v3.js';
import {
  marketPolicyCategoryV3,
  marketPolicyRouteGroupsV3,
  filterMarketPolicyRowsV3,
  marketPolicyDisplayGroupsV3,
} from '../src/features/market-data/market-policy-route-groups-v3.js';
import {
  marketPolicyRouteRowsV3,
  updatePolicyRouteTargetV3,
} from '../src/features/market-data/market-data-routes-v3.js';
import { draft, key, target } from './market-policy-defaults.fixture.js';

const risk = {
  kind: 'data',
  market: 'CN',
  assetType: 'STOCK',
  capability: 'RISK_WARNING',
} as const;
const news = { ...risk, capability: 'NEWS_SEARCH' } as const;

describe('来源配置兼容', () => {
  it('旧停用来源不会随配置另一项被恢复', () => {
    const input = {
      ...draft,
      enabled: true,
      routes: [
        { key, targets: [target], enabled: true },
        { key: risk, targets: [target], enabled: false },
      ],
    };
    const before = structuredClone(input);
    const projected = configuredPolicyDraftV3(input);
    expect(projected.routes.map((route) => route.key)).toEqual([key]);
    const next = updatePolicyRouteTargetV3(input, news, 'primary', target);
    expect(next.routes.map((route) => route.key)).toEqual([key, news]);
    expect(next.routes.every((route) => route.enabled)).toBe(true);
    expect(input).toEqual(before);
    expect(configuredPolicyDraftV3({ ...input, enabled: false }).routes).toEqual([]);
    expect(
      updatePolicyRouteTargetV3({ ...input, enabled: false }, news, 'primary', target).routes.map(
        (route) => route.key,
      ),
    ).toEqual([news]);
  });
  it('清空主源删除备用，独立能力及空策略均满足已有合同', () => {
    let next = updatePolicyRouteTargetV3({ ...draft, enabled: true }, risk, 'primary', target);
    next = updatePolicyRouteTargetV3(next, risk, 'fallback', {
      providerId: 'backup',
      upstreamSource: 'backup',
    });
    expect(next.routes[0]?.targets).toHaveLength(2);
    const envelope = { consumer: 'thesis-ledger', requestId: 'controlled' };
    expect(desiredProviderPolicyV3Schema.parse({ ...next, ...envelope }).routes[0]?.enabled).toBe(
      true,
    );
    const cleared = updatePolicyRouteTargetV3(next, risk, 'primary', null);
    expect(desiredProviderPolicyV3Schema.parse({ ...cleared, ...envelope }).routes).toEqual([]);
    const withNews = updatePolicyRouteTargetV3(cleared, news, 'primary', target);
    expect(withNews.routes[0]?.enabled).toBe(true);
  });
  it('修改统计包括删除和主备次序变化，恢复原值后归零', () => {
    const initial = { ...draft, enabled: true, routes: [{ key, targets: [target] }] };
    expect(changedPolicyRouteIdsV3(initial, initial).size).toBe(0);
    const cleared = updatePolicyRouteTargetV3(initial, key, 'primary', null);
    expect(changedPolicyRouteIdsV3(cleared, initial).size).toBe(1);
    expect(
      changedPolicyRouteIdsV3(updatePolicyRouteTargetV3(cleared, key, 'primary', target), initial)
        .size,
    ).toBe(0);
  });
});

describe('路由分类与范围', () => {
  it('所有参考能力有明确分类，新未知能力保留可见', () => {
    for (const dataset of Object.keys(marketReferenceCatalog)) {
      const capability = `REFERENCE_${dataset.replaceAll('-', '_').toUpperCase()}`;
      expect(marketPolicyCategoryV3({ ...risk, capability } as MarketRouteKeyV3), dataset).not.toBe(
        'other',
      );
    }
    const unknown = { ...risk, capability: 'FUTURE_CAPABILITY' } as unknown as MarketRouteKeyV3;
    expect(marketPolicyCategoryV3(unknown)).toBe('other');
    expect(marketPolicyCategoryV3(news)).toBe('research');
    expect(marketPolicyCategoryV3(risk)).toBe('rules');
  });
  it('行去重、范围与中文搜索可组合，周期复权仍为独立精确键', () => {
    const keys = [
      key,
      { ...key, adjustment: 'none' as const },
      { ...key, market: 'HK' as const },
      risk,
    ];
    const input = {
      ...draft,
      enabled: true,
      routes: keys.map((key) => ({ key, targets: [target] })),
    };
    const rows = marketPolicyRouteRowsV3(undefined, input);
    const filtered = filterMarketPolicyRowsV3(rows, {
      market: 'CN',
      assetType: 'ETF',
      search: '日线',
    });
    expect(filtered).toHaveLength(2);
    expect(marketPolicyDisplayGroupsV3(filtered)).toHaveLength(1);
    expect(marketPolicyDisplayGroupsV3(filtered)[0]?.rows).toHaveLength(2);
    expect(marketPolicyRouteGroupsV3(rows).flatMap((group) => group.rows)).toHaveLength(4);
    expect(input.routes).toHaveLength(4);
  });
});
