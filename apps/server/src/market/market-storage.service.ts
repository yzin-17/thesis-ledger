import { Injectable } from '@nestjs/common';
import { normalizeSymbol } from '@thesis-ledger/domain';
import { barsSchemaV1, type BarV1 } from '@thesis-ledger/schemas';
import { PrismaService } from '../platform/prisma.service.js';
import { DataQualityService } from '../quality/data-quality.service.js';
import { MarketService } from './market.service.js';

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
      const filtered = latest
        ? bars.filter((bar) => new Date(bar.timestamp) > latest.timestamp)
        : bars;
      const saved = await this.saveBars(filtered);
      return {
        ...saved,
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
      data: { status: 'running', attempts: { increment: 1 } },
    });
    try {
      const result = await this.syncBars({
        symbol: job.symbol,
        timeframe: job.timeframe as '1m' | '1d',
        start: cursor,
        end: job.end.toISOString(),
        mode: 'backfill',
      });
      const lastTimestamp = result.lastTimestamp ? new Date(result.lastTimestamp) : null;
      const done = lastTimestamp === null || lastTimestamp.getTime() >= job.end.getTime();
      return this.prisma.backfillJob.update({
        where: { id },
        data: {
          status: done ? 'succeeded' : 'queued',
          progress: done ? 100 : Math.min(99, job.progress + 25),
          cursor: done ? job.end : lastTimestamp,
        },
      });
    } catch (error) {
      return this.prisma.backfillJob.update({
        where: { id },
        data: { status: 'failed', error: error instanceof Error ? error.message : '回填失败' },
      });
    }
  }

  listBars(symbolInput: string, timeframe: '1m' | '1d', start?: string, end?: string) {
    const { symbol } = normalizeSymbol(symbolInput);
    return this.prisma.marketBar.findMany({
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
      orderBy: { timestamp: 'asc' },
    });
  }

  private ensureAsset(bar: BarV1) {
    return this.prisma.asset.upsert({
      where: { symbol: bar.symbol },
      update: {},
      create: {
        symbol: bar.symbol,
        name: bar.symbol,
        market: bar.symbol.endsWith('.HK') ? 'HK' : 'CN',
        assetType: bar.symbol.startsWith('51') || bar.symbol.startsWith('15') ? 'etf' : 'stock',
        currency: bar.symbol.endsWith('.HK') ? 'HKD' : 'CNY',
      },
    });
  }
}
