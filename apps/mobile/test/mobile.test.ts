import { describe, expect, it, vi } from 'vitest';
import { createMobileBootstrap, mobileStateCopy, resolveMobileApiBaseUrl } from '../src/index.js';

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
};

const accountId = '00000000-0000-4000-8000-000000000001';
const positionId = '00000000-0000-4000-8000-000000000002';
const ruleId = '00000000-0000-4000-8000-000000000003';
const eventId = '00000000-0000-4000-8000-000000000004';

const portfolio = (overrides: Record<string, unknown> = {}) => ({
  positions: [
    {
      id: positionId,
      accountId,
      symbol: '600519.SH',
      quantity: 10,
      costPrice: 1450,
      marketPrice: 1488,
      marketValue: 14880,
      costValue: 14500,
      pnl: 380,
      pnlRatio: 380 / 14500,
      stale: false,
    },
  ],
  cashValue: 500,
  cashByAccount: [{ accountId, amount: 500 }],
  totalCost: 14500,
  totalMarketValue: 15380,
  totalPnl: 380,
  partial: false,
  mode: 'actual',
  valuedAt: '2026-08-01T00:00:00.000Z',
  ...overrides,
});

const riskEvent = {
  id: eventId,
  ruleId,
  ruleVersion: 1,
  triggered: true,
  severity: 'warning',
  message: '风险事件',
  mode: 'actual',
  accountId,
  symbol: '600519.SH',
  marketTime: '2026-08-01T00:00:00.000Z',
  evaluatedAt: '2026-08-01T00:00:01.000Z',
  context: {},
};

describe('Mobile read-only dashboard', () => {
  it('resolves safe development API defaults without overriding explicit environments', () => {
    expect(resolveMobileApiBaseUrl({ platform: 'android' })).toBe('http://10.0.2.2:3000/api/v1');
    expect(resolveMobileApiBaseUrl({ platform: 'ios' })).toBe('http://127.0.0.1:3000/api/v1');
    expect(
      resolveMobileApiBaseUrl({
        platform: 'android',
        explicitBaseUrl: ' https://thesis-ledger.example/api/v1 ',
      }),
    ).toBe('https://thesis-ledger.example/api/v1');
  });

  it('uses typed API responses and preserves server cashValue in mobile state', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(portfolio()))
      .mockResolvedValueOnce(response([riskEvent]));
    const bootstrap = createMobileBootstrap({
      apiBaseUrl: 'https://thesis-ledger.test/api/v1',
      fetcher,
    });
    const listener = vi.fn();
    const unsubscribe = bootstrap.store.subscribe(listener);

    await bootstrap.store.refresh();

    expect(bootstrap.platform).toBe('react-native');
    expect(Object.keys(mobileStateCopy)).toEqual(['loading', 'ready', 'empty', 'error', 'stale']);
    expect(bootstrap.navigation.map((item) => item.key)).toEqual(['portfolio', 'risk']);
    expect(bootstrap.store.getState()).toMatchObject({
      status: 'ready',
      portfolio: {
        totalMarketValue: 15380,
        cashValue: 500,
        positions: [{ symbol: '600519.SH', quantity: 10 }],
      },
      riskEvents: [{ id: eventId }],
    });
    expect(fetcher).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/api/v1/portfolio/valuation' }),
      expect.any(Object),
    );
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });

  it('keeps stale data visible and marks the state when a quote is stale', async () => {
    const stalePortfolio = portfolio({
      partial: true,
      positions: [
        {
          ...(portfolio().positions[0] as object),
          stale: true,
        },
      ],
    });
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(stalePortfolio))
      .mockResolvedValueOnce(response([]));
    const store = createMobileBootstrap({
      apiBaseUrl: 'https://thesis-ledger.test/api/v1',
      fetcher,
    }).store;

    await store.refresh();

    expect(store.getState().status).toBe('stale');
    expect(store.getState().portfolio?.positions[0]?.stale).toBe(true);
  });

  it('starts in loading and exposes the empty state when no positions exist', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(portfolio({ positions: [], totalCost: 0, totalPnl: 0 })))
      .mockResolvedValueOnce(response([]));
    const store = createMobileBootstrap({
      apiBaseUrl: 'https://thesis-ledger.test/api/v1',
      fetcher,
    }).store;

    expect(store.getState()).toMatchObject({ status: 'loading', portfolio: null, error: null });
    await store.refresh();

    expect(store.getState()).toMatchObject({ status: 'empty', portfolio: { positions: [] } });
  });

  it('treats missing or invalid numeric fields as a contract error instead of zero', async () => {
    const invalid = portfolio();
    delete (invalid as { cashValue?: unknown }).cashValue;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(invalid))
      .mockResolvedValueOnce(response([]));
    const store = createMobileBootstrap({
      apiBaseUrl: 'https://thesis-ledger.test/api/v1',
      fetcher,
    }).store;

    await store.refresh();

    expect(store.getState().status).toBe('error');
    expect(store.getState().portfolio).toBeNull();
    expect(store.getState().error).toContain('响应契约不匹配');
  });

  it('surfaces API failures as an error state', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response({ error: 'offline', message: 'offline' }, 503));
    const store = createMobileBootstrap({
      apiBaseUrl: 'https://thesis-ledger.test/api/v1',
      fetcher,
    }).store;

    await store.refresh();

    expect(store.getState()).toMatchObject({ status: 'error' });
    expect(store.getState().error).toContain('ThesisLedger API 503');
  });

  it('does not let an older refresh overwrite a newer response', async () => {
    const firstPortfolio = deferred<Response>();
    const firstRisk = deferred<Response>();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(() => firstPortfolio.promise)
      .mockImplementationOnce(() => firstRisk.promise)
      .mockResolvedValueOnce(
        response(
          portfolio({
            positions: [
              {
                ...(portfolio().positions[0] as object),
                id: '00000000-0000-4000-8000-000000000005',
                symbol: '000001.SZ',
                quantity: 2,
              },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(response([]));
    const store = createMobileBootstrap({
      apiBaseUrl: 'https://thesis-ledger.test/api/v1',
      fetcher,
    }).store;

    const olderRefresh = store.refresh();
    const newerRefresh = store.refresh();
    await newerRefresh;
    firstPortfolio.resolve(response(portfolio()));
    firstRisk.resolve(response([]));
    await olderRefresh;

    expect(store.getState().portfolio?.positions[0]?.symbol).toBe('000001.SZ');
  });
});
