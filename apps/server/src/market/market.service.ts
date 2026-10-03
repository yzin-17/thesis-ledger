import {
  parseCurrentFundNav,
  parseCurrentFundHoldings,
  parseCurrentChip,
} from './market-current-data.js';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { normalizeSymbol } from '@thesis-ledger/domain';
import {
  fundNavHistorySchema,
  fxRatesResponseSchema,
  type ChipDistribution,
  type Currency,
  type FxRatesResponse,
  type FundNav,
  type FundNavHistory,
  type FundHoldings,
} from '@thesis-ledger/schemas';
import { DsaClient } from '../integration/dsa/dsa.client.js';
import { RedisService, redisKey } from '../platform/redis.service.js';
import { PrismaService } from '../platform/prisma.service.js';
import { MarketQuoteReader } from './market-quote-reader.js';
import {
  historicalSeriesFreshSeconds,
  MARKET_CACHE_POLICIES,
  MarketResultCache,
} from './market-result-cache.js';

const fundSymbolPattern = /^\d{6}\.OF$/;
@Injectable()
export class MarketService {
  private readonly logger = new Logger(MarketService.name);
  private readonly quoteReader: MarketQuoteReader;
  private readonly resultCache: MarketResultCache;

  constructor(
    private readonly dsa: DsaClient,
    private readonly redis: RedisService,
    @Optional() private readonly prisma?: PrismaService,
  ) {
    this.quoteReader = new MarketQuoteReader(dsa, redis);
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
    baseCurrency: Currency;
    currencies: readonly Currency[];
    asOf?: string;
  }): Promise<FxRatesResponse> {
    const currencies = [...new Set(input.currencies)].sort();
    const asOf = input.asOf?.slice(0, 10);
    const key = `fx-rates:${input.baseCurrency}:${currencies.join(',')}:${asOf ?? 'today'}`;
    return this.singleFlight(key, async () => {
      const raw = await this.dsa.fxRates({
        baseCurrency: input.baseCurrency,
        currencies,
        ...(asOf ? { asOf } : {}),
      });
      return fxRatesResponseSchema.parse(raw);
    });
  }

  getQuote(input: string, options: { allowStale?: boolean; refresh?: boolean } = {}) {
    return this.quoteReader.getQuote(input, options);
  }

  async getFundNav(
    input: string,
    options: { allowStale?: boolean; refresh?: boolean } = {},
  ): Promise<FundNav> {
    const symbol = input.trim().toUpperCase();
    if (!fundSymbolPattern.test(symbol)) throw new Error(`非法场外基金代码: ${input}`);
    const flightKey = `fund-nav:3:${symbol}`;
    const freshKey = redisKey('cache', `fund-nav:3:${symbol}:fresh`);
    const lastValidKey = redisKey('cache', `fund-nav:3:${symbol}:last-valid`);
    if (!options.refresh) {
      const cached = await this.redis.client.get(freshKey);
      if (cached)
        return parseCurrentFundNav({ ...JSON.parse(cached), servedFromCache: true }, symbol);
    }
    const nav = await this.singleFlight(flightKey, () =>
      this.withDistributedLock(flightKey, async () => {
        if (!options.refresh) {
          const cached = await this.redis.client.get(freshKey);
          if (cached)
            return parseCurrentFundNav({ ...JSON.parse(cached), servedFromCache: true }, symbol);
        }
        try {
          const raw = await this.dsa.get<Record<string, unknown>>(
            `/api/v3/thesis-ledger/market/fund-nav?symbol=${encodeURIComponent(symbol)}`,
          );
          const nav = parseCurrentFundNav(
            {
              ...raw,
              servedFromCache: false,
            },
            symbol,
          );
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
            return parseCurrentFundNav(
              {
                ...JSON.parse(lastValid),
                freshness: 'stale',
                servedFromCache: true,
              },
              symbol,
            );
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
  ): Promise<FundNavHistory> {
    const symbol = input.trim().toUpperCase();
    if (!fundSymbolPattern.test(symbol)) throw new Error(`非法场外基金代码: ${input}`);
    const limit = Math.min(Math.max(range.limit ?? 365, 1), 3650);
    const cacheKey = `fund-nav-history:3:${symbol}:${range.start ?? ''}:${range.end ?? ''}:${limit}`;
    const parse = (value: unknown) => {
      const points = fundNavHistorySchema.parse(value);
      if (points.some((point) => point.symbol !== symbol)) {
        throw new Error('基金净值历史响应代码与请求不一致');
      }
      return points;
    };
    const markCached = (points: FundNavHistory) =>
      parse(points.map((point) => ({ ...point, servedFromCache: true })));
    const markStale = (points: FundNavHistory) =>
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
              `/api/v3/thesis-ledger/market/fund-nav/history?${query.toString()}`,
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
  }

  async getFundHoldings(input: string, options: { refresh?: boolean } = {}): Promise<FundHoldings> {
    const symbol = input.trim().toUpperCase();
    if (!fundSymbolPattern.test(symbol)) throw new Error(`非法场外基金代码: ${input}`);
    const key = redisKey('cache', `fund-holdings:3:${symbol}`);
    if (!options.refresh) {
      const cached = await this.redis.client.get(key);
      if (cached)
        return parseCurrentFundHoldings({ ...JSON.parse(cached), servedFromCache: true }, symbol);
    }
    return this.singleFlight(`fund-holdings:3:${symbol}`, () =>
      this.withDistributedLock(`fund-holdings:3:${symbol}`, async () => {
        if (!options.refresh) {
          const cached = await this.redis.client.get(key);
          if (cached)
            return parseCurrentFundHoldings(
              { ...JSON.parse(cached), servedFromCache: true },
              symbol,
            );
        }
        const raw = await this.dsa.get<Record<string, unknown>>(
          `/api/v3/thesis-ledger/market/fund-holdings?symbol=${encodeURIComponent(symbol)}`,
        );
        const holdings = parseCurrentFundHoldings(
          {
            ...raw,
            servedFromCache: false,
          },
          symbol,
        );
        await this.redis.client.set(key, JSON.stringify(holdings), 'EX', 86_400);
        return holdings;
      }),
    );
  }

  async getChip(input: string, options: { refresh?: boolean } = {}): Promise<ChipDistribution> {
    const { symbol } = normalizeSymbol(input);
    const refresh = options.refresh === true;
    const key = `chip:3:${symbol}`;
    const parse = (value: unknown) => parseCurrentChip(value, symbol);
    const markCached = (value: ChipDistribution) =>
      parseCurrentChip({ ...value, servedFromCache: true }, symbol);
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
              `/api/v3/thesis-ledger/market/chip?symbol=${encodeURIComponent(symbol)}`,
            );
            const chip = parseCurrentChip(
              {
                ...raw,
                servedFromCache: false,
              },
              symbol,
            );
            return chip;
          },
          markStale: (value) =>
            parseCurrentChip(
              {
                ...value,
                fallbackUsed: true,
                servedFromCache: true,
              },
              symbol,
            ),
        }),
      ),
    );
  }
}
