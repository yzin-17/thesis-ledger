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

it('accepts only the verified Futu account snapshot and its asset request interval', () => {
  const liveRequest = { ...request, symbol: 'AAPL.US', assetType: 'STOCK' as const };
  const account = {
    ...plan, ...liveRequest, acquisition: 'account-snapshot', minIntervalSeconds: 15,
    target: { providerId: 'futu', upstreamSource: 'futu', routeIndex: 0 },
  };
  expect(correlateBackgroundQuotePlan(liveRequest, account)).toEqual(account);
  expect(() => correlateBackgroundQuotePlan(liveRequest, { ...account, minIntervalSeconds: 5 })).toThrow();
  expect(() => correlateBackgroundQuotePlan(liveRequest, { ...account, target: plan.target })).toThrow();
});

it.each([
  { assetType: 'STOCK', symbol: '600519.SH', upstreamSource: 'a-share-prices-snapshot', interval: 15 },
  { assetType: 'ETF', symbol: '510300.SH', upstreamSource: 'fund-market-snapshot', interval: 600 },
] as const)('checks the exact HiThink $assetType snapshot', ({ assetType, symbol, upstreamSource, interval }) => {
  const exact = { ...request, assetType, symbol };
  const target = { providerId: 'hithink', upstreamSource, routeIndex: 0 };
  const live = { ...plan, ...exact, acquisition: 'account-snapshot', minIntervalSeconds: interval, target };
  expect(correlateBackgroundQuotePlan(exact, live)).toEqual(live);
  expect(() => correlateBackgroundQuotePlan(exact, { ...live, sourceUpdateIntervalSeconds: 15 })).toThrow();
  expect(() => correlateBackgroundQuotePlan(exact, { ...live, target: { ...target, upstreamSource: 'futu' } })).toThrow();
});
