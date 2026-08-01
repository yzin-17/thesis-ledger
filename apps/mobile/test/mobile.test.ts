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

describe('Mobile read-only dashboard', () => {
  it('resolves safe development API defaults without overriding explicit environments', () => {
    expect(resolveMobileApiBaseUrl({ platform: 'android' })).toBe('http://10.0.2.2:3000/api/v1');
    expect(resolveMobileApiBaseUrl({ platform: 'ios' })).toBe('http://127.0.0.1:3000/api/v1');
    expect(
      resolveMobileApiBaseUrl({
        platform: 'android',
        explicitBaseUrl: ' https://investment-os.example/api/v1 ',
      }),
    ).toBe('https://investment-os.example/api/v1');
  });

  it('uses the Investment OS API and exposes portfolio/risk navigation', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response({
          totalMarketValue: '14880',
          totalCost: '14500',
          totalPnl: '380',
          valuedAt: '2026-08-01T00:00:00.000Z',
          partial: false,
          positions: [
            {
              id: 'position-1',
              accountId: 'account-1',
              symbol: '600519.SH',
              quantity: '10',
              costPrice: '1450',
              marketValue: '14880',
              pnl: '380',
              stale: false,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(response([{ id: 'event-1', severity: 'warning' }]));
    const bootstrap = createMobileBootstrap({
      apiBaseUrl: 'https://investment-os.test/api/v1',
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
      portfolio: { totalMarketValue: 14880, positions: [{ symbol: '600519.SH', quantity: 10 }] },
      riskEvents: [{ id: 'event-1' }],
    });
    expect(fetcher).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/api/v1/portfolio/valuation' }),
      expect.any(Object),
    );
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });

  it('keeps stale data visible and marks the state when a quote is stale', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response({
          totalMarketValue: 1,
          totalCost: 1,
          totalPnl: 0,
          valuedAt: '2026-08-01T00:00:00.000Z',
          partial: true,
          positions: [
            {
              id: 'position-1',
              accountId: 'account-1',
              symbol: '600519.SH',
              quantity: 1,
              costPrice: 1,
              marketValue: 1,
              pnl: 0,
              stale: true,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(response([]));
    const store = createMobileBootstrap({
      apiBaseUrl: 'https://investment-os.test/api/v1',
      fetcher,
    }).store;

    await store.refresh();

    expect(store.getState().status).toBe('stale');
    expect(store.getState().portfolio?.positions[0]?.stale).toBe(true);
  });

  it('starts in loading and exposes the empty state when no positions exist', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response({
          totalMarketValue: 0,
          totalCost: 0,
          totalPnl: 0,
          valuedAt: '2026-08-01T00:00:00.000Z',
          partial: false,
          positions: [],
        }),
      )
      .mockResolvedValueOnce(response([]));
    const store = createMobileBootstrap({
      apiBaseUrl: 'https://investment-os.test/api/v1',
      fetcher,
    }).store;

    expect(store.getState()).toMatchObject({ status: 'loading', portfolio: null, error: null });
    await store.refresh();

    expect(store.getState()).toMatchObject({ status: 'empty', portfolio: { positions: [] } });
  });

  it('surfaces API failures as an error state', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ message: 'offline' }, 503));
    const store = createMobileBootstrap({
      apiBaseUrl: 'https://investment-os.test/api/v1',
      fetcher,
    }).store;

    await store.refresh();

    expect(store.getState()).toMatchObject({ status: 'error', error: 'Investment OS API 503' });
  });

  it('does not let an older refresh overwrite a newer response', async () => {
    const firstPortfolio = deferred<Response>();
    const firstRisk = deferred<Response>();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(() => firstPortfolio.promise)
      .mockImplementationOnce(() => firstRisk.promise)
      .mockResolvedValueOnce(
        response({
          totalMarketValue: 2,
          totalCost: 2,
          totalPnl: 0,
          valuedAt: '2026-08-01T00:00:00.000Z',
          partial: false,
          positions: [
            {
              id: 'new-position',
              accountId: 'account-1',
              symbol: '000001.SZ',
              quantity: 2,
              costPrice: 1,
              marketValue: 2,
              pnl: 0,
              stale: false,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(response([]));
    const store = createMobileBootstrap({
      apiBaseUrl: 'https://investment-os.test/api/v1',
      fetcher,
    }).store;

    const olderRefresh = store.refresh();
    const newerRefresh = store.refresh();
    await newerRefresh;
    firstPortfolio.resolve(
      response({
        totalMarketValue: 1,
        totalCost: 1,
        totalPnl: 0,
        valuedAt: '2026-08-01T00:00:00.000Z',
        partial: false,
        positions: [
          {
            id: 'old-position',
            accountId: 'account-1',
            symbol: '600519.SH',
            quantity: 1,
            costPrice: 1,
            marketValue: 1,
            pnl: 0,
            stale: false,
          },
        ],
      }),
    );
    firstRisk.resolve(response([]));
    await olderRefresh;

    expect(store.getState().portfolio?.positions[0]?.symbol).toBe('000001.SZ');
  });
});
