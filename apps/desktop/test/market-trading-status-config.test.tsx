import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MarketPolicyRoutes } from '../src/features/market-data/MarketPolicyRoutes.js';
import {
  marketPolicyRouteRowsV3,
  readyRouteTargetsV3,
  routeAvailabilityMessageV3,
} from '../src/features/market-data/market-data-routes-v3.js';
import type {
  MarketPolicyDraftV3,
  MarketRouteCatalogReadV3,
  ProviderManifest,
} from '../src/features/market-data/market-data.types.js';

const key = {
  kind: 'data',
  market: 'CN',
  assetType: 'STOCK',
  capability: 'HISTORICAL_TRADING_STATUS',
} as const;
const target = { providerId: 'official-states', upstreamSource: 'cn-stock-daily-suspension' };
const provider: ProviderManifest = {
  providerId: target.providerId,
  displayName: '发行人停复牌公告（本地）',
  version: 1,
  capabilities: { HISTORICAL_TRADING_STATUS: ['STOCK'] },
  markets: ['CN'],
  configured: true,
  enabled: true,
  credentialConfigured: false,
  requiresCredential: false,
  configurationMode: 'built_in',
  upstreamSources: [
    {
      sourceId: target.upstreamSource,
      displayName: '皇台酒业日级停复牌（2023-08-16～21）',
      capabilities: { HISTORICAL_TRADING_STATUS: ['STOCK'] },
    },
  ],
};
const policy: MarketPolicyDraftV3 = {
  contractVersion: 3,
  revision: 1,
  enabled: true,
  routes: [{ key, targets: [target] }],
};
const catalog: MarketRouteCatalogReadV3 = {
  contractVersion: 3,
  consumer: 'thesis-ledger',
  status: 'complete',
  catalogRevision: 1,
  generatedAt: '2026-10-06T00:00:00Z',
  reason: null,
  entries: [{ key, target, state: 'ready' }],
};
const render = (input = catalog, draft = policy) =>
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

describe('历史停复牌配置消费', () => {
  it('目录中的真实能力复用中文分组和主备选择器', () => {
    const html = render();
    expect(html).toContain('交易状态与风险规则');
    expect(html).toContain('中国内地股票 · 历史停复牌 主数据源');
    expect(html).toContain('皇台酒业日级停复牌（2023-08-16～21）');
    expect(html.match(/role="combobox"/g)).toHaveLength(2);
    expect(html).not.toContain('HISTORICAL_TRADING_STATUS');
    expect(html).not.toContain('行情与市场数据');
    expect(marketPolicyRouteRowsV3(catalog, policy)).toHaveLength(1);
  });

  it('不生成不存在的状态能力，partial 目录保留已存配置并禁用修改', () => {
    const unavailable = {
      ...catalog,
      entries: [{ key, target, state: 'not_admitted' as const }],
    };
    expect(readyRouteTargetsV3(unavailable, key, [provider])).toEqual([]);
    expect(render(unavailable)).toContain(routeAvailabilityMessageV3(unavailable, key));
    const empty = { ...catalog, entries: [] };
    expect(render(empty, { ...policy, routes: [] })).not.toContain('交易状态与风险规则');
    expect(marketPolicyRouteRowsV3(empty, { ...policy, routes: [] })).toEqual([]);
    const html = render({ ...empty, status: 'partial', reason: 'catalog_partial' });
    expect(html).toContain('历史停复牌');
    expect(html).toContain('皇台酒业日级停复牌（2023-08-16～21）');
    const selectors = html.match(/<button\b[^>]*role="combobox"[^>]*>/g) ?? [];
    expect(selectors).toHaveLength(2);
    expect(selectors.every((selector) => selector.includes('disabled=""'))).toBe(true);
  });
});
