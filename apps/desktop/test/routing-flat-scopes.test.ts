import { describe, expect, it } from 'vitest';
import {
  routingAuthoringSchema,
  routingScopeId,
  type RoutingAuthoring,
} from '@thesis-ledger/schemas';
import {
  emptyRoutingFilter,
  filterRoutingScopes,
  routingFlatScopes,
  routingScopeFilterItems,
} from '../src/features/market-data/routing-flat-scopes.js';
import { routingInheritedRule } from '../src/features/market-data/routing-config-draft.js';

const purpose = {
  category: 'market',
  market: 'CN',
  assetType: 'STOCK',
  capability: 'MINUTE_BAR',
} as const;
const config: RoutingAuthoring = {
  version: 1,
  preserved: [],
  rules: [
    { scope: { category: 'market' }, providers: ['futu', 'akshare'] },
    { scope: purpose, providers: ['akshare', 'tencent'] },
    {
      scope: { category: 'market', market: 'US', assetType: 'INDEX', capability: 'REALTIME_QUOTE' },
      providers: [],
    },
  ],
  keys: [
    {
      kind: 'bar',
      market: 'CN',
      assetType: 'STOCK',
      capability: 'MINUTE_BAR',
      timeframe: '5m',
      adjustment: 'qfq',
    },
    {
      kind: 'bar',
      market: 'CN',
      assetType: 'STOCK',
      capability: 'MINUTE_BAR',
      timeframe: '1m',
      adjustment: 'none',
    },
    {
      kind: 'bar',
      market: 'CN',
      assetType: 'STOCK',
      capability: 'MINUTE_BAR',
      timeframe: '5m',
      adjustment: 'none',
    },
    { kind: 'data', market: 'HK', assetType: 'STOCK', capability: 'REALTIME_QUOTE' },
  ],
};

describe('全部范围平铺与筛选', () => {
  it('仅展示精确路由，保留聚合规则的继承结果和具体空规则', () => {
    const before = structuredClone(config);
    const rows = routingFlatScopes(config, 'market');
    expect(rows.map((node) => node.label)).toEqual([
      '中国内地 · 股票 · 分钟行情 · 1 分钟 · 不复权',
      '中国内地 · 股票 · 分钟行情 · 5 分钟 · 不复权',
      '中国内地 · 股票 · 分钟行情 · 5 分钟 · 前复权',
      '香港 · 股票 · 实时行情',
      '美国 · 指数 · 实时行情',
    ]);
    expect(new Set(rows.map((node) => routingScopeId(node.scope))).size).toBe(rows.length);
    for (const { scope } of rows) {
      expect(
        routingAuthoringSchema.shape.rules.element.safeParse({ scope, providers: [] }).success,
      ).toBe(true);
    }
    expect(config).toEqual(before);
    expect(routingInheritedRule(config, rows[0]!.scope)?.providers).toEqual(['akshare', 'tencent']);
    const daily = routingFlatScopes(
      {
        ...config,
        keys: [
          {
            kind: 'bar',
            market: 'CN',
            assetType: 'STOCK',
            capability: 'DAILY_BAR',
            timeframe: '1d',
            adjustment: 'qfq',
          },
        ],
      },
      'market',
    );
    expect(
      daily.filter((node) => node.scope.capability === 'DAILY_BAR').map((node) => node.label),
    ).toEqual(['中国内地 · 股票 · 日线行情 · 日线 · 前复权']);
  });

  it('类型可独立跨市场筛选；多条件取交集，过滤不改规则或引入目录能力', () => {
    const before = structuredClone(config);
    const rows = routingFlatScopes(config, 'market');
    const stocks = filterRoutingScopes(rows, { ...emptyRoutingFilter, assetType: 'STOCK' });
    expect(new Set(stocks.map((node) => node.scope.market))).toEqual(new Set(['CN', 'HK']));
    const exact = filterRoutingScopes(rows, {
      market: 'CN',
      assetType: 'STOCK',
      capability: 'MINUTE_BAR',
      timeframe: '5m',
      adjustment: 'qfq',
    });
    expect(exact.map((node) => node.scope)).toEqual([
      { ...purpose, timeframe: '5m', adjustment: 'qfq' },
    ]);
    expect(
      filterRoutingScopes(rows, { ...emptyRoutingFilter, market: 'HK', adjustment: 'qfq' }),
    ).toEqual([]);
    expect(filterRoutingScopes(rows, { ...emptyRoutingFilter })).toEqual(rows);
    expect(config).toEqual(before);
  });

  it('筛选选项使用中文业务标签，已有规则缺少能力键时仍可查看', () => {
    const rows = routingFlatScopes(config, 'market');
    expect(routingScopeFilterItems(rows, 'assetType')).toEqual([
      { value: 'STOCK', label: '股票' },
      { value: 'INDEX', label: '指数' },
    ]);
    expect(routingScopeFilterItems(rows, 'adjustment')).toEqual([
      { value: 'none', label: '不复权' },
      { value: 'qfq', label: '前复权' },
    ]);
    expect(routingScopeFilterItems(rows, 'market').map((item) => item.label)).toEqual([
      '中国内地',
      '香港',
      '美国',
    ]);
    expect(routingFlatScopes(config, 'research')).toEqual([]);
  });
});
