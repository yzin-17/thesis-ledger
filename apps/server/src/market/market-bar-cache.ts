import { Logger } from '@nestjs/common';
import { normalizeSymbol } from '@thesis-ledger/domain';
import { barSchemaV1, type BarInputV1, type BarV1 } from '@thesis-ledger/schemas';
import type { PrismaService } from '../platform/prisma.service.js';
import { redisKey } from '../platform/redis.service.js';
import type { RedisService } from '../platform/redis.service.js';

const freshnessRank: Record<BarV1['freshness'], number> = {
  live: 0,
  delayed: 1,
  unknown: 2,
  stale: 3,
};

export const resolveEffectiveBars = (rawBars: readonly BarInputV1[]): BarV1[] => {
  const selected = new Map<string, { bar: BarV1; index: number }>();
  rawBars.forEach((raw, index) => {
    const bar = barSchemaV1.parse(raw);
    const existing = selected.get(bar.timestamp);
    if (!existing) {
      selected.set(bar.timestamp, { bar, index });
      return;
    }
    const fallbackDelta = Number(bar.fallbackUsed) - Number(existing.bar.fallbackUsed);
    const freshnessDelta = freshnessRank[bar.freshness] - freshnessRank[existing.bar.freshness];
    const fetchedDelta =
      new Date(existing.bar.fetchedAt).getTime() - new Date(bar.fetchedAt).getTime();
    const providerDelta = bar.provider.localeCompare(existing.bar.provider);
    if (
      fallbackDelta < 0 ||
      (fallbackDelta === 0 && freshnessDelta < 0) ||
      (fallbackDelta === 0 && freshnessDelta === 0 && fetchedDelta < 0) ||
      (fallbackDelta === 0 &&
        freshnessDelta === 0 &&
        fetchedDelta === 0 &&
        (index < existing.index || (index === existing.index && providerDelta < 0)))
    )
      selected.set(bar.timestamp, { bar, index });
  });
  return [...selected.values()]
    .map(({ bar }) => bar)
    .sort((left, right) => left.timestamp.localeCompare(right.timestamp));
};

export class MarketBarCache {
  private readonly logger = new Logger(MarketBarCache.name);

  constructor(
    private readonly redis: RedisService,
    private readonly prisma?: PrismaService,
  ) {}

  key(
    symbol: string,
    timeframe: '1m' | '1d',
    range?: { start?: string; end?: string; limit?: number },
  ) {
    return `bars:${symbol}:${timeframe}:${range?.start ?? ''}:${range?.end ?? ''}:${range?.limit ?? ''}`;
  }

  async read(key: string): Promise<BarV1[] | null> {
    const client = this.redis?.client as
      { get?: (key: string) => Promise<string | null> } | undefined;
    if (typeof client?.get !== 'function') return null;
    try {
      const cached = await client.get(redisKey('cache', `${key}:fresh`));
      if (!cached) return null;
      return resolveEffectiveBars(
        (JSON.parse(cached) as BarInputV1[]).map((bar) => ({
          ...bar,
          servedFromCache: true,
        })),
      );
    } catch (error) {
      this.logger.warn(`读取日线缓存失败，改为请求数据源：${String(error)}`);
      return null;
    }
  }

  async record(key: string, bars: readonly BarV1[], range?: { end?: string }) {
    const writes = await Promise.allSettled([
      this.persist(bars),
      this.writeFresh(key, bars, range),
    ]);
    writes.forEach((result) => {
      if (result.status === 'rejected')
        this.logger.warn(`写入日线缓存失败，本次仍返回数据源结果：${String(result.reason)}`);
    });
  }

  private ttl(range?: { end?: string }) {
    const today = new Date().toISOString().slice(0, 10);
    return range?.end && range.end.slice(0, 10) < today ? 30 * 86_400 : 15 * 60;
  }

  private async writeFresh(key: string, bars: readonly BarV1[], range?: { end?: string }) {
    const client = this.redis?.client as
      { set?: (...args: [string, string, 'EX', number]) => Promise<unknown> } | undefined;
    if (typeof client?.set !== 'function') return;
    await client.set(
      redisKey('cache', `${key}:fresh`),
      JSON.stringify(bars),
      'EX',
      this.ttl(range),
    );
  }

  private async persist(bars: readonly BarV1[]) {
    if (!this.prisma || bars.length === 0) return;
    const symbol = bars[0]!.symbol;
    const normalized = normalizeSymbol(symbol);
    await this.prisma.asset.upsert({
      where: { symbol },
      update: {},
      create: {
        symbol,
        name: symbol,
        market: normalized.market,
        assetType: normalized.assetType,
        currency: 'CNY',
        identityStatus: 'provider',
        identitySource: 'dsa-bars',
      },
    });
    await this.prisma.$transaction(
      bars.map((bar) =>
        this.prisma!.marketBar.upsert({
          where: {
            symbol_timeframe_timestamp_provider: {
              symbol: bar.symbol,
              timeframe: bar.timeframe,
              timestamp: new Date(bar.timestamp),
              provider: bar.provider,
            },
          },
          update: {
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close,
            volume: bar.volume,
            amount: bar.amount,
            upstreamSource: bar.upstreamSource ?? null,
            fetchedAt: new Date(bar.fetchedAt),
            freshness: bar.freshness,
            fallbackUsed: bar.fallbackUsed,
          },
          create: {
            symbol: bar.symbol,
            timeframe: bar.timeframe,
            timestamp: new Date(bar.timestamp),
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close,
            volume: bar.volume,
            amount: bar.amount,
            provider: bar.provider,
            upstreamSource: bar.upstreamSource ?? null,
            fetchedAt: new Date(bar.fetchedAt),
            freshness: bar.freshness,
            fallbackUsed: bar.fallbackUsed,
          },
        }),
      ),
    );
  }
}
