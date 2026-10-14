import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MarketPolicyPanel } from '../src/features/market-data/MarketPolicyPanel.js';
import { withDefaultHithinkRoutes } from '../src/features/market-data/market-policy-defaults-v3.js';
import { catalog, draft, key, provider, target } from './market-policy-defaults.fixture.js';

describe('HiThink 默认主源', () => {
  it('自动补充精确前复权主源，不修改输入或路由开关', () => {
    const before = structuredClone(draft);
    const next = withDefaultHithinkRoutes(draft, catalog, [provider]);
    expect(next).toEqual({ ...draft, routes: [{ key, targets: [target] }] });
    expect(draft).toEqual(before);
  });
  it('保留已有主备和其他复权口径', () => {
    const current = {
      ...draft,
      routes: [
        {
          key,
          targets: [
            { providerId: 'akshare', upstreamSource: 'eastmoney' },
            { providerId: 'tencent', upstreamSource: 'tencent' },
          ],
        },
        {
          key: { ...key, adjustment: 'none' as const },
          targets: [{ providerId: 'tencent', upstreamSource: 'tencent' }],
        },
      ],
    };
    expect(withDefaultHithinkRoutes(current, catalog, [provider])).toBe(current);
  });
  it.each(['configured', 'enabled', 'credentialConfigured'] as const)(
    '%s未就绪时仍填默认主源，配置与执行状态独立',
    (flag) => {
      expect(withDefaultHithinkRoutes(draft, catalog, [{ ...provider, [flag]: false }]).routes).toEqual([{ key, targets: [target] }]);
    },
  );
  it('完整精确目标可默认选择，目录不完整或目标歧义时保留空路由', () => {
    expect(
      withDefaultHithinkRoutes(
        draft,
        { ...catalog, status: 'partial', entries: [], reason: 'catalog_partial' },
        [provider],
      ),
    ).toBe(draft);
    expect(
      withDefaultHithinkRoutes(
        draft,
        { ...catalog, entries: [{ key, target, state: 'credential_missing' }] },
        [provider],
      ),
    ).toEqual({ ...draft, routes: [{ key, targets: [target] }] });
    expect(
      withDefaultHithinkRoutes(
        draft,
        {
          ...catalog,
          entries: [
            ...catalog.entries,
            { key, target: { ...target, upstreamSource: 'another-contract' }, state: 'ready' },
          ],
        },
        [provider],
      ),
    ).toBe(draft);
  });
  it('路由面板直接编辑主备并使用统一保存入口', () => {
    const html = renderToStaticMarkup(
      <MarketPolicyPanel
        policy={withDefaultHithinkRoutes(draft, catalog, [provider])}
        serverPolicy={null}
        catalog={catalog}
        catalogPending={false}
        catalogQueryFailed={false}
        providers={[provider]}
        disabled={false}
        saving={false}
        retrying={false}
        dirty
        onChange={vi.fn()}
        onSave={vi.fn()}
        onRetry={vi.fn()}
      />,
    );
    expect(html).toContain('HiThink');
    expect(html).toContain('保存路由策略');
    expect(html).not.toContain('预览 HiThink 优先');
    expect(html).not.toContain('应用到草稿');
  });
});
