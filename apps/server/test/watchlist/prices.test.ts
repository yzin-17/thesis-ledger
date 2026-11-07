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
        },
      },
    ]);
    expect(position.mock.calls[0]![0].where.account).toEqual({ mode: 'shadow', active: true });
    expect(market.getQuotes.mock.calls[0]![0]).toHaveLength(1);
  } finally {
    vi.unstubAllEnvs();
  }
});
