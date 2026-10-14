// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { desiredProviderPolicyV3Schema } from '@thesis-ledger/schemas';
import { MarketPolicyRoutes } from '../src/features/market-data/MarketPolicyRoutes.js';
import { marketPolicyRouteRowsV3, selectableRouteTargetsV3, updatePolicyRouteTargetV3,
  updatePolicyRouteEnabledV3 } from '../src/features/market-data/market-data-routes-v3.js';
import type { MarketPolicyDraftV3, MarketRouteCatalogReadV3, ProviderManifest } from '../src/features/market-data/market-data.types.js';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
Object.assign(window, { PointerEvent: MouseEvent });
const statusKey = { kind: 'data', market: 'CN', assetType: 'STOCK', capability: 'DAILY_TRADING_STATUS' } as const;
const riskKey = { ...statusKey, capability: 'RISK_WARNING' } as const;
const stateSource = { providerId: 'state-only', upstreamSource: 'state-only' };
const notice = { providerId: 'notice', upstreamSource: 'notice' };
const providers: ProviderManifest[] = [stateSource, notice].map((target) => ({
  providerId: target.providerId, displayName: target === stateSource ? '日级状态来源' : '公告来源',
  version: 1, configured: true, enabled: true, credentialConfigured: false, requiresCredential: false,
  capabilities: {},
}));
const catalog: MarketRouteCatalogReadV3 = { contractVersion: 3, consumer: 'thesis-ledger',
  status: 'complete', catalogRevision: 1, generatedAt: '2026-10-11T00:00:00Z', reason: null,
  entries: [
    { key: statusKey, target: stateSource, state: 'ready', querySupport:
      { capability: 'DAILY_TRADING_STATUS', granularity: 'day', maximumWindowDays: 3650 } },
    { key: statusKey, target: notice, state: 'ready', querySupport:
      { capability: 'DAILY_TRADING_STATUS', granularity: 'day', maximumWindowDays: 366 } },
    { key: riskKey, target: notice, state: 'ready', querySupport:
      { capability: 'RISK_WARNING', detailKinds: ['riskCategories'], riskCategories: ['delisting', 'other'] } },
  ] };
const policy: MarketPolicyDraftV3 = { contractVersion: 3, revision: 1, enabled: true, routes: [
  { key: statusKey, enabled: true, targets: [stateSource, notice] },
  { key: riskKey, enabled: false, targets: [notice] },
] };
let root: Root | undefined;
let host: HTMLDivElement | undefined;
afterEach(async () => { if (root) await act(async () => root!.unmount()); host?.remove(); root = undefined; });

it('点击说明不切换；关闭只编辑该功能，保留主备且不保存真实政策', async () => {
  let current = structuredClone(policy);
  const changed = vi.fn();
  function Fixture() {
    const [draft, setDraft] = useState(current);
    return <MarketPolicyRoutes policy={draft} serverPolicy={null} catalog={catalog} providers={providers}
      disabled={false} dirty={true} onChange={(next) => { current = next; changed(next); setDraft(next); }} />;
  }
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root!.render(<Fixture />));
  const toggle = host.querySelector('[role="switch"][aria-label="中国内地股票 · 日级交易状态 启用功能"]') as HTMLElement;
  expect(toggle).not.toBeNull();
  const label = toggle.closest('[data-slot="field"]')!.querySelector('label')!;
  await act(async () => label.click()); expect(changed).not.toHaveBeenCalled();
  await act(async () => toggle.click());
  expect(changed).toHaveBeenCalledOnce();
  expect(current.routes[0]).toEqual({ ...policy.routes[0], enabled: false });
  expect(current.routes[1]).toEqual(policy.routes[1]);
  expect(host.textContent).toContain('日级状态，单次最多 3650 天');
  expect(host.textContent).toContain('交易状态与风险规则');
  expect(host.textContent).not.toContain('DAILY_TRADING_STATUS');
});

it('关闭后编辑来源保持关闭；首次选择显式启用并通过原政策Schema', () => {
  const closed = updatePolicyRouteEnabledV3(policy, statusKey, false);
  const edited = updatePolicyRouteTargetV3(closed, statusKey, 'primary', notice);
  expect(edited.routes.find((route) => route.key.capability === statusKey.capability)?.enabled).toBe(false);
  const initial = updatePolicyRouteTargetV3({ ...policy, routes: [] }, statusKey, 'primary', stateSource);
  expect(initial.routes[0]?.enabled).toBe(true);
  expect(desiredProviderPolicyV3Schema.safeParse({ ...initial, consumer: 'thesis-ledger', requestId: 'selection' }).success).toBe(true);
  expect(updatePolicyRouteEnabledV3({ ...policy, routes: [] }, statusKey, true).routes).toEqual([]);
});

it('状态来源不依赖风险能力，精确参数范围复用在选项与回显', () => {
  const stateOptions = selectableRouteTargetsV3(catalog, statusKey, providers);
  expect(stateOptions.map((option) => option.target)).toContainEqual(stateSource);
  expect(stateOptions[0]?.label).toContain('日级状态，单次最多 3650 天');
  const riskOptions = selectableRouteTargetsV3(catalog, riskKey, providers);
  expect(riskOptions.map((option) => option.target)).toEqual([notice]);
  expect(riskOptions[0]?.label).toContain('退市风险、其他风险');
});

it('仅目录有效组合生成新行，已保存失效组合继续披露', () => {
  const key = { kind: 'bar', market: 'CN', assetType: 'STOCK', capability: 'DAILY_BAR', timeframe: '1d', adjustment: 'qfq' } as const;
  const exact = { ...catalog, entries: [{ key, target: stateSource, state: 'ready' as const }] };
  expect(marketPolicyRouteRowsV3(exact, { ...policy, routes: [] }).map((row) => row.key)).toEqual([key]);
  const stored = { ...key, adjustment: 'hfq' as const };
  expect(marketPolicyRouteRowsV3(exact, { ...policy, routes: [{ key: stored, targets: [stateSource] }] }).map((row) => row.key))
    .toEqual([key, stored]);
  expect(selectableRouteTargetsV3(exact, stored, providers)).toEqual([]);
});
