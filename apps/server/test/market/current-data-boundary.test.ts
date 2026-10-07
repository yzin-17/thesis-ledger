import { describe, expect, it, vi } from 'vitest';
import { MarketService } from '../../src/market/market.service.js';
import { redisKey } from '../../src/platform/redis.service.js';

const equity = '600519.SH';
const fund = '000001.OF';
const now = '2026-10-01T00:00:00Z';
const cases = [
  {
    kind: 'quote',
    symbol: equity,
    key: `quote:3:${equity}`,
    value: {
      version: 3,
      symbol: equity,
      open: 10,
      high: 11,
      low: 9,
      price: 10,
      previousClose: 10,
      volume: 1,
      amount: 10,
      marketTime: now,
      fetchedAt: now,
      freshness: 'live',
      stale: false,
      provider: 'fixture',
    },
  },
  {
    kind: 'nav',
    symbol: fund,
    key: `fund-nav:3:${fund}`,
    value: {
      version: 3,
      symbol: fund,
      unitNav: 1.1,
      navDate: now,
      fetchedAt: now,
      provider: 'fixture',
      freshness: 'delayed',
    },
  },
  {
    kind: 'holdings',
    symbol: fund,
    key: `fund-holdings:3:${fund}`,
    value: {
      version: 3,
      fundSymbol: fund,
      reportPeriod: '2026-Q3',
      disclosureDate: null,
      provider: 'fixture',
      fetchedAt: now,
      evidenceVersion: 'fixture',
      holdings: [],
    },
  },
  {
    kind: 'chip',
    symbol: equity,
    key: `chip:3:${equity}`,
    value: {
      version: 3,
      symbol: equity,
      averageCost: 10,
      profitRatio: 0.5,
      range70: [9, 11],
      range90: [8, 12],
      concentration: 0.5,
      provider: 'fixture',
      engineVersion: 'fixture',
      calculatedAt: now,
    },
  },
] as const;

const harness = (values: Map<string, string>) => {
  const dsa = {
    get: vi.fn(async () => {
      throw new Error('upstream unavailable');
    }),
  };
  const redis = {
    client: {
      get: vi.fn(async (key: string) => values.get(key) ?? null),
      set: vi.fn(async () => 'OK'),
      eval: vi.fn(async () => 0),
    },
  };
  const service = new MarketService(dsa as never, redis as never);
  const read = (item: (typeof cases)[number], refresh = false) => {
    if (item.kind === 'quote') return service.getQuote(item.symbol, { refresh });
    if (item.kind === 'nav') return service.getFundNav(item.symbol, { refresh });
    if (item.kind === 'holdings') return service.getFundHoldings(item.symbol, { refresh });
    return service.getChip(item.symbol, { refresh });
  };
  return { dsa, redis, service, read };
};

describe('当前 Data 缓存与旧事实边界', () => {
  it.each(cases)('$kind 新鲜缓存拒绝旧版本和其他标的，仍接受相同当前标的', async (item) => {
    const key = redisKey('cache', item.kind === 'holdings' ? item.key : `${item.key}:fresh`);
    for (const patch of [{ version: 2 }, { symbol: '000002.OF', fundSymbol: '000002.OF' }]) {
      const h = harness(new Map([[key, JSON.stringify({ ...item.value, ...patch })]]));
      await expect(h.read(item)).rejects.toThrow();
    }
    const h = harness(new Map([[key, JSON.stringify(item.value)]]));
    await expect(h.read(item)).resolves.toMatchObject({ version: 3, servedFromCache: true });
    expect(h.dsa.get).not.toHaveBeenCalled();
  });

  it.each(cases.filter((item) => item.kind !== 'holdings'))(
    '$kind last-valid 不得绕过版本和代码核验',
    async (item) => {
      const key = redisKey('cache', `${item.key}:last-valid`);
      for (const patch of [{ version: 2 }, { symbol: '000002.OF' }]) {
        const h = harness(new Map([[key, JSON.stringify({ ...item.value, ...patch })]]));
        await expect(h.read(item, true)).rejects.toThrow();
      }
      const h = harness(new Map([[key, JSON.stringify(item.value)]]));
      await expect(h.read(item, true)).resolves.toMatchObject({
        version: 3,
        servedFromCache: true,
      });
    },
  );

  it('历史净值不可用时不把无合同版本的数据库行补为 V3', async () => {
    const findMany = vi.fn(async () => [
      {
        symbol: fund,
        unitNav: 1.1,
        provider: 'legacy',
        navDate: new Date(now),
        fetchedAt: new Date(now),
        freshness: 'delayed',
      },
    ]);
    const h = harness(new Map());
    const service = new MarketService(
      h.dsa as never,
      h.redis as never,
      { fundNavPoint: { findMany } } as never,
    );
    await expect(service.getFundNavHistory(fund)).rejects.toThrow('upstream unavailable');
    expect(findMany).not.toHaveBeenCalled();
  });
});
