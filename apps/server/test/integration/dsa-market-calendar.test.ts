import { afterEach, expect, it, vi } from 'vitest';
import { DsaClient } from '../../src/integration/dsa/dsa.client.js';

afterEach(() => vi.unstubAllGlobals());
const client = () =>
  Object.assign(Object.create(DsaClient.prototype), {
    config: {
      dsaBaseUrl: 'https://dsa.example.test',
      dsaTimeoutMs: 5000,
      dsaToken: 'calendar-test-token',
    },
  }) as DsaClient;
it('展示与回测日历分别请求各自入口，并保留有界事实信封校验', async () => {
  const envelope = {
    version: 3,
    status: 'unavailable',
    provider: 'exchange-calendars',
    providerRevision: 'unavailable',
    coverage: { start: '2026-01-01', end: '2026-12-31', complete: false },
    facts: [],
    reason: 'calendar unavailable',
  };
  const fetcher = vi.fn(async () => new Response(JSON.stringify(envelope), { status: 200 }));
  vi.stubGlobal('fetch', fetcher);
  const input = {
    market: 'CN' as const,
    start: '2026-01-01',
    end: '2026-12-31',
    dataAsOf: '2026-01-02T00:00:00Z',
  };
  expect(await client().marketCalendar(input)).toEqual(envelope);
  expect(await client().backtestCalendar(input)).toEqual(envelope);
  const [first, firstInit] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
  const [second] = fetcher.mock.calls[1] as unknown as [URL, RequestInit];
  expect(first.pathname).toBe('/api/v3/thesis-ledger/market/calendar');
  expect(second.pathname).toBe('/api/v3/thesis-ledger/backtest/calendar');
  expect(Object.fromEntries(first.searchParams)).toEqual(input);
  expect(firstInit.headers).toMatchObject({ authorization: 'Bearer calendar-test-token' });
});
it('展示日历拒绝无效的当前信封', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ version: 2 }), { status: 200 })),
  );
  await expect(
    client().marketCalendar({
      market: 'CN',
      start: '2026-01-01',
      end: '2026-12-31',
      dataAsOf: '2026-01-02T00:00:00Z',
    }),
  ).rejects.toThrow();
});
