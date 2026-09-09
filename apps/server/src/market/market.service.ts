import { Injectable, Logger, Optional } from '@nestjs/common';
import { normalizeSymbol } from '@thesis-ledger/domain';
import {
  chipDistributionSchemaV1,
  fundNavSchemaV1,
  fundNavHistorySchemaV1,
  fundHoldingsSchemaV1,
  indicatorSchemaV1,
  quoteSchemaV1,
  fxRatesResponseSchemaV1,
  type BarInputV1,
  type BarV1,
  type ChipDistributionV1,
  type CurrencyV1,
  type FxRatesResponseV1,
  type FundNavV1,
  type FundNavHistoryV1,
  type FundHoldingsV1,
  type IndicatorV1,
  type QuoteV1,
} from '@thesis-ledger/schemas';
import { DsaClient } from '../integration/dsa/dsa.client.js';
import { RedisService, redisKey } from '../platform/redis.service.js';
import { PrismaService } from '../platform/prisma.service.js';
import { MarketBarCache, resolveEffectiveBars } from './market-bar-cache.js';
import {
  historicalSeriesFreshSeconds,
  MARKET_CACHE_POLICIES,
  MarketResultCache,
} from './market-result-cache.js';

export { resolveEffectiveBars } from './market-bar-cache.js';

const fundSymbolPattern = /^\d{6}\.OF$/;
@Injectable()
export class MarketService {
  private readonly logger = new Logger(MarketService.name);
  private readonly barCache: MarketBarCache;
  private readonly resultCache: MarketResultCache;

  constructor(
    private readonly dsa: DsaClient,
    private readonly redis: RedisService,
    @Optional() private readonly prisma?: PrismaService,
  ) {
    this.barCache = new MarketBarCache(redis, prisma);
    this.resultCache = new MarketResultCache(redis);
  }

  private readonly flights = new Map<string, Promise<unknown>>();

  private singleFlight<T>(key: string, work: () => Promise<T>): Promise<T> {
    const existing = this.flights.get(key) as Promise<T> | undefined;
    if (existing) return existing;
    const pending = work().finally(() => {
      if (this.flights.get(key) === pending) this.flights.delete(key);
    });
    this.flights.set(key, pending);
    return pending;
  }

  private async withDistributedLock<T>(key: string, work: () => Promise<T>): Promise<T> {
    if (!this.redis?.client) return work();
    const client = this.redis.client as unknown as {
      set?: (...args: [string, string, 'PX', number, 'NX']) => Promise<string | null>;
      get?: (key: string) => Promise<string | null>;
      eval?: (script: string, keyCount: number, ...args: string[]) => Promise<unknown>;
    };
    if (typeof client.set !== 'function') return work();

    const lockKey = redisKey('lock', `market:${key}`);
    const lockValue = crypto.randomUUID();
    let acquired: string | null = null;
    try {
      acquired = await client.set(lockKey, lockValue, 'PX', 6_000, 'NX');
    } catch {
      return work();
    }
    if (acquired !== 'OK') {
      if (typeof client.get === 'function') {
        for (let attempt = 0; attempt < 30; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 200));
          if ((await client.get(lockKey)) === null) break;
        }
      }
      return work();
    }

    try {
      return await work();
    } finally {
      try {
        if (typeof client.eval === 'function') {
          await client.eval(
            'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) end return 0',
            1,
            lockKey,
            lockValue,
          );
        }
      } catch {
        // TTL 负责最终释放锁；释放失败不能覆盖已获得的行情结果。
      }
    }
  }

  async getFxRates(input: {
    baseCurrency: CurrencyV1;
    currencies: readonly CurrencyV1[];
    asOf?: string;
  }): Promise<FxRatesResponseV1> {
    const currencies = [...new Set(input.currencies)].sort();
    const asOf = input.asOf?.slice(0, 10);
    const key = `fx-rates:${input.baseCurrency}:${currencies.join(',')}:${asOf ?? 'today'}`;
    return this.singleFlight(key, async () => {
      const raw = await this.dsa.fxRates({
        baseCurrency: input.baseCurrency,
        currencies,
        ...(asOf ? { asOf } : {}),
      });
      return fxRatesResponseSchemaV1.parse(raw);
    });
  }

  async getQuote(
    input: string,
    options: { allowStale?: boolean; refresh?: boolean } = {},
  ): Promise<QuoteV1> {
    const { symbol } = normalizeSymbol(input);
    const flightKey = `quote:${symbol}`;
    const freshKey = redisKey('cache', `quote:${symbol}:fresh`);
    const lastValidKey = redisKey('cache', `quote:${symbol}:last-valid`);
    if (!options.refresh) {
      const cached = await this.redis.client.get(freshKey);
      if (cached) return quoteSchemaV1.parse({ ...JSON.parse(cached), servedFromCache: true });
    }
    const quote = await this.singleFlight(flightKey, () =>
      this.withDistributedLock(flightKey, async () => {
        if (!options.refresh) {
          const cached = await this.redis.client.get(freshKey);
          if (cached) return quoteSchemaV1.parse({ ...JSON.parse(cached), servedFromCache: true });
        }
        try {
          const raw = await this.dsa.get<Record<string, unknown>>(
            `/api/v1/thesis-ledger/market/quote?symbol=${encodeURIComponent(symbol)}`,
          );
          const quote = quoteSchemaV1.parse({
            ...raw,
            version: 1,
            symbol,
            servedFromCache: false,
          });
          const serialized = JSON.stringify(quote);
          await this.redis.client
            .multi()
            .set(freshKey, serialized, 'EX', MARKET_CACHE_POLICIES.realtimeQuote.freshSeconds)
            .set(
              lastValidKey,
              serialized,
              'EX',
              MARKET_CACHE_POLICIES.realtimeQuote.lastValidSeconds,
            )
            .exec();
          return quote;
        } catch (error) {
          const lastValid = await this.redis.client.get(lastValidKey);
          if (lastValid)
            return quoteSchemaV1.parse({
              ...JSON.parse(lastValid),
              stale: true,
              freshness: 'stale',
              servedFromCache: true,
            });
          throw error;
        }
      }),
    );
    if (options.allowStale === false && quote.stale)
      throw new Error('行情陈旧，当前操作要求新鲜行情');
    return quote;
  }

  async getFundNav(
    input: string,
    options: { allowStale?: boolean; refresh?: boolean } = {},
  ): Promise<FundNavV1> {
    const symbol = input.trim().toUpperCase();
    if (!fundSymbolPattern.test(symbol)) throw new Error(`非法场外基金代码: ${input}`);
    const flightKey = `fund-nav:${symbol}`;
    const freshKey = redisKey('cache', `fund-nav:${symbol}:fresh`);
    const lastValidKey = redisKey('cache', `fund-nav:${symbol}:last-valid`);
    if (!options.refresh) {
      const cached = await this.redis.client.get(freshKey);
      if (cached) return fundNavSchemaV1.parse({ ...JSON.parse(cached), servedFromCache: true });
    }
    const nav = await this.singleFlight(flightKey, () =>
      this.withDistributedLock(flightKey, async () => {
        if (!options.refresh) {
          const cached = await this.redis.client.get(freshKey);
          if (cached)
            return fundNavSchemaV1.parse({ ...JSON.parse(cached), servedFromCache: true });
        }
        try {
          const raw = await this.dsa.get<Record<string, unknown>>(
            `/api/v1/thesis-ledger/market/fund-nav?symbol=${encodeURIComponent(symbol)}`,
          );
          const nav = fundNavSchemaV1.parse({
            ...raw,
            version: 1,
            symbol,
            servedFromCache: false,
          });
          if (nav.freshness === 'unavailable') throw new Error('基金净值不可用');
          const serialized = JSON.stringify(nav);
          await this.redis.client
            .multi()
            .set(freshKey, serialized, 'EX', 300)
            .set(lastValidKey, serialized, 'EX', 7 * 86_400)
            .exec();
          return nav;
        } catch (error) {
          const lastValid = await this.redis.client.get(lastValidKey);
          if (lastValid)
            return fundNavSchemaV1.parse({
              ...JSON.parse(lastValid),
              freshness: 'stale',
              servedFromCache: true,
            });
          throw error;
        }
      }),
    );
    if (options.allowStale === false && nav.freshness === 'stale')
      throw new Error('基金净值陈旧，当前操作要求新鲜净值');
    return nav;
  }

  async getFundNavHistory(
    input: string,
    range: { start?: string; end?: string; limit?: number } = {},
    options: { refresh?: boolean; persistIdentity?: boolean } = {},
  ): Promise<FundNavHistoryV1> {
    const symbol = input.trim().toUpperCase();
    if (!fundSymbolPattern.test(symbol)) throw new Error(`非法场外基金代码: ${input}`);
    const limit = Math.min(Math.max(range.limit ?? 365, 1), 3650);
    const cacheKey = `fund-nav-history:${symbol}:${range.start ?? ''}:${range.end ?? ''}:${limit}`;
    const parse = (value: unknown) => fundNavHistorySchemaV1.parse(value);
    const markCached = (points: FundNavHistoryV1) =>
      parse(points.map((point) => ({ ...point, servedFromCache: true })));
    const markStale = (points: FundNavHistoryV1) =>
      parse(
        points.map((point) => ({
          ...point,
          freshness: 'stale',
          servedFromCache: true,
        })),
      );
    if (!options.refresh) {
      const cached = await this.resultCache.readFresh(cacheKey, parse, markCached);
      if (cached) return cached;
    }
    try {
      return await this.singleFlight(cacheKey, () =>
        this.withDistributedLock(cacheKey, () =>
          this.resultCache.transform({
            key: cacheKey,
            refresh: options.refresh === true,
            parse,
            markCached,
            markStale,
            policy: {
              freshSeconds: historicalSeriesFreshSeconds(range.end),
              lastValidSeconds: MARKET_CACHE_POLICIES.fundNavHistoryLastValidSeconds,
            },
            load: async () => {
              const query = new URLSearchParams({ symbol, limit: String(limit) });
              if (range.start) query.set('start', range.start);
              if (range.end) query.set('end', range.end);
              const raw = await this.dsa.get<unknown[]>(
                `/api/v1/thesis-ledger/market/fund-nav/history?${query.toString()}`,
              );
              const points = parse(
                raw.map((point) => ({
                  ...(point as Record<string, unknown>),
                  servedFromCache: false,
                })),
              );
              if (this.prisma && options.persistIdentity !== false && points.length > 0) {
                try {
                  await this.prisma.$transaction([
                    this.prisma.asset.upsert({
                      where: { symbol },
                      update: {},
                      create: {
                        symbol,
                        name: symbol,
                        market: 'OF',
                        assetType: 'fund',
                        currency: 'CNY',
                        identityStatus: 'provider',
                        identitySource: 'dsa-fund-nav',
                      },
                    }),
                    ...points.map((point) =>
                      this.prisma!.fundNavPoint.upsert({
                        where: { symbol_navDate: { symbol, navDate: new Date(point.navDate) } },
                        update: {
                          unitNav: point.unitNav,
                          provider: point.provider,
                          fetchedAt: new Date(point.fetchedAt),
                          freshness: point.freshness,
                          fallbackUsed: point.fallbackUsed ?? false,
                        },
                        create: {
                          symbol,
                          navDate: new Date(point.navDate),
                          unitNav: point.unitNav,
                          provider: point.provider,
                          fetchedAt: new Date(point.fetchedAt),
                          freshness: point.freshness,
                          fallbackUsed: point.fallbackUsed ?? false,
                        },
                      }),
                    ),
                  ]);
                } catch (error) {
                  this.logger.warn(`基金净值历史持久化失败: ${String(error)}`);
                }
              }
              return points;
            },
          }),
        ),
      );
    } catch (error) {
      if (!this.prisma) throw error;
      const stored = await this.prisma.fundNavPoint.findMany({
        where: {
          symbol,
          ...(range.start || range.end
            ? {
                navDate: {
                  ...(range.start ? { gte: new Date(range.start) } : {}),
                  ...(range.end ? { lte: new Date(range.end) } : {}),
                },
              }
            : {}),
        },
        orderBy: { navDate: 'desc' },
        take: limit,
      });
      if (stored.length === 0) throw error;
      return parse(
        stored.reverse().map((point) => ({
          version: 1,
          symbol: point.symbol,
          unitNav: Number(point.unitNav),
          navDate: point.navDate.toISOString(),
          provider: point.provider,
          fetchedAt: point.fetchedAt.toISOString(),
          freshness: 'stale',
          fallbackUsed: point.fallbackUsed,
          servedFromCache: true,
        })),
      );
    }
  }

  async getFundHoldings(
    input: string,
    options: { refresh?: boolean } = {},
  ): Promise<FundHoldingsV1> {
    const symbol = input.trim().toUpperCase();
    if (!fundSymbolPattern.test(symbol)) throw new Error(`非法场外基金代码: ${input}`);
    const key = redisKey('cache', `fund-holdings:${symbol}`);
    if (!options.refresh) {
      const cached = await this.redis.client.get(key);
      if (cached)
        return fundHoldingsSchemaV1.parse({ ...JSON.parse(cached), servedFromCache: true });
    }
    return this.singleFlight(`fund-holdings:${symbol}`, () =>
      this.withDistributedLock(`fund-holdings:${symbol}`, async () => {
        if (!options.refresh) {
          const cached = await this.redis.client.get(key);
          if (cached)
            return fundHoldingsSchemaV1.parse({ ...JSON.parse(cached), servedFromCache: true });
        }
        const raw = await this.dsa.get<Record<string, unknown>>(
          `/api/v1/thesis-ledger/market/fund-holdings?symbol=${encodeURIComponent(symbol)}`,
        );
        const holdings = fundHoldingsSchemaV1.parse({
          ...raw,
          version: 1,
          fundSymbol: symbol,
          servedFromCache: false,
        });
        await this.redis.client.set(key, JSON.stringify(holdings), 'EX', 86_400);
        return holdings;
      }),
    );
  }

  async getBars(
    input: string,
    timeframe: '1m' | '1d',
    range?: { start?: string; end?: string; limit?: number },
    options: { allowStale?: boolean; refresh?: boolean } = {},
  ): Promise<BarV1[]> {
    const { symbol } = normalizeSymbol(input);
    const cacheKey = this.barCache.key(symbol, timeframe, range);
    if (!options.refresh) {
      const cached = await this.barCache.read(cacheKey);
      if (cached) {
        if (options.allowStale === false && cached.some((bar) => bar.freshness === 'stale'))
          throw new Error('Bar 行情陈旧，当前操作要求新鲜行情');
        return cached;
      }
    }
    const bars = await this.singleFlight(cacheKey, () =>
      this.withDistributedLock(cacheKey, async () => {
        if (!options.refresh) {
          const cached = await this.barCache.read(cacheKey);
          if (cached) return cached;
        }
        const query = new URLSearchParams({ symbol, timeframe });
        if (range?.start) query.set('start', range.start);
        if (range?.end) query.set('end', range.end);
        if (range?.limit) query.set('limit', String(range.limit));
        try {
          const raw = await this.dsa.get<unknown[]>(
            `/api/v1/thesis-ledger/market/bars?${query.toString()}`,
          );
          const fetchedAt = new Date().toISOString();
          const resolved = resolveEffectiveBars(
            raw.map((bar) => ({
              ...(bar as Record<string, unknown>),
              version: 1,
              symbol,
              timeframe,
              fetchedAt:
                typeof (bar as Record<string, unknown>).fetchedAt === 'string'
                  ? (bar as Record<string, unknown>).fetchedAt
                  : fetchedAt,
              freshness:
                typeof (bar as Record<string, unknown>).freshness === 'string'
                  ? (bar as Record<string, unknown>).freshness
                  : 'unknown',
              servedFromCache: false,
            })) as BarInputV1[],
          );
          await this.barCache.record(cacheKey, resolved, range);
          return resolved;
        } catch (error) {
          const stored = await this.readStoredBars(symbol, timeframe, range);
          if (stored.length > 0) return stored;
          throw error;
        }
      }),
    );
    if (options.allowStale === false && bars.some((bar) => bar.freshness === 'stale'))
      throw new Error('Bar 行情陈旧，当前操作要求新鲜行情');
    return bars;
  }

  private async readStoredBars(
    symbol: string,
    timeframe: '1m' | '1d',
    range?: { start?: string; end?: string },
  ): Promise<BarV1[]> {
    if (!this.prisma) return [];
    const stored = await this.prisma.marketBar.findMany({
      where: {
        symbol,
        timeframe,
        ...(range?.start || range?.end
          ? {
              timestamp: {
                ...(range.start ? { gte: new Date(range.start) } : {}),
                ...(range.end ? { lte: new Date(range.end) } : {}),
              },
            }
          : {}),
      },
      orderBy: [
        { timestamp: 'asc' },
        { fallbackUsed: 'asc' },
        { fetchedAt: 'desc' },
        { provider: 'asc' },
      ],
    });
    return resolveEffectiveBars(
      stored.map((bar) => ({
        version: 1,
        symbol: bar.symbol,
        timeframe: bar.timeframe as '1m' | '1d',
        timestamp: bar.timestamp.toISOString(),
        open: Number(bar.open),
        high: Number(bar.high),
        low: Number(bar.low),
        close: Number(bar.close),
        volume: Number(bar.volume),
        amount: Number(bar.amount),
        provider: bar.provider,
        upstreamSource: bar.upstreamSource ?? undefined,
        fetchedAt: bar.fetchedAt.toISOString(),
        freshness: 'stale',
        fallbackUsed: bar.fallbackUsed,
        servedFromCache: true,
      })),
    );
  }

  async getIndicator(
    input: string,
    name: 'MA' | 'MACD' | 'RSI' | 'ATR',
    options: { refresh?: boolean } = {},
  ): Promise<IndicatorV1> {
    const { symbol } = normalizeSymbol(input);
    const refresh = options.refresh === true;
    const key = `indicator:${symbol}:${name}`;
    const parse = (value: unknown) => indicatorSchemaV1.parse(value);
    const markCached = (value: IndicatorV1) =>
      indicatorSchemaV1.parse({ ...value, servedFromCache: true });
    if (!refresh) {
      const cached = await this.resultCache.readFresh(key, parse, markCached);
      if (cached) return cached;
    }
    return this.singleFlight(key, () =>
      this.withDistributedLock(key, () =>
        this.resultCache.transform({
          key,
          refresh,
          parse,
          markCached,
          policy: MARKET_CACHE_POLICIES.indicator,
          load: async () => {
            const raw = await this.dsa.get<Record<string, unknown>>(
              `/api/v1/thesis-ledger/market/indicators/${name.toLowerCase()}?symbol=${encodeURIComponent(symbol)}&timeframe=1d`,
            );
            return indicatorSchemaV1.parse({
              ...raw,
              version: 1,
              symbol,
              name,
              provider: typeof raw.provider === 'string' ? raw.provider : 'dsa-fork',
              servedFromCache: false,
            });
          },
          markStale: (value) =>
            indicatorSchemaV1.parse({ ...value, fallbackUsed: true, servedFromCache: true }),
        }),
      ),
    );
  }

  async getChip(input: string, options: { refresh?: boolean } = {}): Promise<ChipDistributionV1> {
    const { symbol } = normalizeSymbol(input);
    const refresh = options.refresh === true;
    const key = `chip:${symbol}`;
    const parse = (value: unknown) => chipDistributionSchemaV1.parse(value);
    const markCached = (value: ChipDistributionV1) =>
      chipDistributionSchemaV1.parse({ ...value, servedFromCache: true });
    if (!refresh) {
      const cached = await this.resultCache.readFresh(key, parse, markCached);
      if (cached) return cached;
    }
    return this.singleFlight(key, () =>
      this.withDistributedLock(key, () =>
        this.resultCache.transform({
          key,
          refresh,
          parse,
          markCached,
          policy: MARKET_CACHE_POLICIES.chipSummary,
          load: async () => {
            const raw = await this.dsa.get<Record<string, unknown>>(
              `/api/v1/thesis-ledger/market/chip?symbol=${encodeURIComponent(symbol)}`,
            );
            return chipDistributionSchemaV1.parse({
              ...raw,
              version: 1,
              symbol,
              provider: typeof raw.provider === 'string' ? raw.provider : 'dsa-fork',
              servedFromCache: false,
            });
          },
          markStale: (value) =>
            chipDistributionSchemaV1.parse({
              ...value,
              fallbackUsed: true,
              servedFromCache: true,
            }),
        }),
      ),
    );
  }
}
