import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProviderAccountAccessPanel } from './ProviderAccountAccessPanel.js';
import { parseAccountLevelDraft } from './ProviderAccountLevelFields.js';
import { accountAccessSelectable } from './provider-account-access.js';
import { providerExactCapabilities } from './market-provider-capabilities.js';
import type { MarketRouteCatalogReadV3, ProviderManifest } from './market-data.types.js';
import type { MarketProviderAccountAccessReport } from '@thesis-ledger/schemas';

const provider: ProviderManifest = { providerId: 'tushare', displayName: 'Tushare', version: 1,
  enabled: false, configured: true, credentialConfigured: true, capabilities: {}, configVersion: 2, accountAccessSupported: true,
  settings: { accountLevel: { points: 120, independentApis: [] } } };
const checkedAt = '2026-10-21T08:00:00Z';
const report: MarketProviderAccountAccessReport = { scope: 'account_interfaces', credentialContext: 'current',
  checkedAt, configVersion: 2, persisted: true, accountLevel: { points: 120, independentApis: [] }, routes: [
    { key: { kind: 'bar', market: 'CN', assetType: 'STOCK', capability: 'DAILY_BAR', timeframe: '1d', adjustment: 'none' },
      target: { providerId: 'tushare', upstreamSource: 'tushare' },
      access: { state: 'allowed', attempted: true, configVersion: 2, checkedAt, persisted: true } },
    { key: { kind: 'data', market: 'CN', assetType: 'ETF', capability: 'CASH_DISTRIBUTION' },
      target: { providerId: 'tushare', upstreamSource: 'tushare' },
      access: { state: 'not_included', attempted: false, errorCode: 'account_level_insufficient', configVersion: 2, checkedAt, persisted: true } },
  ] };
const catalog: MarketRouteCatalogReadV3 = { contractVersion: 3, consumer: 'thesis-ledger', status: 'complete',
  catalogRevision: 1, generatedAt: checkedAt, reason: null,
  entries: report.routes.map((route) => ({ ...route, accountAccess: route.access, state: 'ready' as const })),
};

describe('保存的账号等级与功能范围', () => {
  it('积分必须显式填写，不从空输入推定默认等级', () => {
    expect(parseAccountLevelDraft({ points: '', independentApis: [] })).toBeNull();
    expect(parseAccountLevelDraft({ points: '120', independentApis: [] })?.points).toBe(120);
    expect(parseAccountLevelDraft({ points: '-1', independentApis: [] })).toBeNull();
    expect(parseAccountLevelDraft({ points: '120', independentApis: ['rt_k', 'hk_daily'] })?.independentApis).toEqual(['hk_daily', 'rt_k']);
  });
  it('功能说明只展示已确认可用的项目', () => {
    expect(providerExactCapabilities(provider, catalog)).toHaveLength(1);
    const html = renderToStaticMarkup(<ProviderAccountAccessPanel provider={provider} catalog={catalog} report={report} dirty={false} />);
    expect(html).toContain('当前等级未包含 1 项功能');
    expect(html).toContain('权限记录已保存在本地');
    expect(html).not.toContain('现金分红');
  });
  it('持久记录不受旧短缓存限制，配置变化后不再允许新选择', () => {
    expect(accountAccessSelectable(report.routes[0]?.access, Date.now(), 2, true)).toBe(true);
    expect(accountAccessSelectable(report.routes[0]?.access, Date.now(), 3, true)).toBe(false);
    expect(accountAccessSelectable(undefined, Date.now(), 2, true)).toBe(false);
    expect(accountAccessSelectable(report.routes[1]?.access, Date.now(), 2, true)).toBe(false);
  });
});
