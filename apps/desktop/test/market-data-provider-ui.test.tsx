import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MarketPolicyPanel } from '../src/features/market-data/MarketPolicyPanel.js';
import { MarketProviderPanel } from '../src/features/market-data/MarketProviderPanel.js';
import { MarketDataSectionTabs } from '../src/features/market-data/MarketDataSectionTabs.js';
import { InstrumentCatalogPanel } from '../src/features/market-data/InstrumentCatalogPanel.js';
import { parseMarketPolicyResponse } from '../src/features/market-data/market-data.api.js';
import {
  compatibleRouteTargets,
  compatibleProviders,
  type MarketPolicyDraftV3,
  type MarketRouteCatalogReadV3,
  type MarketPolicyV3,
  type ProviderManifest,
} from '../src/features/market-data/market-data.types.js';
import {
  marketPolicyRouteRowsV3,
  readyRouteTargetsV3,
  routeAvailabilityLabelV3,
  routeAvailabilityMessageV3,
  updatePolicyRouteTargetV3,
} from '../src/features/market-data/market-data-routes-v3.js';

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
  upstreamSources: [{ sourceId: providerId, displayName, capabilities: { DAILY_BAR: ['STOCK'] } }],
  credentialSchema: {
    methods:
      configurationMode === 'dsa_environment'
        ? [
            {
              method: 'api_key',
              fields: [{ name: 'apiKey', required: true, secret: true }],
            },
          ]
        : [],
  },
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
      {
        sourceId: 'eastmoney',
        displayName: '东方财富',
        capabilities: { DAILY_BAR: ['STOCK', 'ETF'] },
      },
      {
        sourceId: 'tencent',
        displayName: '腾讯财经',
        capabilities: { DAILY_BAR: ['STOCK', 'ETF'] },
      },
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
    upstreamSources: [
      {
        sourceId: 'tencent',
        displayName: '腾讯财经',
        capabilities: { DAILY_BAR: ['STOCK', 'ETF'] },
      },
    ],
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

const stockNone = {
  kind: 'bar',
  market: 'CN',
  assetType: 'STOCK',
  capability: 'DAILY_BAR',
  timeframe: '1d',
  adjustment: 'none',
} as const;
const stockQfq = { ...stockNone, adjustment: 'qfq' } as const;
const stockHfq = { ...stockNone, adjustment: 'hfq' } as const;
const etfQfq = { ...stockQfq, assetType: 'ETF' } as const;
const stockDividend = {
  kind: 'data',
  market: 'CN',
  assetType: 'STOCK',
  capability: 'DIVIDEND',
} as const;
const akshareEastmoney = { providerId: 'akshare', upstreamSource: 'eastmoney' };
const tencent = { providerId: 'tencent', upstreamSource: 'tencent' };
const v3Catalog: MarketRouteCatalogReadV3 = {
  contractVersion: 3,
  consumer: 'thesis-ledger',
  status: 'complete',
  catalogRevision: 8,
  generatedAt: '2026-09-25T00:00:00Z',
  entries: [
    { key: stockNone, target: akshareEastmoney, state: 'ready' },
    { key: stockNone, target: tencent, state: 'ready' },
    { key: stockQfq, target: akshareEastmoney, state: 'credential_missing' },
    { key: stockQfq, target: tencent, state: 'ready' },
    { key: etfQfq, target: akshareEastmoney, state: 'ready' },
    { key: stockDividend, target: akshareEastmoney, state: 'ready' },
  ],
  reason: null,
};
const v3Draft: MarketPolicyDraftV3 = {
  contractVersion: 3,
  revision: 14,
  enabled: true,
  routes: [
    { key: stockNone, targets: [akshareEastmoney, tencent] },
    { key: stockQfq, targets: [tencent] },
    { key: stockHfq, targets: [akshareEastmoney] },
  ],
};
const v3AppliedPolicy: MarketPolicyV3 = {
  ...v3Draft,
  consumer: 'thesis-ledger',
  requestId: 'policy-14',
  syncState: 'applied',
  dsaRevision: 9,
  effectiveStale: false,
  effectiveProjection: {
    contractVersion: 3,
    consumer: 'thesis-ledger',
    requestId: 'policy-14',
    revision: 9,
    sourceDesiredRevision: 14,
    enabled: true,
    routes: v3Draft.routes.map((route) => ({
      ...route,
      targets: route.targets.map((target, routeIndex) => ({
        ...target,
        routeIndex,
        eligible: true,
        reason: null,
      })),
      reason: null,
    })),
    appliedAt: '2026-09-25T00:00:00Z',
  },
};

describe('市场数据 Provider 与主备路由', () => {
  it('拒绝旧合同策略响应，保留 V3 的精确路由', () => {
    expect(parseMarketPolicyResponse(v3AppliedPolicy).routes).toEqual(v3Draft.routes);
    expect(() => parseMarketPolicyResponse({ ...v3AppliedPolicy, contractVersion: 2 })).toThrow(
      '需要 V3 策略',
    );
  });

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

  it('路由候选是 manifest 声明的 adapter/source 组合', () => {
    expect(
      compatibleRouteTargets(providers, 'DAILY_BAR', 'ETF').map((option) => option.target),
    ).toEqual([
      { providerId: 'akshare', upstreamSource: 'eastmoney' },
      { providerId: 'akshare', upstreamSource: 'tencent' },
      { providerId: 'tencent', upstreamSource: 'tencent' },
    ]);
  });

  it('V3 候选只来自完整精确目录的 ready 项，并为价格口径生成独立路由', () => {
    const rows = marketPolicyRouteRowsV3(v3Catalog, v3Draft);
    const stockRows = rows.filter((row) => row.key.kind === 'bar' && row.key.assetType === 'STOCK');

    expect(stockRows.map((row) => row.key.kind === 'bar' && row.key.adjustment)).toEqual([
      'none',
      'qfq',
      'hfq',
    ]);
    expect(
      readyRouteTargetsV3(v3Catalog, stockQfq, providers).map((option) => option.target),
    ).toEqual([tencent]);
    expect(readyRouteTargetsV3(v3Catalog, stockHfq, providers)).toEqual([]);
    expect(
      readyRouteTargetsV3(
        { ...v3Catalog, status: 'partial', entries: [], reason: 'catalog_partial' },
        stockNone,
        providers,
      ),
    ).toEqual([]);
    expect(routeAvailabilityMessageV3(v3Catalog, stockQfq)).toBe('凭据缺失');
    expect(routeAvailabilityLabelV3('insufficient_coverage')).toBe('覆盖范围不足');
    expect(routeAvailabilityLabelV3('policy_not_applied')).toBe('期望路由尚未生效');
    expect(rows.find((row) => row.key.kind === 'data')?.label).toContain('现金分红');
    expect(rows.find((row) => row.key.kind === 'data')?.label).not.toContain('复权');
  });

  it('V3 编辑只改精确 routeKey，不串改其他复权口径', () => {
    const changed = updatePolicyRouteTargetV3(v3Draft, stockQfq, 'primary', tencent);

    expect(
      changed.routes.find((route) => route.key.kind === 'bar' && route.key.adjustment === 'none')
        ?.targets,
    ).toEqual([akshareEastmoney, tencent]);
    expect(
      changed.routes.find((route) => route.key.kind === 'bar' && route.key.adjustment === 'qfq')
        ?.targets,
    ).toEqual([tencent]);
    expect(
      changed.routes.find((route) => route.key.kind === 'bar' && route.key.adjustment === 'hfq')
        ?.targets,
    ).toEqual([akshareEastmoney]);
  });

  it('Provider 清单为全部 DSA 数据源提供路由配置操作', () => {
    const html = renderToStaticMarkup(
      <MarketProviderPanel
        providers={providers}
        disabled={false}
        busyAction={null}
        onProviderChange={vi.fn()}
        onConfigure={vi.fn()}
        onTest={vi.fn()}
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
    expect(html).toContain('尚未配置凭证');
    expect(html).not.toContain('保存设置');
    expect(html.match(/>配置凭证</g)).toHaveLength(5);
    expect(html.match(/测试连接/g)).toHaveLength(11);
  });

  it('路由面板明确渲染主数据源和备用数据源', () => {
    const html = renderToStaticMarkup(
      <MarketPolicyPanel
        policy={v3Draft}
        serverPolicy={v3AppliedPolicy}
        catalog={v3Catalog}
        catalogPending={false}
        catalogQueryFailed={false}
        providers={providers}
        disabled={false}
        saving={false}
        retrying={false}
        dirty={true}
        onChange={vi.fn()}
        onSave={vi.fn()}
        onRetry={vi.fn()}
      />,
    );

    expect(html).toContain('主数据源');
    expect(html).toContain('备用数据源');
    expect(html).toContain('中国内地股票 · 日线行情（日线／不复权） 主数据源');
    expect(html).toContain('AKShare · 东方财富');
    expect(html).toContain('腾讯财经');
    expect(html).not.toContain('旧版主备设置已保留');
    expect(html).toContain('保存后为 15');
    expect(html).toContain('保存路由策略');
    expect(html).not.toContain('第 14 版');
    expect(html).not.toContain('上移');
  });

  it('V3 面板区分期望修订和生效修订，并呈现已生效状态', () => {
    const html = renderToStaticMarkup(
      <MarketPolicyPanel
        policy={v3Draft}
        serverPolicy={v3AppliedPolicy}
        catalog={v3Catalog}
        catalogPending={false}
        catalogQueryFailed={false}
        providers={providers}
        disabled={false}
        saving={false}
        retrying={false}
        dirty={false}
        onChange={vi.fn()}
        onSave={vi.fn()}
        onRetry={vi.fn()}
      />,
    );

    expect(html).toContain('期望修订：14');
    expect(html).toContain('生效修订：9（对应期望 14）');
    expect(html).toContain('已生效');
  });

  it('partial 目录下显示保存的路由但禁用选择和保存', () => {
    const html = renderToStaticMarkup(
      <MarketPolicyPanel
        policy={v3Draft}
        serverPolicy={v3AppliedPolicy}
        catalog={{ ...v3Catalog, status: 'partial', entries: [], reason: 'catalog_partial' }}
        catalogPending={false}
        catalogQueryFailed={false}
        providers={providers}
        disabled={false}
        saving={false}
        retrying={false}
        dirty={false}
        onChange={vi.fn()}
        onSave={vi.fn()}
        onRetry={vi.fn()}
      />,
    );

    expect(html).toContain('路由能力目录尚未完整');
    expect(html).toContain('AKShare · 东方财富');
    const selectors = html.match(/<button\b[^>]*role="combobox"[^>]*>/g) ?? [];
    expect(selectors).toHaveLength(6);
    expect(selectors.every((selector) => selector.includes('disabled=""'))).toBe(true);
    const saveButton = html.match(/<button\b[^>]*>保存路由策略<\/button>/)?.[0];
    expect(saveButton).toContain('disabled=""');
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
