import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MarketPolicyRoutes } from '../src/features/market-data/MarketPolicyRoutes.js';
import { marketPolicyRouteRowsV3 } from '../src/features/market-data/market-data-routes-v3.js';
import type {
  MarketPolicyDraftV3,
  MarketRouteCatalogReadV3,
  ProviderManifest,
} from '../src/features/market-data/market-data.types.js';

const feeKey = {
  kind: 'data',
  market: 'CN',
  assetType: 'STOCK',
  capability: 'HISTORICAL_PUBLIC_FEES',
} as const;
const target = { providerId: 'official-rules', upstreamSource: 'cn-stock-auction-fees' };
const policy: MarketPolicyDraftV3 = {
  contractVersion: 3,
  revision: 1,
  enabled: true,
  routes: [{ key: feeKey, targets: [target] }],
};
const catalog: MarketRouteCatalogReadV3 = {
  contractVersion: 3,
  consumer: 'thesis-ledger',
  status: 'complete',
  catalogRevision: 1,
  generatedAt: '2026-10-06T00:00:00Z',
  reason: null,
  entries: [{ key: feeKey, target, state: 'ready' }],
};
const provider: ProviderManifest = {
  providerId: target.providerId,
  displayName: '官方公开规则（本地）',
  version: 1,
  capabilities: { HISTORICAL_PUBLIC_FEES: ['STOCK'] },
  configured: true,
  enabled: true,
  credentialConfigured: false,
  requiresCredential: false,
  configurationMode: 'built_in',
  markets: ['CN'],
  upstreamSources: [
    {
      sourceId: target.upstreamSource,
      displayName: '上交所 A 股费率（2023-08-25～29）',
      capabilities: { HISTORICAL_PUBLIC_FEES: ['STOCK'] },
    },
  ],
};

const renderRoutes = (input: MarketRouteCatalogReadV3, draft = policy) =>
  renderToStaticMarkup(
    <MarketPolicyRoutes
      policy={draft}
      serverPolicy={null}
      catalog={input}
      providers={[provider]}
      disabled={false}
      dirty={false}
      onChange={vi.fn()}
    />,
  );

describe('公共收费配置消费', () => {
  it('真实目录能力进入历史分组，主源回显和选择器均显示中文来源', () => {
    const html = renderRoutes(catalog);
    expect(html).toContain('<legend');
    expect(html).toContain('分红拆分与公共收费');
    expect(html).toContain('中国内地股票 · 历史公共收费 主数据源');
    expect(html).toContain('上交所 A 股费率（2023-08-25～29）');
    expect(html.match(/role="combobox"/g)).toHaveLength(2);
    expect(html).not.toContain('HISTORICAL_PUBLIC_FEES');
    expect(html).not.toContain('行情与市场数据');
    expect(marketPolicyRouteRowsV3(catalog, policy)).toHaveLength(1);
  });

  it('仅生成来源实际提供的能力，目录未就绪时保留已存收费路由', () => {
    const empty = { ...catalog, entries: [] };
    expect(renderRoutes(empty, { ...policy, routes: [] })).not.toContain('历史规则与状态');
    expect(marketPolicyRouteRowsV3(empty, { ...policy, routes: [] })).toEqual([]);
    const html = renderRoutes({ ...empty, status: 'partial', reason: 'catalog_partial' });
    expect(html).toContain('历史公共收费');
    expect(html).toContain('上交所 A 股费率（2023-08-25～29）');
    const selectors = html.match(/<button\b[^>]*role="combobox"[^>]*>/g) ?? [];
    expect(selectors).toHaveLength(2);
    expect(selectors.every((selector) => selector.includes('disabled=""'))).toBe(true);
  });
});
