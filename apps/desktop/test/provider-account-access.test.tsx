import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ProviderAccountAccessPanel } from '../src/features/market-data/ProviderAccountAccessPanel.js';
import { accountAccessLabel, nextAccountAccessRefresh } from '../src/features/market-data/provider-account-access.js';
import { selectableRouteTargetsV3 } from '../src/features/market-data/market-data-routes-v3.js';
import { providerExactCapabilities } from '../src/features/market-data/market-provider-capabilities.js';
import { catalog, key, provider, target } from './market-policy-defaults.fixture.js';

describe('逐功能账户访问控制', () => {
  it('缺权限条目保留禁用，未知/网络失败不显示缺权限', () => {
    const denied = { state: 'permission_missing', attempted: true, errorCode: 'permission_denied' } as const;
    const current = { ...catalog, entries: [{ key, target, state: 'ready' as const, accountAccess: denied }] };
    expect(selectableRouteTargetsV3(current, key, [provider])[0]).toMatchObject({ disabled: true });
    expect(selectableRouteTargetsV3(current, key, [provider])[0]!.label).toContain('当前账户缺少权限');
    expect(providerExactCapabilities(provider, current)![0]!.state).toBe('当前账户缺少权限');
    expect(accountAccessLabel({ state: 'unknown', attempted: true, errorCode: 'network_failure' })).toBe('权限待验证 · 网络请求未完成');
    const html = renderToStaticMarkup(<ProviderAccountAccessPanel provider={{ ...provider, accountAccessSupported: true }}
      catalog={current} dirty={false} report={null} />);
    expect(html).toContain('当前账户缺少权限');
    const draftHtml = renderToStaticMarkup(<ProviderAccountAccessPanel provider={{ ...provider, accountAccessSupported: true }}
      catalog={current} dirty report={null} />);
    expect(draftHtml).toContain('权限待验证');
    expect(draftHtml).not.toContain('当前账户缺少权限');
  });
  it('当前许可可选，检查过期后禁选，只刷新内部目录', () => {
    const future = new Date(Date.now() + 300_000).toISOString();
    const access = { state: 'allowed', attempted: true, configVersion: 1, checkedAt: new Date().toISOString(), validUntil: future } as const;
    const current = { ...catalog, entries: [{ key, target, state: 'ready' as const, accountAccess: access }] };
    expect(selectableRouteTargetsV3(current, key, [provider])[0]!.disabled).toBe(false);
    const expired = { ...current, entries: [{ ...current.entries[0]!, accountAccess: { ...access, validUntil: '2020-01-01T00:00:00Z' } }] };
    expect(selectableRouteTargetsV3(expired, key, [provider])[0]!.disabled).toBe(true);
    expect(accountAccessLabel(expired.entries[0]!.accountAccess)).toBe('权限待验证 · 检查已过期');
    expect(nextAccountAccessRefresh([future], Date.parse(future) - 1000)).toBe(1000);
    expect(nextAccountAccessRefresh([])).toBe(false);
    expect(nextAccountAccessRefresh(['2020-01-01T00:00:00Z'])).toBe(false);
    expect(selectableRouteTargetsV3(current, key, [{ ...provider, configVersion: 2 }])[0]!.disabled).toBe(true);
    expect(selectableRouteTargetsV3(catalog, key, [provider])[0]!.disabled).toBe(false);
  });
});
