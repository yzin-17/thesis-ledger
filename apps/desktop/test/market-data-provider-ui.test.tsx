import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MarketCachePanel } from '../src/features/market-data/MarketCachePanel.js';
import { MarketPolicyPanel } from '../src/features/market-data/MarketPolicyPanel.js';
import { MarketProviderPanel } from '../src/features/market-data/MarketProviderPanel.js';
import {
  compatibleProviders,
  updateRouteRole,
  type MarketPolicy,
  type ProviderManifest,
} from '../src/features/market-data/market-data.types.js';

const providers: ProviderManifest[] = [
  {
    providerId: 'akshare',
    displayName: 'AKShare',
    version: 1,
    capabilities: { DAILY_BAR: ['STOCK', 'ETF'], REALTIME_QUOTE: ['STOCK', 'ETF'] },
    configured: true,
    enabled: true,
    credentialConfigured: false,
    origin: 'dsa',
    upstreamSources: [
      { sourceId: 'eastmoney', displayName: '东方财富' },
      { sourceId: 'tencent', displayName: '腾讯财经' },
    ],
  },
  {
    providerId: 'tencent',
    displayName: '腾讯财经',
    version: 1,
    capabilities: { DAILY_BAR: ['STOCK', 'ETF'] },
    configured: true,
    enabled: true,
    credentialConfigured: false,
    origin: 'dsa',
    upstreamSources: [{ sourceId: 'tencent', displayName: '腾讯财经' }],
    updatedAt: '2026-09-08T00:00:00Z',
  },
  {
    providerId: 'efinance',
    displayName: 'efinance',
    version: 1,
    capabilities: { DAILY_BAR: ['STOCK', 'ETF'] },
    configured: true,
    enabled: false,
    credentialConfigured: false,
  },
];

const policy: MarketPolicy = {
  revision: 14,
  enabled: true,
  routes: {
    DAILY_BAR: { STOCK: ['akshare', 'tencent'], ETF: ['akshare', 'tencent'] },
  },
  syncState: 'applied',
};

describe('市场数据 Provider 与主备路由', () => {
  it('只把启用、已配置且兼容的数据源放入候选', () => {
    expect(
      compatibleProviders(providers, 'DAILY_BAR', 'ETF').map((item) => item.providerId),
    ).toEqual(['akshare', 'tencent']);
    expect(
      compatibleProviders(providers, 'REALTIME_QUOTE', 'ETF').map((item) => item.providerId),
    ).toEqual(['akshare']);
  });

  it('用两个角色维护有序路由并阻止主备重复', () => {
    const changedPrimary = updateRouteRole(policy, 'DAILY_BAR', 'ETF', 'primary', 'tencent');
    expect(changedPrimary.routes.DAILY_BAR?.ETF).toEqual(['tencent']);

    const changedFallback = updateRouteRole(policy, 'DAILY_BAR', 'ETF', 'fallback', 'akshare');
    expect(changedFallback.routes.DAILY_BAR?.ETF).toEqual(['akshare']);
  });

  it('Provider 清单展示 DSA、手动配置、能力和上游通道', () => {
    const html = renderToStaticMarkup(
      <MarketProviderPanel
        providers={providers}
        credentials={{}}
        disabled={false}
        busyAction={null}
        onProviderChange={vi.fn()}
        onCredentialChange={vi.fn()}
        onSave={vi.fn()}
        onTest={vi.fn()}
        onClearCredential={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(html).toContain('DSA 提供');
    expect(html).toContain('DSA 默认');
    expect(html).toContain('手动配置');
    expect(html).toContain('上游通道：');
    expect(html).toContain('腾讯财经');
  });

  it('路由面板明确渲染主数据源和备用数据源', () => {
    const html = renderToStaticMarkup(
      <MarketPolicyPanel
        policy={policy}
        providers={providers}
        disabled={false}
        saving={false}
        onChange={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    expect(html).toContain('主数据源');
    expect(html).toContain('备用数据源');
    expect(html).toContain('日线 Bar 主数据源');
    expect(html).not.toContain('上移');
  });

  it('缓存面板显示腾讯作为实际取数来源', () => {
    const html = renderToStaticMarkup(
      <MarketCachePanel
        providers={providers}
        loading={false}
        error={false}
        cache={{
          barCount: 243,
          symbolCount: 1,
          latestMarketDate: '2026-09-08T00:00:00Z',
          updatedAt: '2026-09-08T09:00:00Z',
          sources: [{ provider: 'akshare', upstreamSource: 'tencent', count: 243 }],
        }}
      />,
    );

    expect(html).toContain('本地日线缓存');
    expect(html).toContain('AKShare · 腾讯财经');
    expect(html).toContain('243 条');
  });
});
