import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MarketPolicyPanel } from '../src/features/market-data/MarketPolicyPanel.js';
import { MarketProviderPanel } from '../src/features/market-data/MarketProviderPanel.js';
import { MarketDataSectionTabs } from '../src/features/market-data/MarketDataSectionTabs.js';
import { InstrumentCatalogPanel } from '../src/features/market-data/InstrumentCatalogPanel.js';
import {
  compatibleProviders,
  updateRouteRole,
  type MarketPolicy,
  type ProviderManifest,
} from '../src/features/market-data/market-data.types.js';

const routeProvider = (
  providerId: string,
  displayName: string,
  markets: string[],
  configurationMode: 'built_in' | 'dsa_environment' = 'built_in',
): ProviderManifest => ({
  providerId,
  displayName,
  version: 1,
  capabilities: { DAILY_BAR: ['STOCK'] },
  configured: configurationMode === 'built_in',
  enabled: true,
  credentialConfigured: false,
  requiresCredential: configurationMode === 'dsa_environment',
  origin: 'dsa',
  markets,
  configurationMode,
});

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
    markets: ['CN'],
    configurationMode: 'control',
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
    markets: ['CN'],
    configurationMode: 'control',
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
    markets: ['CN'],
    configurationMode: 'control',
  },
  routeProvider('tushare', 'Tushare Pro', ['CN', 'HK'], 'dsa_environment'),
  routeProvider('tickflow', 'TickFlow', ['CN'], 'dsa_environment'),
  routeProvider('pytdx', '通达信（pytdx）', ['CN']),
  routeProvider('baostock', 'BaoStock', ['CN']),
  routeProvider('yfinance', 'Yahoo Finance', ['CN', 'HK', 'US', 'JP', 'KR', 'TW']),
  routeProvider('longbridge', 'Longbridge', ['HK', 'US'], 'dsa_environment'),
  routeProvider('finnhub', 'Finnhub', ['US'], 'dsa_environment'),
  routeProvider('alphavantage', 'Alpha Vantage', ['US'], 'dsa_environment'),
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
  it('用三个一级 Tab 分隔任务并默认打开路由策略', () => {
    const html = renderToStaticMarkup(
      <MarketDataSectionTabs
        providerPanel={<div>provider-panel</div>}
        policyPanel={<div>policy-panel</div>}
        catalogPanel={<div>catalog-panel</div>}
      />,
    );

    expect(html).toContain('aria-label="市场数据功能"');
    expect(html.match(/role="tab"/g)).toHaveLength(3);
    expect(html).toContain('>数据源<');
    expect(html).toContain('>路由策略<');
    expect(html).toContain('>标的目录<');
    expect(html.indexOf('>路由策略<')).toBeLessThan(html.indexOf('>数据源<'));
    expect(html).toMatch(/role="tab"[^>]*aria-selected="true"[^>]*>路由策略</);
    expect(html).toContain('policy-panel');
  });

  it('按能力与标的类型提供全部兼容数据源', () => {
    expect(
      compatibleProviders(providers, 'DAILY_BAR', 'ETF').map((item) => item.providerId),
    ).toEqual(['akshare', 'tencent', 'efinance']);
    expect(
      compatibleProviders(providers, 'REALTIME_QUOTE', 'ETF').map((item) => item.providerId),
    ).toEqual(['akshare']);
    expect(
      compatibleProviders(providers, 'DAILY_BAR', 'STOCK').map((item) => item.providerId),
    ).toEqual([
      'akshare',
      'tencent',
      'efinance',
      'tushare',
      'tickflow',
      'pytdx',
      'baostock',
      'yfinance',
      'longbridge',
      'finnhub',
      'alphavantage',
    ]);
  });

  it('用两个角色维护有序路由并阻止主备重复', () => {
    const changedPrimary = updateRouteRole(policy, 'DAILY_BAR', 'ETF', 'primary', 'tencent');
    expect(changedPrimary.routes.DAILY_BAR?.ETF).toEqual(['tencent']);

    const changedFallback = updateRouteRole(policy, 'DAILY_BAR', 'ETF', 'fallback', 'akshare');
    expect(changedFallback.routes.DAILY_BAR?.ETF).toEqual(['akshare']);
  });

  it('Provider 清单为全部 DSA 数据源提供路由配置操作', () => {
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

    expect(html).toContain('11 个来源');
    expect(html).toContain('5 个可用');
    expect(html).toContain('DSA 默认');
    expect(html).toContain('手动配置');
    expect(html).not.toContain('可参与路由');
    expect(html).toContain('Yahoo Finance');
    expect(html).toContain('Tushare Pro');
    expect(html).toContain('Alpha Vantage');
    expect(html).toContain('市场：中国内地、港股、美股、日股、韩股、台股');
    expect(html).toContain('上游：');
    expect(html).toContain('腾讯财经');
    expect(html).toContain('请在 DSA 环境配置凭证');
    expect(html.match(/保存设置/g)).toHaveLength(11);
    expect(html.match(/只读测试/g)).toHaveLength(11);
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
    expect(html).toContain('保存路由策略');
    expect(html).not.toContain('第 14 版');
    expect(html).not.toContain('上移');
  });

  it('标的目录展示有效数量但不暴露技术版本号', () => {
    const html = renderToStaticMarkup(
      <InstrumentCatalogPanel
        catalog={{ generation: 13, instrumentCount: 34962 }}
        disabled={false}
        syncing={false}
        searchBusy={false}
        searchResults={[]}
        confirmingId={null}
        onSync={vi.fn()}
        onSearch={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(html).toContain('34,962');
    expect(html).not.toContain('目录版本');
    expect(html).not.toContain('第 13 版');
  });
});
