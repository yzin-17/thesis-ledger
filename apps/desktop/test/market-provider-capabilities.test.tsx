import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MarketProviderPanel } from '../src/features/market-data/MarketProviderPanel.js';
import { providerExactCapabilities } from '../src/features/market-data/market-provider-capabilities.js';
import { selectableRouteTargetsV3 } from '../src/features/market-data/market-data-routes-v3.js';
import { catalog, key, provider, target } from './market-policy-defaults.fixture.js';

describe('数据源功能与路由共用精确库存', () => {
  it('能力描述、口径、状态与可选目标一致', () => {
    const current = { ...catalog, entries: [{ key, target, state: 'credential_missing' as const }] };
    const declared = { ...provider, capabilities: { MINUTE_BAR: ['STOCK'] }, credentialConfigured: false };
    const capabilities = providerExactCapabilities(declared, current)!;
    expect(capabilities).toHaveLength(1);
    expect(capabilities[0]!.label).toContain('前复权');
    expect(capabilities[0]!.state).toBe('凭据缺失');
    expect(selectableRouteTargetsV3(current, key, [declared])).toHaveLength(1);
    const html = renderToStaticMarkup(<MarketProviderPanel providers={[declared]} catalog={current}
      disabled={false} busyAction={null} onProviderChange={vi.fn()} onConfigure={vi.fn()}
      onTest={vi.fn()} onRemove={vi.fn()} />);
    expect(html).toContain('中国内地ETF');
    expect(html).toContain('前复权');
    expect(html).not.toContain('MINUTE_BAR');
    expect(html).not.toContain('分钟行情');
  });

  it('停用状态可解释并仍允许选择', () => {
    const disabled = { ...provider, enabled: false };
    expect(providerExactCapabilities(disabled, catalog)![0]!.state).toBe('已停用');
    expect(selectableRouteTargetsV3(catalog, key, [disabled])[0]!.label).toContain('已停用');
  });

  it('没有精确接入时不把宽 SDK 声明当作路由功能', () => {
    expect(providerExactCapabilities(provider, { ...catalog, entries: [] })).toEqual([]);
    expect(providerExactCapabilities(provider, undefined)).toBeNull();
  });
});
