import { describe, expect, it } from 'vitest';
import { routingAuthoringSchema, type RoutingAuthoring } from '@thesis-ledger/schemas';
import {
  updateRoutingScope,
  routingInheritedRule,
  updateRoutingScopeBinding,
  updateRoutingScopeSelection,
} from '../src/features/market-data/routing-config-draft.js';
import {
  routingScopeChildren,
  routingScopePath,
  routingScopeOverrides,
} from '../src/features/market-data/routing-scope-tree.js';

const root = { category: 'market' } as const;
const asset = { ...root, market: 'CN', assetType: 'STOCK' } as const;
const capability = { ...asset, capability: 'DAILY_BAR' } as const;
const config = (): RoutingAuthoring => ({
  version: 1,
  preserved: [],
  rules: [{ scope: root, providers: ['futu', 'akshare'] }],
  keys: [
    {
      kind: 'bar',
      market: 'CN',
      assetType: 'STOCK',
      capability: 'DAILY_BAR',
      timeframe: '1d',
      adjustment: 'qfq',
    },
    {
      kind: 'bar',
      market: 'CN',
      assetType: 'STOCK',
      capability: 'DAILY_BAR',
      timeframe: '1d',
      adjustment: 'hfq',
    },
    { kind: 'data', market: 'HK', assetType: 'ETF', capability: 'REALTIME_QUOTE' },
  ],
});

describe('细分范围列表', () => {
  it('细分具体来源只建立当前范围规则，保留上级和未更换来源的精确选择', () => {
    const draft = config();
    draft.rules.push({
      scope: capability,
      providers: ['akshare', 'hithink'],
      upstreamSources: { akshare: 'eastmoney' },
    });
    const child = { ...capability, timeframe: '1d', adjustment: 'qfq' } as const;
    const bound = updateRoutingScopeBinding(draft, child, 'akshare', 'sina');
    expect(bound.rules[1]).toEqual(draft.rules[1]);
    expect(bound.rules.at(-1)?.upstreamSources).toEqual({ akshare: 'sina' });
    const next = updateRoutingScopeSelection(bound, child, ['akshare', 'tencent']);
    expect(next.rules.at(-1)?.upstreamSources).toEqual({ akshare: 'sina' });
    expect(updateRoutingScopeSelection(next, child, []).rules.at(-1)?.providers).toEqual([]);
    expect(draft.rules).toHaveLength(2);
  });
  it('展示全部继承层级，构造节点不改变草稿', () => {
    const draft = config(),
      before = JSON.stringify(draft);
    const markets = routingScopeChildren(draft, root);
    expect(markets.map((node) => node.label)).toEqual(['中国内地', '香港']);
    const type = routingScopeChildren(draft, markets[0]!.scope)[0]!;
    expect(type.label).toBe('股票');
    const purpose = routingScopeChildren(draft, type.scope)[0]!;
    expect(purpose.label).toBe('日线行情');
    const period = routingScopeChildren(draft, purpose.scope)[0]!;
    expect(period.label).toBe('日线');
    const prices = routingScopeChildren(draft, period.scope);
    expect(prices.map((node) => node.label)).toEqual(['前复权', '后复权']);
    for (const node of prices)
      expect(
        routingAuthoringSchema.shape.rules.element.safeParse({ scope: node.scope, providers: [] })
          .success,
      ).toBe(true);
    expect(JSON.stringify(draft)).toBe(before);
    expect(routingScopeChildren(draft, prices[0]!.scope)).toEqual([]);
  });
  it('普通用途为叶节点，中文路径保留完整范围', () => {
    const scope = {
      category: 'market',
      market: 'HK',
      assetType: 'ETF',
      capability: 'REALTIME_QUOTE',
    } as const;
    expect(routingScopeChildren(config(), scope)).toEqual([]);
    expect(routingScopePath(scope)).toBe('行情与净值 · 香港 · ETF · 实时行情');
  });
  it('上级选择变化和恢复本级均保留下级单独设置', () => {
    const child = { ...capability, timeframe: '1d', adjustment: 'qfq' } as const;
    let draft = updateRoutingScope(config(), child, ['akshare']);
    draft = updateRoutingScope(draft, capability, ['hithink']);
    draft = updateRoutingScope(draft, asset, ['tencent']);
    const next = updateRoutingScope(draft, capability, null);
    expect(routingInheritedRule(next, child)?.providers).toEqual(['akshare']);
    expect(routingInheritedRule(next, capability)?.providers).toEqual(['tencent']);
    expect(routingScopeOverrides(next, root)).toBe(2);
  });
  it('明确空配置阻止继承；使用上级配置删除当前覆盖', () => {
    const draft = config();
    const cleared = updateRoutingScope(draft, capability, []);
    expect(routingInheritedRule(cleared, capability)?.providers).toEqual([]);
    const restored = updateRoutingScope(cleared, capability, null);
    expect(restored).toEqual(draft);
    expect(routingInheritedRule(restored, capability)?.providers).toEqual(['futu', 'akshare']);
  });
});
