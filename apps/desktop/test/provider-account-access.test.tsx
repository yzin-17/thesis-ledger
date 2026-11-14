import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ProviderAccountAccessPanel } from '../src/features/market-data/ProviderAccountAccessPanel.js';
import { accountAccessLabel, nextAccountAccessRefresh } from '../src/features/market-data/provider-account-access.js';
import { selectableRouteTargetsV3 } from '../src/features/market-data/market-data-routes-v3.js';
import { providerExactCapabilities } from '../src/features/market-data/market-provider-capabilities.js';
import { catalog, key, provider, target } from './market-policy-defaults.fixture.js';

describe('逐功能账户访问控制', () => {
  it('限频与暂停分别表达，明确冷却和补查行为', () => {
    const limited = { state: 'unknown', attempted: true, errorCode: 'rate_limited' } as const;
    expect(accountAccessLabel(limited)).toBe('权限待验证 · 请求频率受限');
    expect(accountAccessLabel({ ...limited, attempted: false })).toBe('权限待验证 · 限频后已暂停检查');
    const html = renderToStaticMarkup(<ProviderAccountAccessPanel provider={{ ...provider, accountAccessSupported: true }}
      catalog={{ ...catalog, entries: [{ key, target, state: 'ready', accountAccess: limited }] }} dirty={false} report={null} />);
    expect(html).toContain('冷却期间不会重复请求');
    expect(html).toContain('再次检查只补查待确认功能，保留已确认结果');
  });
  it('逐功能保留缺权限原因，未知与网络失败保留独立分类', () => {
    const denied = { state: 'permission_missing', attempted: true, errorCode: 'permission_denied' } as const;
    const current = { ...catalog, entries: [{ key, target, state: 'ready' as const, accountAccess: denied }] };
    expect(selectableRouteTargetsV3(current, key, [provider])).toHaveLength(0);
    expect(providerExactCapabilities({ ...provider, accountAccessSupported: true }, current)).toHaveLength(1);
    expect(accountAccessLabel(denied)).toBe('当前账户缺少权限');
    expect(accountAccessLabel({ state: 'unknown', attempted: true, errorCode: 'network_failure' })).toBe('权限待验证 · 网络请求未完成');
    const html = renderToStaticMarkup(<ProviderAccountAccessPanel provider={{ ...provider, accountAccessSupported: true }}
      catalog={current} dirty={false} report={null} />);
    expect(html).toContain('当前账户缺少权限');
    expect(html).toContain('已确认可用 0 / 1 项');
    const draftHtml = renderToStaticMarkup(<ProviderAccountAccessPanel provider={{ ...provider, accountAccessSupported: true }}
      catalog={current} dirty report={null} />);
    expect(draftHtml).toContain('已确认可用 0 / 1 项');
    expect(draftHtml).not.toContain('当前账户缺少权限');
  });
  it('当前许可可选，检查过期后允许重新尝试，只刷新内部目录', () => {
    const future = new Date(Date.now() + 300_000).toISOString();
    const access = { state: 'allowed', attempted: true, configVersion: 1, checkedAt: new Date().toISOString(), validUntil: future } as const;
    const current = { ...catalog, entries: [{ key, target, state: 'ready' as const, accountAccess: access }] };
    expect(selectableRouteTargetsV3(current, key, [provider])[0]!.disabled).toBe(false);
    const expired = { ...current, entries: [{ ...current.entries[0]!, accountAccess: { ...access, validUntil: '2020-01-01T00:00:00Z' } }] };
    expect(selectableRouteTargetsV3(expired, key, [provider])[0]!.disabled).toBe(false);
    expect(accountAccessLabel(expired.entries[0]!.accountAccess)).toBe('权限待验证 · 检查已过期');
    expect(nextAccountAccessRefresh([future], Date.parse(future) - 1000)).toBe(1000);
    expect(nextAccountAccessRefresh([])).toBe(false);
    expect(nextAccountAccessRefresh(['2020-01-01T00:00:00Z'])).toBe(false);
    expect(selectableRouteTargetsV3(current, key, [{ ...provider, configVersion: 2 }])[0]!.disabled).toBe(false);
    expect(selectableRouteTargetsV3(catalog, key, [provider])[0]!.disabled).toBe(false);
  });
});
