import { expect, it } from 'vitest';
import { correlateBackgroundQuotePlan } from '../src/market-background-quote.js';
const request = { contractVersion: 1, consumer: 'thesis-ledger', requestId: 'source-test', symbol: '510300.SH', assetType: 'ETF' } as const;
const plan = { ...request, generation: 'a'.repeat(64), policyRevision: 1, acquisition: 'public-snapshot', reason: null,
  target: { providerId: 'tencent', upstreamSource: 'tencent', routeIndex: 1 }, minIntervalSeconds: 600, sourceUpdateIntervalSeconds: null };
it('pins identity and the currently verified source contract', () => {
  expect(correlateBackgroundQuotePlan(request, plan)).toEqual(plan);
  for (const change of [{ symbol: '600519.SH' }, { requestId: 'another' }, { minIntervalSeconds: 15 },
    { target: { ...plan.target, providerId: 'hithink' } }, { reason: 'not_eligible' }])
    expect(() => correlateBackgroundQuotePlan(request, { ...plan, ...change })).toThrow();
});
it('can report unavailable routes without inventing an upstream update frequency', () => {
  const blocked = { ...plan, acquisition: 'blocked', reason: 'not_selected', target: null, minIntervalSeconds: null };
  expect(correlateBackgroundQuotePlan(request, blocked).sourceUpdateIntervalSeconds).toBeNull();
});
