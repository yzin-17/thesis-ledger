import { describe, expect, it } from 'vitest';
import type { MarketRouteCapabilityV3, RoutingAuthoring } from '@thesis-ledger/schemas';
import type { ProviderManifest } from '../src/features/market-data/market-data.types.js';
import { routingRecommendation } from '../src/features/market-data/routing-recommendation.js';
import { key } from './market-policy-defaults.fixture.js';

const providers: ProviderManifest[] = ['futu', 'akshare', 'hithink', 'tushare'].map((providerId) => ({
  providerId, displayName: providerId, version: 1, capabilities: {}, enabled: true, configured: true,
  requiresCredential: false, credentialConfigured: false,
}));
const entry = (providerId: string, upstreamSource: string): MarketRouteCapabilityV3 => ({
  key, target: { providerId, upstreamSource }, state: 'ready',
});
const config = (): RoutingAuthoring => ({
  version: 1, keys: [key], preserved: [], rules: [
    { scope: { category: 'market' }, providers: ['futu', 'akshare'] },
    { scope: { category: 'market', market: key.market, assetType: key.assetType,
      capability: key.capability, timeframe: key.timeframe, adjustment: key.adjustment },
    providers: ['hithink', 'akshare'], upstreamSources: { hithink: 'history', akshare: 'eastmoney' } },
  ],
});
const catalog = [entry('hithink', 'history'), entry('akshare', 'eastmoney'), entry('akshare', 'sina')];

describe('已选具体来源在推荐并列时的状态', () => {
  it('替换主源并列时保留合格的完整原主备，并标记已确定', () => {
    const original = config(), before = structuredClone(original);
    const result = routingRecommendation(original, 'market', providers, catalog);
    expect(result.decisions[0]).toMatchObject({ status: 'selected', reason: '推荐候选条件相同，保留现有已选来源' });
    expect(result.config.rules.find((rule) => rule.scope.capability)).toEqual(original.rules[1]);
    expect(original).toEqual(before);
  });

  it('替换主源确定但备用并列时，保留合格的整组原主备', () => {
    const original = config();
    original.rules[1]!.providers = ['hithink', 'tushare'];
    original.rules[1]!.upstreamSources = { hithink: 'history', tushare: 'tushare' };
    const result = routingRecommendation(original, 'market', providers,
      [...catalog, entry('futu', 'futu'), entry('tushare', 'tushare')]);
    expect(result.decisions[0]?.status).toBe('selected');
    expect(result.config.rules.find((rule) => rule.scope.capability)).toEqual(original.rules[1]);
  });

  it('现有单源已绑定且合格时保留已选来源', () => {
    const original = config();
    original.rules[1]!.providers = ['hithink'];
    original.rules[1]!.upstreamSources = { hithink: 'history' };
    expect(routingRecommendation(original, 'market', providers, catalog).decisions[0]?.status).toBe('selected');
  });

  it('已有来源的账号权限被拒绝时保持待选择', () => {
    const currentProviders = structuredClone(providers), currentCatalog = structuredClone(catalog);
    Object.assign(currentProviders.find((provider) => provider.providerId === 'hithink')!, {
      requiresCredential: true, credentialConfigured: true, accountAccessSupported: true, configVersion: 1,
    });
    currentCatalog[0]!.accountAccess = { state: 'permission_missing', attempted: true,
      checkedAt: '2026-11-11T00:00:00Z', validUntil: '2099-01-01T00:00:00Z', configVersion: 1 };
    expect(routingRecommendation(config(), 'market', currentProviders, currentCatalog).decisions[0]?.status).toBe('pending');
  });

  it.each(['missing-pin', 'unknown-pin', 'disabled', 'credential-missing', 'wrong-market'])(
    '现有绑定不完整或不合格时保留待选状态：%s', (mode) => {
      const original = config();
      const currentProviders = structuredClone(providers), currentCatalog = structuredClone(catalog);
      if (mode === 'missing-pin') delete original.rules[1]!.upstreamSources!.hithink;
      if (mode === 'unknown-pin') original.rules[1]!.upstreamSources!.hithink = 'removed';
      if (mode === 'disabled') currentProviders.find((provider) => provider.providerId === 'hithink')!.enabled = false;
      if (mode === 'credential-missing') currentCatalog[0]!.state = 'credential_missing';
      if (mode === 'wrong-market') currentCatalog[0]!.key = { ...key, market: 'HK' };
      const result = routingRecommendation(original, 'market', currentProviders, currentCatalog);
      expect(result.decisions[0]?.status).toBe('pending');
      expect(result.config.rules.find((rule) => rule.scope.capability)).toEqual(original.rules[1]);
    },
  );
});
