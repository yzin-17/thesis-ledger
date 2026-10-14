import { Logger } from '@nestjs/common';
import { fundNavHistorySchema, type FundNav, type FundNavHistory, type FundHoldings } from '@thesis-ledger/schemas';
import type { DsaClient } from '../integration/dsa/dsa.client.js';
import { redisKey, type RedisService } from '../platform/redis.service.js';
import type { PrismaService } from '../platform/prisma.service.js';
import { parseCurrentFundNav, parseCurrentFundHoldings } from './market-current-data.js';
import { MarketCacheControl, type MarketCacheScope } from './market-cache-control.js';
import { historicalSeriesFreshSeconds, MARKET_CACHE_POLICIES, MarketResultCache } from './market-result-cache.js';

const fundSymbolPattern = /^\d{6}\.OF$/;
type WorkGate = <T>(key: string, work: () => Promise<T>) => Promise<T>;

/** 场外基金当前消费与缓存，由原 DsaClient 承接来源执行和控制事实。 */
export class MarketFundReader {
  private readonly logger = new Logger(MarketFundReader.name);
  private readonly control: MarketCacheControl;
  private readonly resultCache: MarketResultCache;
  constructor(private readonly dsa: DsaClient, private readonly redis: RedisService,
    private readonly singleFlight: WorkGate, private readonly withDistributedLock: WorkGate,
    private readonly prisma?: PrismaService) {
    this.control = new MarketCacheControl(dsa);
    this.resultCache = new MarketResultCache(redis);
  }
  private async checked<T>(scope: MarketCacheScope, value: T, allowStale?: boolean): Promise<T> {
    await this.control.assertCurrent(scope);
    if (allowStale === false && (value as FundNav).freshness === 'stale')
      throw new Error('基金净值陈旧，当前操作要求新鲜净值');
    return value;
  }

  async getFundNav(
    input: string,
    options: { allowStale?: boolean; refresh?: boolean } = {},
  ): Promise<FundNav> {
    const symbol = input.trim().toUpperCase();
    if (!fundSymbolPattern.test(symbol)) throw new Error(`非法场外基金代码: ${input}`);
    const scope = await this.control.read({ capability: 'FUND_NAV', symbol });
    const flightKey = `fund-nav:4:${symbol}:${scope.context.generation}`;
    const freshKey = redisKey('cache', `${flightKey}:fresh`);
    const lastValidKey = redisKey('cache', `${flightKey}:last-valid`);
    if (!options.refresh) {
      const cached = await this.redis.client.get(freshKey);
      if (cached)
        return this.checked(scope, parseCurrentFundNav({ ...JSON.parse(cached), servedFromCache: true }, symbol), options.allowStale);
    }
    const nav = await this.singleFlight(flightKey, () =>
      this.withDistributedLock(flightKey, async () => {
        await this.control.assertCurrent(scope);
        if (!options.refresh) {
          const cached = await this.redis.client.get(freshKey);
          if (cached)
            return this.checked(scope, parseCurrentFundNav({ ...JSON.parse(cached), servedFromCache: true }, symbol), options.allowStale);
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
          await this.control.assertCurrent(scope);
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
    return this.checked(scope, nav, options.allowStale);
  }

  async getFundNavHistory(
    input: string,
    range: { start?: string; end?: string; limit?: number } = {},
    options: { refresh?: boolean; persistIdentity?: boolean } = {},
  ): Promise<FundNavHistory> {
    const symbol = input.trim().toUpperCase();
    if (!fundSymbolPattern.test(symbol)) throw new Error(`非法场外基金代码: ${input}`);
    const limit = Math.min(Math.max(range.limit ?? 365, 1), 3650);
    const scope = await this.control.read({ capability: 'FUND_NAV_HISTORY', symbol });
    const cacheKey = `fund-nav-history:4:${scope.context.generation}:${symbol}:${range.start ?? ''}:${range.end ?? ''}:${limit}`;
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
      if (cached) return this.checked(scope, cached);
    }
    const result = await this.singleFlight(cacheKey, () =>
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
            await this.control.assertCurrent(scope);
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
            await this.control.assertCurrent(scope);
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
            await this.control.assertCurrent(scope);
            return points;
          },
        }),
      ),
    );
    return this.checked(scope, result);
  }

  async getFundHoldings(input: string, options: { refresh?: boolean } = {}): Promise<FundHoldings> {
    const symbol = input.trim().toUpperCase();
    if (!fundSymbolPattern.test(symbol)) throw new Error(`非法场外基金代码: ${input}`);
    const scope = await this.control.read({ capability: 'FUND_HOLDINGS', symbol });
    const flightKey = `fund-holdings:4:${symbol}:${scope.context.generation}`;
    const key = redisKey('cache', flightKey);
    if (!options.refresh) {
      const cached = await this.redis.client.get(key);
      if (cached)
        return this.checked(scope, parseCurrentFundHoldings({ ...JSON.parse(cached), servedFromCache: true }, symbol));
    }
    const result = await this.singleFlight(flightKey, () =>
      this.withDistributedLock(flightKey, async () => {
        await this.control.assertCurrent(scope);
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
        await this.control.assertCurrent(scope);
        await this.redis.client.set(key, JSON.stringify(holdings), 'EX', 86_400);
        return holdings;
      }),
    );
    return this.checked(scope, result);
  }

}
