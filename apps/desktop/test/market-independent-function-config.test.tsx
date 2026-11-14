// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { desiredProviderPolicyV3Schema } from '@thesis-ledger/schemas';
import { MarketPolicyRoutes } from '../src/features/market-data/MarketPolicyRoutes.js';
import { marketPolicyRouteRowsV3, selectableRouteTargetsV3, updatePolicyRouteTargetV3 } from '../src/features/market-data/market-data-routes-v3.js';
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

it('配置行通过清空来源停止读取，保留精确能力隔离', async () => {
  let current = structuredClone(policy);
  const changed = vi.fn();
  function Fixture() {
    const [draft, setDraft] = useState(current);
    return <MarketPolicyRoutes policy={draft} serverPolicy={null} catalog={catalog} providers={providers}
      disabled={false} changedIds={new Set()} actions={null} onChange={(next) => { current = next; changed(next); setDraft(next); }} />;
  }
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root!.render(<Fixture />));
  const tab = [...host.querySelectorAll<HTMLElement>('[role="tab"]')].find((item) => item.textContent?.startsWith('交易规则'))!;
  await act(async () => tab.click());
  expect(host.querySelector('[role="switch"]')).toBeNull();
  expect(host.textContent).toContain('日级状态，单次最多 3650 天');
  const select = host.querySelector('[aria-label="中国内地股票 · 日级交易状态 主数据源"]') as HTMLElement;
  await act(async () => select.click());
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((item) => item.textContent === '未配置')!;
  await act(async () => {
    const down = new MouseEvent('pointerdown', { bubbles: true, button: 0 });
    Object.defineProperty(down, 'pointerType', { value: 'mouse' });
    option.dispatchEvent(down);
    option.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0, detail: 1 }));
  });
  expect(changed).toHaveBeenCalledOnce();
  expect(current.routes).toEqual([]);
  expect(host.textContent).not.toContain('DAILY_TRADING_STATUS');
});

it('重新选择只应用当前能力，并通过原政策Schema', () => {
  const closed = { ...policy, routes: policy.routes.map((route) => ({ ...route, enabled: false })) };
  const edited = updatePolicyRouteTargetV3(closed, statusKey, 'primary', notice);
  expect(edited.routes).toEqual([{ key: statusKey, targets: [notice], enabled: true }]);
  expect(desiredProviderPolicyV3Schema.safeParse({ ...edited, consumer: 'thesis-ledger', requestId: 'selection' }).success).toBe(true);
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
