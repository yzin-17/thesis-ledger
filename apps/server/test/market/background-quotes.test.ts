import { controlledMarketSession } from './market-session.fixture.js';
import { describe, expect, it, vi } from 'vitest';
import {
  MarketBackgroundQuotesService,
} from '../../src/market/market-background-quotes.service.js';
import { RiskMarketDemandService } from '../../src/risk/risk-market-demand.service.js';
const at = new Date('2026-11-06T02:00:00Z');
const demand = { symbol: '510300.SH', assetType: 'ETF' as const };
function harness() {
  let now = at.getTime();
  const store = new Map<string, { value: string; expires: number }>();
  const client = {
    get: vi.fn(async (key: string) => {
      const row = store.get(key);
      return row && row.expires > now ? row.value : null;
    }),
    set: vi.fn(async (key: string, value: string, mode: string, ttl: number, nx?: string) => {
      const old = store.get(key);
      if (nx && old && old.expires > now) return null;
      store.set(key, { value, expires: now + ttl * (mode === 'EX' ? 1000 : 1) });
      return 'OK';
    }),
  };
  const post = vi.fn(async (_path: string, request: object) => ({
    ...request,
    generation: 'a'.repeat(64),
    policyRevision: 1,
    acquisition: 'public-snapshot',
    reason: null,
    target: { providerId: 'tencent', upstreamSource: 'tencent', routeIndex: 1 },
    minIntervalSeconds: 600,
    sourceUpdateIntervalSeconds: null,
  }));
  const getQuote = vi.fn(async () => ({
    symbol: demand.symbol,
    provider: 'tencent',
    price: 4,
    marketTime: new Date(now).toISOString(),
    fetchedAt: new Date(now).toISOString(),
    servedFromCache: false,
  }));
  const create = () =>
    new MarketBackgroundQuotesService(
      { post } as never,
      { client } as never,
      { getQuote, getSession: controlledMarketSession } as never,
    );
  return {
    client,
    post,
    getQuote,
    create,
    service: create(),
    advance: (ms: number) => {
      now += ms;
      return new Date(now);
    },
  };
}

describe('source-specific automatic quotes', () => {
  it('has zero metadata and upstream requests without rule demand', async () => {
    const h = harness();
    expect(await h.service.reconcile([], at)).toEqual([]);
    expect(h.post).not.toHaveBeenCalled();
    expect(h.getQuote).not.toHaveBeenCalled();
  });
  it('shares the durable attempt window across restarts and retains actual source times', async () => {
    const h = harness();
    const [first] = await h.service.reconcile([demand], at);
    expect(first).toMatchObject({
      provider: 'tencent',
      minIntervalSeconds: 600,
      sourceUpdateIntervalSeconds: null,
      sourceTime: at.toISOString(),
      reason: 'sample_observed',
    });
    const [waiting] = await h.create().reconcile([demand], h.advance(30_000));
    expect(waiting).toMatchObject({
      reason: 'source_request_window',
      sourceTime: at.toISOString(),
      nextAttemptAt: '2026-11-06T02:10:00.000Z',
    });
    expect(h.getQuote).toHaveBeenCalledTimes(1);
    await h.service.reconcile([demand], h.advance(570_000));
    expect(h.getQuote).toHaveBeenCalledTimes(2);
  });
  it('does not release the source window after an acquisition failure', async () => {
    const h = harness();
    h.getQuote.mockRejectedValueOnce(new Error('unavailable'));
    expect((await h.service.reconcile([demand], at))[0]?.reason).toBe('acquisition_unavailable');
    expect((await h.create().reconcile([demand], h.advance(5000)))[0]?.reason).toBe(
      'source_request_window',
    );
    expect(h.getQuote).toHaveBeenCalledTimes(1);
  });
  it('never reads a blocked source or guesses a missing instrument identity', async () => {
    const h = harness();
    h.post.mockImplementationOnce(
      async (_path, request) =>
        ({
          ...request,
          generation: 'b'.repeat(64),
          policyRevision: 1,
          acquisition: 'blocked',
          reason: 'background_budget_unverified',
          target: { providerId: 'hithink', upstreamSource: 'fund-market-snapshot', routeIndex: 0 },
          minIntervalSeconds: null,
          sourceUpdateIntervalSeconds: null,
        }) as never,
    );
    expect(
      (
        await h.service.reconcile([demand, { symbol: '600519.SH' }, { symbol: '000001.OF' }], at)
      ).map((row) => row.reason),
    ).toEqual([
      'background_budget_unverified',
      'identity_unverified',
      'official_nav_updates_required',
    ]);
    expect(h.post).toHaveBeenCalledTimes(1);
    expect(h.getQuote).not.toHaveBeenCalled();
  });
  it('uses the selected Futu account snapshot through the normal market reader', async () => {
    const h = harness();
    h.post.mockImplementationOnce(async (_path, request) => ({
      ...request, generation: 'a'.repeat(64), policyRevision: 1, acquisition: 'account-snapshot',
      reason: null, target: { providerId: 'futu', upstreamSource: 'futu', routeIndex: 0 },
      minIntervalSeconds: 15, sourceUpdateIntervalSeconds: null,
    }));
    h.getQuote.mockResolvedValueOnce({
      symbol: '00700.HK', provider: 'futu', price: 120, marketTime: at.toISOString(),
      fetchedAt: at.toISOString(), servedFromCache: false,
    });
    const [row] = await h.service.reconcile([{symbol: '00700.HK', assetType: 'STOCK'}], at);
    expect(row).toMatchObject({ provider: 'futu', reason: 'sample_observed', minIntervalSeconds: 15 });
    expect(h.getQuote).toHaveBeenCalledWith('00700.HK', expect.objectContaining({
      background: expect.objectContaining({ acquisition: 'account-snapshot' }),
    }));
  });
  it('rejects mismatched plans and never calls the quote reader', async () => {
    const h = harness();
    h.post.mockImplementationOnce(async () => ({ symbol: 'wrong' }) as never);
    expect((await h.service.reconcile([demand], at))[0]?.reason).toBe('acquisition_unavailable');
    expect(h.getQuote).not.toHaveBeenCalled();
  });
  it('reconciles a changed source plan after the local metadata cache expires', async () => {
    const h = harness();
    await h.service.reconcile([demand], at);
    h.post.mockImplementationOnce(
      async (_path, request) =>
        ({
          ...request,
          generation: 'b'.repeat(64),
          policyRevision: 2,
          acquisition: 'blocked',
          reason: 'disabled',
          target: null,
          minIntervalSeconds: null,
          sourceUpdateIntervalSeconds: null,
        }) as never,
    );
    const [row] = await h.service.reconcile([demand], h.advance(60_000));
    expect(row?.reason).toBe('disabled');
    expect(h.getQuote).toHaveBeenCalledTimes(1);
  });
  it.each([
    ['2026-11-06T04:00:00Z', 'outside_market_session'],
    ['2026-11-07T02:00:00Z', 'outside_market_session'],
    ['2026-10-01T02:00:00Z', 'outside_market_session'],
    ['2027-01-04T02:00:00Z', 'calendar_unavailable'],
  ])('共享日历门禁阻止午休、周末、节假日及未知日历的后台报价：%s', async (time, reason) => {
    const h = harness();
    expect((await h.service.reconcile([demand], new Date(time)))[0]?.reason).toBe(reason);
    expect(h.getQuote).not.toHaveBeenCalled();
    expect(h.client.set).not.toHaveBeenCalledWith(expect.stringContaining('background-quote-attempt:'), expect.anything(), 'PX', expect.anything(), 'NX');
  });
});

it('registers active rule scopes automatically and removes disabled/future demand', async () => {
  const rules = {
    listEnabledRules: vi.fn(async () => [
      { kind: 'price-below', symbol: '510300.SH', accountId: null },
      { kind: 'position-concentration', accountId: 'account-1', symbol: null },
    ]),
  };
  const db = {
    position: {
      findMany: vi.fn(async () => [
        { symbol: '600519.SH', accountId: 'account-1' },
        { symbol: '00700.HK', accountId: 'account-2' },
      ]),
    },
  };
  const directory = {
    resolveSymbols: vi.fn(async () => ({
      items: [{ ...demand, instrumentType: 'ETF', active: true }],
    })),
  };
  const quotes = { reconcile: vi.fn(async () => []) };
  const service = new RiskMarketDemandService(
    rules as never,
    db as never,
    directory as never,
    quotes as never,
  );
  await service.runNow(at);
  expect(quotes.reconcile).toHaveBeenLastCalledWith([demand, { symbol: '600519.SH' }], at);
  rules.listEnabledRules.mockResolvedValue([]);
  await service.runNow(at);
  expect(quotes.reconcile).toHaveBeenLastCalledWith([], at);
});
