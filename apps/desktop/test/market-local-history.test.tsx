import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MarketProviderPanel } from '../src/features/market-data/MarketProviderPanel.js';
import {
  dataSourceDisplay,
  type ProviderManifest,
} from '../src/features/market-data/market-data.types.js';
import { providerExactCapabilities } from '../src/features/market-data/market-provider-capabilities.js';

const local = (): ProviderManifest => ({
  providerId: 'official-dividends',
  displayName: '管理人现金分红公告（本地）',
  version: 1,
  configured: true,
  enabled: true,
  credentialConfigured: true,
  sourceKind: 'local_history',
  capabilities: { CASH_DISTRIBUTION: ['ETF'] },
  configurationMode: 'built_in',
  upstreamSources: [
    {
      sourceId: 'cn-etf-cash-notices',
      displayName: '基金管理人现金分红公告',
      capabilities: { CASH_DISTRIBUTION: ['ETF'] },
      localHistory: {
        datasetId: 'cn-510300-cash',
        symbols: ['510300.SH'],
        coverage: { start: '2023-01-03', end: '2023-02-01' },
        updateMode: 'bundled',
      },
    },
  ],
});
const render = (providers: ProviderManifest[]) =>
  renderToStaticMarkup(
    <MarketProviderPanel
      providers={providers}
      disabled={false}
      busyAction={null}
      onProviderChange={() => {}}
      onConfigure={() => {}}
      onTest={() => {}}
      onRemove={() => {}}
    />,
  );

describe('本地历史资料展示', () => {
  it('资料与在线来源沿用同一列表，保留通用来源名称及查看操作', () => {
    const online = {
      ...local(),
      providerId: 'tencent',
      displayName: '腾讯财经',
      sourceKind: 'online' as const,
      upstreamSources: [],
    };
    const html = render([local(), online]);
    expect(html).toContain('aria-label="DSA 市场数据源"');
    expect(html.indexOf('管理人现金分红公告（本地）')).toBeLessThan(html.indexOf('腾讯财经'));
    expect(html).toContain('资料类型：');
    expect(html).toContain('基金管理人现金分红公告');
    expect(html).not.toContain('510300.SH');
    expect(html).toContain('检查资料包');
  });
  it('旧资料清单不补造覆盖日期，路由完整标签明确本地身份及限制', () => {
    const provider = local();
    delete provider.sourceKind;
    delete provider.upstreamSources![0]!.localHistory;
    expect(render([provider])).toContain('基金管理人现金分红公告');
    const label = dataSourceDisplay(provider.providerId, 'cn-etf-cash-notices', [provider]);
    expect(label).toContain('本地资料');
    expect(label).toContain('基金管理人现金分红公告');
    const complete = local();
    expect(dataSourceDisplay(complete.providerId, 'cn-etf-cash-notices', [complete])).toBe(
      '本地资料 · 基金管理人现金分红公告',
    );
  });
  it('读取入口就绪与准入状态保留各自语义', () => {
    const provider = local();
    const entries = [
      {
        key: {
          kind: 'data' as const,
          market: 'CN' as const,
          assetType: 'ETF' as const,
          capability: 'CASH_DISTRIBUTION' as const,
        },
        target: { providerId: provider.providerId, upstreamSource: 'cn-etf-cash-notices' },
        state: 'ready' as const,
      },
    ];
    const catalog = {
      contractVersion: 3 as const,
      consumer: 'thesis-ledger' as const,
      status: 'complete' as const,
      catalogRevision: 1,
      generatedAt: null,
      reason: null,
      entries,
    };
    expect(providerExactCapabilities(provider, catalog)?.[0]?.state).toBe('读取入口就绪');
    expect(providerExactCapabilities({ ...provider, enabled: false }, catalog)?.[0]?.state).toBe(
      '已停用',
    );
  });
});
