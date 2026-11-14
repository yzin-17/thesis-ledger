// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import type { RoutingAuthoring, MarketRouteCapabilityV3 } from '@thesis-ledger/schemas';
import type { ProviderManifest } from '../src/features/market-data/market-data.types.js';
import { useRoutingRecommendation } from '../src/features/market-data/useRoutingRecommendation.js';
import { updateRoutingScope, updateRoutingScopeBinding } from '../src/features/market-data/routing-config-draft.js';
import { key } from './market-policy-defaults.fixture.js';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const providers: ProviderManifest[] = [{ providerId: 'akshare', displayName: 'AKShare', version: 1,
  enabled: true, configured: true, requiresCredential: false, credentialConfigured: false, capabilities: {} }];
const catalog: MarketRouteCapabilityV3[] = ['sina', 'eastmoney'].map((upstreamSource) =>
  ({ key, target: { providerId: 'akshare', upstreamSource }, state: 'ready' }));

it('采用仅改变本类；待选保留原绑定，手动选择后更新待选数；撤销保留其他类后续修改', async () => {
  const initial: RoutingAuthoring = { version: 1, keys: [key], preserved: [], rules: [
    { scope: { category: 'market' }, providers: ['akshare'] },
    { scope: { category: 'research' }, providers: ['original'] },
  ] };
  let workflow!: ReturnType<typeof useRoutingRecommendation>;
  let draft!: RoutingAuthoring;
  let change!: (value: RoutingAuthoring) => void;
  function Harness() {
    const [config, setConfig] = useState(initial);
    draft = config;
    change = setConfig;
    workflow = useRoutingRecommendation(config, 1, providers, catalog, setConfig);
    return null;
  }
  const root = createRoot(document.createElement('div'));
  try {
    await act(async () => root.render(<Harness />));
    await act(async () => workflow.adopt('market'));
    expect(workflow.pending).toBe(1);
    expect(draft.rules.find((rule) => rule.scope.capability)?.providers).toEqual(['akshare']);
    expect(draft.rules.find((rule) => rule.scope.category === 'research')).toEqual(initial.rules[1]);
    const scope = workflow.decisions.market![0]!.scope;
    await act(async () => change(updateRoutingScopeBinding(draft, scope, 'akshare', 'sina')));
    expect(workflow.pending).toBe(0);
    await act(async () => change(updateRoutingScope(draft, { category: 'research' }, ['changed'])));
    await act(async () => workflow.undo('market'));
    expect(draft.rules.filter((rule) => rule.scope.category === 'market')).toEqual([initial.rules[0]]);
    expect(draft.rules.find((rule) => rule.scope.category === 'research')?.providers).toEqual(['changed']);
    expect(workflow.decisions.market).toBeUndefined();
  } finally { await act(async () => root.unmount()); }
});
