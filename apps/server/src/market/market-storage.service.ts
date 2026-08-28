import { Injectable } from '@nestjs/common';
import { cnTradingCalendar, normalizeSymbol } from '@thesis-ledger/domain';
import { barsSchemaV1, type BarV1 } from '@thesis-ledger/schemas';
import { PrismaService } from '../platform/prisma.service.js';
import { DataQualityService } from '../quality/data-quality.service.js';
import { MarketService, resolveEffectiveBars } from './market.service.js';

type BarSyncOutcome = 'data' | 'no-data' | 'incomplete';

const dateKey = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
};

export const classifyEmptyBarRange = (
  start?: string,
  end?: string,
): Exclude<BarSyncOutcome, 'data'> => {
  if (!start || !end) return 'incomplete';
  const first = dateKey(start);
  const last = dateKey(end);
  if (!first || !last || first > last) return 'incomplete';
  const cursor = new Date(`${first}T04:00:00Z`);
  const final = new Date(`${last}T04:00:00Z`);
  let hasKnownDate = false;
  while (cursor <= final) {
    const status = cnTradingCalendar.status(cursor);
    if (status.reason === 'calendar-unavailable') return 'incomplete';
    hasKnownDate = true;
    if (status.open) return 'incomplete';
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return hasKnownDate ? 'no-data' : 'incomplete';
};

@Injectable()
export class MarketStorageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly market: MarketService,
    private readonly quality: DataQualityService,
  ) {}

  async saveBars(rawBars: unknown, provider = 'dsa') {
    const bars = barsSchemaV1.parse(rawBars);
    for (const bar of bars) await this.ensureAsset(bar);
    await this.prisma.$transaction(
      bars.map((bar) =>
        this.prisma.marketBar.upsert({
          where: {
            symbol_timeframe_timestamp_provider: {
              symbol: bar.symbol,
              timeframe: bar.timeframe,
              timestamp: new Date(bar.timestamp),
              provider: bar.provider || provider,
            },
          },
          update: {
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close,
            volume: bar.volume,
            amount: bar.amount,
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
            provider: bar.provider || provider,
            fetchedAt: new Date(bar.fetchedAt),
            freshness: bar.freshness,
            fallbackUsed: bar.fallbackUsed,
          },
        }),
      ),
    );
    return { count: bars.length, symbols: [...new Set(bars.map((bar) => bar.symbol))], provider };
  }

  async syncBars(input: {
    symbol: string;
    timeframe: '1m' | '1d';
    start?: string;
    end?: string;
    mode?: 'incremental' | 'backfill';
  }) {
    const { symbol } = normalizeSymbol(input.symbol);
    try {
      const latest =
        input.mode === 'incremental'
          ? await this.prisma.marketBar.findFirst({
              where: { symbol, timeframe: input.timeframe },
              orderBy: { timestamp: 'desc' },
            })
          : null;
      const start = latest?.timestamp.toISOString() ?? input.start;
      const bars = await this.market.getBars(symbol, input.timeframe, {
        ...(start ? { start } : {}),
        ...(input.end ? { end: input.end } : {}),
      });
      if (bars.some((bar) => bar.freshness === 'stale' || bar.servedFromCache)) {
        throw new Error('行情同步拒绝使用陈旧缓存 Bar');
      }
      const filtered = latest
        ? bars.filter((bar) => new Date(bar.timestamp) > latest.timestamp)
        : bars;
      const saved = await this.saveBars(filtered);
      const outcome: BarSyncOutcome =
        filtered.length > 0 ? 'data' : classifyEmptyBarRange(start, input.end);
      return {
        ...saved,
        outcome,
        mode: input.mode ?? 'backfill',
        requestedRange: { start: input.start ?? null, end: input.end ?? null },
        resumedAfter: latest?.timestamp.toISOString() ?? null,
        lastTimestamp: filtered.at(-1)?.timestamp ?? null,
      };
    } catch (error) {
      await this.quality.record({
        capability: `bars-${input.timeframe}`,
        provider: 'dsa',
        symbol,
        severity: 'error',
        code: 'sync_failed',
        details: { message: error instanceof Error ? error.message : '行情同步失败' },
      });
      throw error;
    }
  }

  async createBackfill(input: {
    symbol: string;
    timeframe: '1m' | '1d';
    start: string;
    end: string;
  }) {
    const { symbol } = normalizeSymbol(input.symbol);
    return this.prisma.backfillJob.create({
      data: {
        symbol,
        timeframe: input.timeframe,
        start: new Date(input.start),
        end: new Date(input.end),
      },
    });
  }

  async runBackfill(id: string) {
    const job = await this.prisma.backfillJob.findUniqueOrThrow({ where: { id } });
    const cursor = job.cursor?.toISOString() ?? job.start.toISOString();
    await this.prisma.backfillJob.update({
      where: { id },
      data: { status: 'running', attempts: { increment: 1 }, error: null },
    });
    try {
      const result = await this.syncBars({
        symbol: job.symbol,
        timeframe: job.timeframe as '1m' | '1d',
        start: cursor,
        end: job.end.toISOString(),
        mode: 'backfill',
      });
      if (result.outcome === 'no-data') {
        return this.prisma.backfillJob.update({
          where: { id },
          data: { status: 'succeeded', progress: 100, cursor: job.end, error: null },
        });
      }
      if (result.outcome === 'incomplete') {
        return this.prisma.backfillJob.update({
          where: { id },
          data: {
            status: 'queued',
            progress: job.progress,
            cursor: job.cursor,
            error: '回填范围包含预期交易时段，但 Provider 未返回 Bar',
          },
        });
      }
      const lastTimestamp = result.lastTimestamp ? new Date(result.lastTimestamp) : null;
      const done = lastTimestamp !== null && lastTimestamp.getTime() >= job.end.getTime();
      return this.prisma.backfillJob.update({
        where: { id },
        data: {
          status: done ? 'succeeded' : 'queued',
          progress: done ? 100 : Math.min(99, job.progress + 25),
          cursor: done ? job.end : lastTimestamp,
          error: null,
        },
      });
    } catch (error) {
      return this.prisma.backfillJob.update({
        where: { id },
        data: { status: 'failed', error: error instanceof Error ? error.message : '回填失败' },
      });
    }
  }

  async listBars(symbolInput: string, timeframe: '1m' | '1d', start?: string, end?: string) {
    const { symbol } = normalizeSymbol(symbolInput);
    const stored = await this.prisma.marketBar.findMany({
      where: {
        symbol,
        timeframe,
        ...(start || end
          ? {
              timestamp: {
                ...(start ? { gte: new Date(start) } : {}),
                ...(end ? { lte: new Date(end) } : {}),
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
        fetchedAt: bar.fetchedAt.toISOString(),
        freshness: 'stale',
        fallbackUsed: bar.fallbackUsed,
        servedFromCache: true,
      })),
    );
  }

  private ensureAsset(bar: BarV1) {
    const normalized = normalizeSymbol(bar.symbol);
    if (normalized.assetType === 'fund') throw new Error('场外基金净值不能写入 MarketBar');
    return this.prisma.asset.upsert({
      where: { symbol: normalized.symbol },
      update: {},
      create: {
        symbol: normalized.symbol,
        name: normalized.symbol,
        market: normalized.market,
        assetType: normalized.assetType,
        currency: 'CNY',
        identityStatus: 'provider',
        identitySource: 'catalog',
      },
    });
  }
}
