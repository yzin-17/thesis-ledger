import { describe, expect, it } from 'vitest';
import {
  routingAuthoringSchema,
  type MarketRouteCapabilityV3,
  type RoutingAuthoring,
} from '@thesis-ledger/schemas';
import { applyRoutingRecommendation, routingRecommendation } from '../src/features/market-data/routing-recommendation.js';
import { routingInheritedRule } from '../src/features/market-data/routing-config-draft.js';
import type { ProviderManifest } from '../src/features/market-data/market-data.types.js';
import { key } from './market-policy-defaults.fixture.js';

const now = Date.parse('2026-11-10T08:00:00Z');
const source = (providerId: string, paid = false): ProviderManifest => ({
  providerId,
  displayName: providerId,
  version: 1,
  capabilities: {},
  enabled: true,
  configured: true,
  credentialConfigured: paid,
  requiresCredential: paid,
});
const entry = (providerId: string, upstreamSource = providerId): MarketRouteCapabilityV3 => ({
  key,
  target: { providerId, upstreamSource },
  state: 'ready',
});
const config = (): RoutingAuthoring => ({
  version: 1,
  keys: [key],
  preserved: [],
  rules: [{ scope: { category: 'market' }, providers: ['futu', 'akshare'] }],
});
const selected = (draft: RoutingAuthoring) =>
  draft.rules.find((rule) => rule.scope.capability === key.capability)!;
const recommend = (
  providers: ProviderManifest[],
  entries: MarketRouteCapabilityV3[],
  draft = config(),
) => applyRoutingRecommendation(draft, 'market', providers, entries, now);

describe('按当前可用来源推荐主备', () => {
  it('部分建议待选择时，其他口径可采用，待选项保留完整原绑定且不修改输入', () => {
    const otherKey = { ...key, market: 'HK' as const };
    const original = config();
    original.keys.push(otherKey);
    original.rules[0]!.providers = ['tencent', 'akshare'];
    original.rules[0]!.upstreamSources = { tencent: 'tencent' };
    const before = structuredClone(original);
    const result = routingRecommendation(original, 'market', [source('tencent'), source('akshare')], [
      entry('tencent'), entry('akshare', 'sina'), entry('akshare', 'eastmoney'),
      { ...entry('tencent'), key: otherKey },
    ], now);
    const pending = result.decisions.find((item) => item.status === 'pending')!;
    expect(pending).toBeDefined();
    const previous = routingInheritedRule(original, pending.scope)!;
    const retained = routingInheritedRule(result.config, pending.scope)!;
    expect(retained.providers).toEqual(previous.providers);
    expect(retained.upstreamSources).toEqual(previous.upstreamSources);
    expect(result.decisions.some((item) => item.scope.market === 'HK' && item.status === 'selected')).toBe(true);
    expect(result.config.rules.find((rule) => rule.scope.market === 'HK')?.providers).toEqual(['tencent']);
    expect(routingAuthoringSchema.safeParse(result.config).success).toBe(true);
    expect(original).toEqual(before);
  });

  it('未配置 Key 时跳过凭证来源，以两家免凭证来源补齐并绑定具体接口', () => {
    const paid = { ...source('futu', true), credentialConfigured: false };
    const draft = recommend(
      [paid, source('akshare'), source('tencent')],
      [entry('futu'), entry('akshare', 'sina'), entry('tencent')],
    );
    expect(selected(draft).providers).toEqual(['akshare', 'tencent']);
    expect(selected(draft).upstreamSources).toEqual({ akshare: 'sina', tencent: 'tencent' });
    expect(draft.rules.every((rule) => !rule.providers.includes('futu'))).toBe(true);
  });

  it('凭证不增加优先级，合格来源遵循大类偏好', () => {
    const providers = [source('akshare'), source('futu', true), source('hithink', true)];
    const draft = recommend(
      providers,
      providers.map((p) => entry(p.providerId)),
    );
    expect(selected(draft).providers).toEqual(['futu', 'akshare']);
    const preferred = config();
    preferred.rules[0]!.providers = ['hithink', 'futu'];
    expect(
      selected(
        recommend(
          providers,
          providers.map((p) => entry(p.providerId)),
          preferred,
        ),
      ).providers,
    ).toEqual(['hithink', 'futu']);
  });

  it('排除停用、配置不完整、目录非就绪及未知提供方', () => {
    const providers = [
      source('akshare'),
      { ...source('disabled'), enabled: false },
      { ...source('missing'), configured: false },
      source('dependency'),
    ];
    const draft = recommend(providers, [
      entry('akshare'),
      entry('disabled'),
      entry('missing'),
      entry('unknown'),
      { ...entry('dependency'), state: 'dependency_missing' },
    ]);
    expect(selected(draft).providers).toEqual(['akshare']);
    for (const state of ['credential_missing', 'not_admitted', 'quota_unavailable'] as const)
      expect(
        selected(recommend([source('akshare')], [{ ...entry('akshare'), state }])).providers,
      ).toEqual([]);
  });

  it('未验证或配置已变化的能力可尝试，明确权限缺失继续排除', () => {
    const checked = { ...source('tushare', true), configVersion: 4, accountAccessSupported: true };
    const allowed = {
      state: 'allowed',
      attempted: true,
      checkedAt: '2026-11-10T07:00:00Z',
      validUntil: '2026-11-11T07:00:00Z',
      configVersion: 4,
    } as const;
    const valid = { ...entry('tushare'), accountAccess: allowed };
    expect(selected(recommend([checked], [valid])).providers).toEqual(['tushare']);
    const bad: MarketRouteCapabilityV3[] = [
      { ...valid, accountAccess: { ...allowed, state: 'permission_missing' } },
      { ...valid, accountAccess: { ...allowed, state: 'not_included' } },
      { ...valid, accountAccess: { ...allowed, state: 'credential_invalid' } },
    ];
    const unverified: MarketRouteCapabilityV3[] = [
      entry('tushare'),
      { ...valid, accountAccess: { ...allowed, state: 'unknown' } },
      { ...valid, accountAccess: { ...allowed, validUntil: '2026-11-10T07:30:00Z' } },
      { ...valid, accountAccess: { ...allowed, configVersion: 3 } },
    ];
    for (const item of bad) expect(selected(recommend([checked], [item])).providers).toEqual([]);
    for (const item of unverified) expect(selected(recommend([checked], [item])).providers).toEqual(['tushare']);
  });

  it('同等多接口保留原配置并待选择，明确绑定后稳定保留', () => {
    const providers = [source('akshare'), source('tencent')];
    const entries = [
      entry('akshare', 'sina'),
      entry('akshare', 'eastmoney'),
      entry('akshare', 'sina'),
      entry('tencent'),
    ];
    const draft = recommend(providers, entries);
    expect(selected(draft).providers).toEqual(['futu', 'akshare']);
    expect(routingRecommendation(config(), 'market', providers, entries, now).decisions[0]?.status).toBe('pending');
    expect(recommend([...providers].reverse(), [...entries].reverse())).toEqual(draft);
    expect(recommend(providers, entries, draft)).toEqual(draft);
    const pinned = config();
    pinned.rules.push({ ...selected(draft), providers: ['akshare', 'tencent'],
      upstreamSources: { akshare: 'sina', tencent: 'tencent' } });
    expect(selected(recommend(providers, entries, pinned)).upstreamSources?.akshare).toBe('sina');
  });

  it('备用优先不同服务上游，只有同源可用时如实说明', () => {
    const draft = config();
    draft.rules[0]!.providers = ['akshare', 'efinance'];
    const entries = [entry('akshare', 'eastmoney'), entry('efinance', 'eastmoney'), entry('tencent')]
      .map((item) => ({ ...item, recommendation: { upstreamGroup: item.target.upstreamSource, reason: '来源声明' } }));
    const providers = ['akshare', 'efinance', 'tencent'].map((id) => source(id));
    expect(selected(recommend(providers, entries, draft)).providers).toEqual(['akshare', 'tencent']);
    const same = routingRecommendation(draft, 'market', providers, entries.slice(0, 2), now);
    expect(selected(same.config).providers).toEqual(['akshare', 'efinance']);
    expect(same.decisions[0]!.reason).toContain('同源备用');
  });

  it('来源按精确接口声明免凭证时，不被提供方总体的凭证要求排除', () => {
    const provider = { ...source('tickflow', true), configured: false, credentialConfigured: false,
      accountAccessSupported: true };
    const draft = recommend([provider], [{ ...entry('tickflow'), credentialRequired: false }]);
    expect(selected(draft).providers).toEqual(['tickflow']);
  });

  it('有明确用途优先级时使用来源声明，不按目录顺序决胜', () => {
    const entries = [entry('akshare', 'sina'), { ...entry('akshare', 'eastmoney'),
      recommendation: { priority: 0, reason: '该精确用途的来源声明' } }];
    expect(selected(recommend([source('akshare')], entries)).upstreamSources?.akshare).toBe('eastmoney');
  });

  it('只使用当前精确绑定的可信读取证据，同等时优先有证据的接口', () => {
    const entries = [entry('akshare', 'sina'), { ...entry('akshare', 'eastmoney'),
      recommendation: { readEvidence: true as const, reason: '当前有效读取准入' } }];
    const result = routingRecommendation(config(), 'market', [source('akshare')], entries, now);
    expect(selected(result.config).upstreamSources?.akshare).toBe('eastmoney');
    expect(result.decisions[0]!.reason).toContain('限已验证范围');
  });

  it('只有一个来源时保留单源，无候选时显式清空，不跨市场和复权补齐', () => {
    expect(selected(recommend([source('tencent')], [entry('tencent')])).providers).toEqual([
      'tencent',
    ]);
    const entries: MarketRouteCapabilityV3[] = [
      { ...entry('akshare'), key: { ...key, market: 'HK' } },
      { ...entry('akshare'), key: { ...key, adjustment: 'hfq' } },
    ];
    expect(selected(recommend([source('akshare')], entries)).providers).toEqual([]);
  });

  it('替换本类全部旧例外及空值，保留其他大类、范围、可信记录与输入', () => {
    const original = config();
    const foreign = { scope: { category: 'research' }, providers: ['hithink'] } as const;
    original.rules.push(
      { ...foreign, providers: [...foreign.providers] },
      {
        scope: {
          category: 'market',
          market: key.market,
          assetType: key.assetType,
          capability: key.capability,
          timeframe: key.timeframe,
          adjustment: key.adjustment,
        },
        providers: [],
      },
    );
    const before = structuredClone(original);
    const draft = recommend([source('tencent')], [entry('tencent')], original);
    expect(selected(draft).providers).toEqual(['tencent']);
    expect(draft.rules.filter((rule) => rule.scope.category === 'research')).toEqual([foreign]);
    expect(draft.keys).toBe(original.keys);
    expect(draft.preserved).toBe(original.preserved);
    expect(original).toEqual(before);
    expect(routingAuthoringSchema.safeParse(draft).success).toBe(true);
  });
});
