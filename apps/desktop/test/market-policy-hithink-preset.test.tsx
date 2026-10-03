import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MarketPolicyPreset } from '../src/features/market-data/MarketPolicyPreset.js';
import {
  hithinkPolicyPreset,
  applyHithinkPolicyPreset,
} from '../src/features/market-data/market-policy-hithink-preset.js';
import type {
  MarketPolicyDraftV3,
  MarketRouteCatalogReadV3,
  ProviderManifest,
} from '../src/features/market-data/market-data.types.js';

const key = {
  kind: 'bar',
  market: 'CN',
  assetType: 'ETF',
  capability: 'DAILY_BAR',
  timeframe: '1d',
  adjustment: 'qfq',
} as const;
const target = { providerId: 'hithink', upstreamSource: 'hithink-financial-api' };
const provider: ProviderManifest = {
  providerId: 'hithink',
  displayName: 'HiThink',
  version: 1,
  capabilities: {},
  configured: true,
  enabled: true,
  credentialConfigured: true,
};
const draft: MarketPolicyDraftV3 = { contractVersion: 3, revision: 4, enabled: false, routes: [] };
const catalog: MarketRouteCatalogReadV3 = {
  contractVersion: 3,
  consumer: 'thesis-ledger',
  status: 'complete',
  catalogRevision: 9,
  generatedAt: '2026-09-26T00:00:00Z',
  reason: null,
  entries: [{ key, target, state: 'ready' }],
};

describe('HiThink优先预设', () => {
  it('预览不修改草稿，明确应用才补充精确前复权路由', () => {
    const before = structuredClone(draft);
    const preview = hithinkPolicyPreset(draft, catalog, [provider]);
    expect(preview.changes).toEqual([
      { key, targets: [target], label: '中国内地ETF · 日线行情（日线／前复权）' },
    ]);
    expect(draft).toEqual(before);
    const applied = applyHithinkPolicyPreset(draft, catalog, [provider]);
    expect(applied).toEqual({ ...draft, routes: [{ key, targets: [target] }] });
    expect(applied.enabled).toBe(false);
    expect(draft).toEqual(before);
  });
  it('保留既有主备与其他口径，不自动设定第三家来源', () => {
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
    expect(hithinkPolicyPreset(current, catalog, [provider]).changes).toEqual([]);
    expect(applyHithinkPolicyPreset(current, catalog, [provider])).toEqual(current);
  });
  it.each(['configured', 'enabled', 'credentialConfigured'] as const)(
    '%s不可用时不纳入预设',
    (flag) => {
      expect(hithinkPolicyPreset(draft, catalog, [{ ...provider, [flag]: false }]).changes).toEqual(
        [],
      );
    },
  );
  it('目录不完整、凭据缺失与同能力多目标不猜选', () => {
    expect(
      hithinkPolicyPreset(
        draft,
        { ...catalog, status: 'partial', entries: [], reason: 'catalog_partial' },
        [provider],
      ).changes,
    ).toEqual([]);
    expect(
      hithinkPolicyPreset(
        draft,
        { ...catalog, entries: [{ key, target, state: 'credential_missing' }] },
        [provider],
      ).changes,
    ).toEqual([]);
    expect(
      hithinkPolicyPreset(
        draft,
        {
          ...catalog,
          entries: [
            ...catalog.entries,
            { key, target: { ...target, upstreamSource: 'another-contract' }, state: 'ready' },
          ],
        },
        [provider],
      ).changes,
    ).toEqual([]);
  });
  it('初次展示仅有预览动作，无自动应用和重复保存入口', () => {
    const onChange = vi.fn();
    const html = renderToStaticMarkup(
      <MarketPolicyPreset
        policy={draft}
        catalog={catalog}
        providers={[provider]}
        disabled={false}
        onChange={onChange}
      />,
    );
    expect(html).toContain('预览 HiThink 优先');
    expect(html).not.toContain('应用到草稿');
    expect(html).not.toContain('保存路由策略');
    expect(onChange).not.toHaveBeenCalled();
  });
});
