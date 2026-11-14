import { describe, expect, it } from 'vitest';
import {
  routingAuthoringSchema,
  type MarketRouteCapabilityV3,
  type RoutingAuthoring,
} from '@thesis-ledger/schemas';
import {
  routingSourceChoices,
  routingSourceValue,
  updateRoutingSourceChoice,
} from '../src/features/market-data/routing-source-choices.js';
import {
  routingInheritedRule,
  updateRoutingScope,
} from '../src/features/market-data/routing-config-draft.js';
import { key, provider } from './market-policy-defaults.fixture.js';

const scope = {
  category: 'market',
  market: 'CN',
  assetType: 'ETF',
  capability: 'DAILY_BAR',
  timeframe: '1d',
  adjustment: 'qfq',
} as const;
const providers = [
  {
    ...provider,
    providerId: 'akshare',
    displayName: 'AKShare',
    upstreamSources: [
      { sourceId: 'eastmoney', displayName: '东方财富', capabilities: {} },
      { sourceId: 'sina', displayName: '新浪财经', capabilities: {} },
    ],
  },
  {
    ...provider,
    upstreamSources: [{ sourceId: 'history', displayName: '历史行情', capabilities: {} }],
  },
];
const catalog: MarketRouteCapabilityV3[] = [
  { key, target: { providerId: 'akshare', upstreamSource: 'eastmoney' }, state: 'ready' },
  { key, target: { providerId: 'akshare', upstreamSource: 'sina' }, state: 'ready' },
  { key, target: { providerId: 'hithink', upstreamSource: 'history' }, state: 'ready' },
];
const config = (): RoutingAuthoring => ({
  version: 1,
  keys: [key],
  preserved: [],
  rules: [
    {
      scope: { category: 'market' },
      providers: ['akshare', 'hithink'],
    },
    {
      scope: { category: 'market', market: 'CN', assetType: 'ETF', capability: 'DAILY_BAR' },
      providers: ['akshare', 'hithink'],
      upstreamSources: { hithink: 'history' },
    },
  ],
});
const choices = (draft = config()) =>
  routingSourceChoices(providers, catalog, scope, routingInheritedRule(draft, scope));

describe('主备具体来源统一选择', () => {
  it('各数据源复用具体来源中文标签，选择后保留另一方绑定和上级配置', () => {
    const draft = config(),
      before = structuredClone(draft);
    const options = choices(draft);
    expect(options.map((item) => item.label)).toContain('AKShare · 东方财富 · 未验证，可尝试');
    expect(options.map((item) => item.label)).toContain('HiThink · 历史行情 · 未验证，可尝试');
    const source = options.find((item) => item.providerId === 'akshare' && item.upstreamSource === 'sina')!;
    const next = updateRoutingSourceChoice(draft, scope, 0, source);
    expect(routingInheritedRule(next, scope)).toEqual({
      scope,
      providers: ['akshare', 'hithink'],
      upstreamSources: { akshare: 'sina', hithink: 'history' },
    });
    expect(next.rules[0]).toEqual(draft.rules[0]);
    expect(draft).toEqual(before);
    expect(
      choices(next).find(
        (item) =>
          item.value ===
          routingSourceValue(routingInheritedRule(next, scope), 'akshare', choices(next)),
      )?.label,
    ).toBe('AKShare · 新浪财经 · 未验证，可尝试');
  });

  it('新增来源选择原子设置提供方与精确绑定；相同提供方不能同时占据主备', () => {
    let draft = updateRoutingScope(config(), scope, ['hithink']);
    const selected = choices(draft).find((item) => item.providerId === 'akshare' && item.upstreamSource === 'eastmoney')!;
    draft = updateRoutingSourceChoice(draft, scope, 1, selected);
    expect(routingInheritedRule(draft, scope)).toEqual({
      scope,
      providers: ['hithink', 'akshare'],
      upstreamSources: { akshare: 'eastmoney' },
    });
    expect(updateRoutingSourceChoice(draft, scope, 0, selected)).toBe(draft);
    const none = updateRoutingSourceChoice(draft, scope, 0, null);
    expect(routingInheritedRule(none, scope)?.providers).toEqual([]);
    expect(updateRoutingSourceChoice(none, scope, 1, selected)).toBe(none);
  });

  it('大类选择保留子项例外，单一具体来源仅回显而不修改草稿', () => {
    const draft = config(),
      before = structuredClone(draft);
    const single = routingSourceChoices(providers, catalog, scope);
    expect(
      single.find((item) => item.value === routingSourceValue(undefined, 'hithink', single))?.label,
    ).toBe('HiThink · 历史行情 · 未验证，可尝试');
    expect(draft).toEqual(before);
    const parent = { category: 'market' } as const;
    const bound = updateRoutingSourceChoice(
      draft,
      parent,
      0,
      choices().find((item) => item.label === 'AKShare · 新浪财经')!,
    );
    const lower = updateRoutingScope(bound, scope, []);
    const options = routingSourceChoices(
      providers,
      catalog,
      parent,
      routingInheritedRule(lower, parent),
    );
    const automatic = options.find(
      (item) => item.providerId === 'akshare' && item.upstreamSource === null,
    )!;
    const next = updateRoutingSourceChoice(lower, parent, 0, automatic);
    expect(routingInheritedRule(next, parent)?.upstreamSources).toBeUndefined();
    expect(routingInheritedRule(next, scope)?.providers).toEqual([]);
  });

  it('目录不再包含的既有绑定继续回显，可选择新的具体来源', () => {
    const rule = { scope, providers: ['hithink'], upstreamSources: { hithink: 'old-source' } };
    const options = routingSourceChoices(providers, catalog, scope, rule);
    const value = routingSourceValue(rule, 'hithink', options);
    expect(options.find((item) => item.value === value)?.label).toBe(
      'HiThink · old-source · 不支持当前能力',
    );
    expect(options.find((item) => item.value === value)?.disabled).toBe(true);
    expect(options.every((item) => item.upstreamSource !== null)).toBe(true);
    const replacement = options.find(
      (item) => item.providerId === 'hithink' && item.upstreamSource === 'history',
    )!;
    const next = updateRoutingSourceChoice({ ...config(), rules: [rule] }, scope, 0, replacement);
    expect(routingInheritedRule(next, scope)?.upstreamSources).toEqual({ hithink: 'history' });
    expect(routingSourceValue(rule, undefined, options)).toBe('__none__');
  });

  it('细分项仅列具体接口，多个未绑定接口需要明确选择且不擅自回显首项', () => {
    const draft = config();
    const before = structuredClone(draft);
    const options = choices(draft);
    expect(options.every((item) => item.upstreamSource !== null)).toBe(true);
    expect(options.some((item) => item.label.includes('按能力匹配'))).toBe(false);
    expect(routingSourceValue(routingInheritedRule(draft, scope), 'akshare', options)).toBeNull();
    expect(draft).toEqual(before);
  });

  it('大类内仅有一个具体来源时只提供一次对应选项', () => {
    const options = routingSourceChoices(providers, catalog, { category: 'market' });
    expect(
      options.filter((item) => item.providerId === 'hithink').map((item) => item.label),
    ).toEqual(['HiThink · 历史行情 · 未验证，可尝试']);
    expect(
      options.some((item) => item.providerId === 'akshare' && item.upstreamSource === null),
    ).toBe(true);
    expect(options.every((item) => item.upstreamSource === null)).toBe(true);
    const next = updateRoutingSourceChoice(
      config(),
      { category: 'market' },
      0,
      options.find((item) => item.providerId === 'akshare')!,
    );
    expect(next.rules.find((rule) => !rule.scope.market)?.upstreamSources).toBeUndefined();
    expect(routingAuthoringSchema.safeParse(next).success).toBe(true);
  });
});
