import { expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../../src/platform/prisma.service.js';
import type { MarketService } from '../../src/market/market.service.js';
import { WatchlistPrices } from '../../src/watchlist/watchlist-prices.js';

it('50 项混合页只读显式集合；基金并发不超过 8，单项失败保留其他结果', async () => {
  const rows = Array.from({ length: 50 }, (_, i) => ({
    id: randomUUID(),
    instrument: {
      active: true,
      canonicalCode: String(i + 1).padStart(6, '0'),
      market: i < 25 ? 'SZ' : 'OF',
      instrumentType: i < 25 ? 'ETF' : 'MUTUAL_FUND',
    },
  }));
  const positions = vi.fn();
  const db = {
    watchlistItem: { findMany: vi.fn().mockResolvedValue(rows) },
    position: { findMany: positions },
  };
  let pending = 0,
    peak = 0;
  const market = {
    getQuotes: vi.fn(async (items: { symbol: string }[]) =>
      items.map((identity) => ({ identity, outcome: { status: 'rejected', reason: Error() } })),
    ),
    getFundNav: vi.fn(async (symbol: string) => {
      pending++;
      peak = Math.max(peak, pending);
      await new Promise((r) => setTimeout(r, 1));
      pending--;
      if (symbol === '000050.OF') throw Error();
      return { navDate: '2026-11-04', unitNav: 1.03, freshness: 'delayed' };
    }),
  };
  const owner = randomUUID();
  const service = new WatchlistPrices(
    db as unknown as PrismaService,
    market as unknown as MarketService,
  );
  const result = await service.read(
    owner,
    { itemIds: rows.map((r) => r.id), mode: 'actual' },
    new AbortController().signal,
  );
  expect(db.watchlistItem.findMany.mock.calls[0]?.[0].where.ownerId).toBe(owner);
  expect(market.getQuotes).toHaveBeenCalledTimes(1);
  expect(market.getQuotes.mock.calls[0]?.[0]).toHaveLength(25);
  expect(market.getFundNav).toHaveBeenCalledTimes(25);
  expect(peak).toBeLessThanOrEqual(8);
  expect(positions).not.toHaveBeenCalled();
  expect(result.filter((r) => r.price.kind === 'nav')).toHaveLength(24);
  expect(result.every((r) => r.held === null)).toBe(true);
});

it('目录停用的自选股票和 ETF 仍按保存的身份取价，单项结果由行情来源决定', async () => {
  const rows = [
    {
      id: randomUUID(),
      instrument: { canonicalCode: '510300', market: 'SH', instrumentType: 'ETF', active: false },
    },
    {
      id: randomUUID(),
      instrument: { canonicalCode: '600036', market: 'SH', instrumentType: 'STOCK', active: false },
    },
    {
      id: randomUUID(),
      instrument: {
        canonicalCode: '000001',
        market: 'OF',
        instrumentType: 'MUTUAL_FUND',
        active: false,
      },
    },
  ];
  const etf = { symbol: '510300.SH', assetType: 'ETF' };
  const stock = { symbol: '600036.SH', assetType: 'STOCK' };
  const quote = { symbol: etf.symbol, price: 4.01, marketTime: '2026-11-13T06:00:00Z' };
  const market = {
    getQuotes: vi.fn().mockResolvedValue([
      { identity: etf, outcome: { status: 'fulfilled', value: quote } },
      { identity: stock, outcome: { status: 'rejected', reason: new Error() } },
    ]),
    getFundNav: vi.fn(),
  };
  const service = new WatchlistPrices(
    { watchlistItem: { findMany: vi.fn().mockResolvedValue(rows) } } as unknown as PrismaService,
    market as unknown as MarketService,
  );
  const signal = new AbortController().signal;
  const result = await service.read(
    randomUUID(),
    { itemIds: rows.map((row) => row.id), mode: 'actual' },
    signal,
  );
  expect(market.getQuotes).toHaveBeenCalledWith([etf, stock], { allowStale: true, signal });
  expect(market.getFundNav).not.toHaveBeenCalled();
  expect(result.map((row) => row.price)).toEqual([
    { kind: 'quote', quote },
    { kind: 'unavailable', reason: 'unavailable' },
    { kind: 'unavailable', reason: 'inactive_instrument' },
  ]);
});

it('请求已取消时不再读取名单或发起报价', async () => {
  const query = vi.fn();
  const service = new WatchlistPrices(
    { watchlistItem: { findMany: query } } as unknown as PrismaService,
    {} as MarketService,
  );
  await expect(
    service.read(randomUUID(), { mode: 'actual', itemIds: [randomUUID()] }, AbortSignal.abort()),
  ).rejects.toThrow();
  expect(query).not.toHaveBeenCalled();
});
it('本地持仓提示只查所选模式；陈旧行情保留来源时间', async () => {
  const { localIdentityPrincipal } = await import('../../src/identity/local-workspace.js');
  vi.stubEnv('STRATEGY_IDENTITY_MODE', 'local');
  try {
    const id = randomUUID();
    const position = vi.fn().mockResolvedValue([{ symbol: '000001.SZ' }]);
    const db = {
      watchlistItem: {
        findMany: vi.fn().mockResolvedValue([
          {
            id,
            instrument: {
              canonicalCode: '000001',
              market: 'SZ',
              instrumentType: 'STOCK',
              active: true,
            },
          },
        ]),
      },
      position: { findMany: position },
    };
    const quote = {
      symbol: '000001.SZ',
      stale: true,
      marketTime: '2026-11-03T08:00:00Z',
      price: 10,
      previousClose: 9,
    };
    const market = {
      getQuotes: vi.fn().mockResolvedValue([
        {
          identity: { symbol: quote.symbol, assetType: 'STOCK' },
          outcome: { status: 'fulfilled', value: quote },
        },
      ]),
    };
    const service = new WatchlistPrices(
      db as unknown as PrismaService,
      market as unknown as MarketService,
    );
    const result = await service.read(
      localIdentityPrincipal()!.id,
      { mode: 'shadow', itemIds: [id, id] },
      new AbortController().signal,
    );
    expect(result).toEqual([
      {
        itemId: id,
        held: true,
        minRefreshSeconds: 60,
        price: { kind: 'quote', quote },
        quoteContext: {
          session: 'unknown',
          reason: 'calendar_unavailable',
          evaluatedAt: expect.any(String),
          marketSession: { state: 'unknown', tradingDayState: 'unknown', evaluatedAt: expect.any(String), reason: 'calendar_unavailable', sessions: [] },
        },
      },
    ]);
    expect(position.mock.calls[0]![0].where.account).toEqual({ mode: 'shadow', active: true });
    expect(market.getQuotes.mock.calls[0]![0]).toHaveLength(1);
  } finally {
    vi.unstubAllEnvs();
  }
});
