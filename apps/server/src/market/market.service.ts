import { Injectable } from '@nestjs/common';
import { normalizeSymbol } from '@thesis-ledger/domain';
import {
  barsSchemaV1,
  chipDistributionSchemaV1,
  fundNavSchemaV1,
  indicatorSchemaV1,
  quoteSchemaV1,
  type BarV1,
  type ChipDistributionV1,
  type FundNavV1,
  type IndicatorV1,
  type QuoteV1,
} from '@thesis-ledger/schemas';
import { DsaClient } from './dsa-client.js';
import { RedisService, redisKey } from '../platform/redis.service.js';

const fundSymbolPattern = /^\d{6}\.OF$/;

@Injectable()
export class MarketService {
  constructor(
    private readonly dsa: DsaClient,
    private readonly redis: RedisService,
  ) {}

  async getQuote(input: string): Promise<QuoteV1> {
    const { symbol } = normalizeSymbol(input);
    const freshKey = redisKey('cache', `quote:${symbol}:fresh`);
    const lastValidKey = redisKey('cache', `quote:${symbol}:last-valid`);
    const cached = await this.redis.client.get(freshKey);
    if (cached) return quoteSchemaV1.parse(JSON.parse(cached));
    try {
      const raw = await this.dsa.get<Record<string, unknown>>(
        `/api/v1/thesis-ledger/market/quote?symbol=${encodeURIComponent(symbol)}`,
      );
      const quote = quoteSchemaV1.parse({
        ...raw,
        version: 1,
        symbol,
        provider: typeof raw.provider === 'string' ? raw.provider : 'dsa-fork',
        fetchedAt: typeof raw.fetchedAt === 'string' ? raw.fetchedAt : new Date().toISOString(),
      });
      const serialized = JSON.stringify(quote);
      await this.redis.client
        .multi()
        .set(freshKey, serialized, 'EX', 15)
        .set(lastValidKey, serialized, 'EX', 86_400)
        .exec();
      return quote;
    } catch (error) {
      const lastValid = await this.redis.client.get(lastValidKey);
      if (lastValid)
        return quoteSchemaV1.parse({
          ...JSON.parse(lastValid),
          stale: true,
          freshness: 'stale',
        });
      throw error;
    }
  }

  async getFundNav(input: string): Promise<FundNavV1> {
    const symbol = input.trim().toUpperCase();
    if (!fundSymbolPattern.test(symbol)) throw new Error(`非法场外基金代码: ${input}`);
    const freshKey = redisKey('cache', `fund-nav:${symbol}:fresh`);
    const lastValidKey = redisKey('cache', `fund-nav:${symbol}:last-valid`);
    const cached = await this.redis.client.get(freshKey);
    if (cached) return fundNavSchemaV1.parse(JSON.parse(cached));
    try {
      const raw = await this.dsa.get<Record<string, unknown>>(
        `/api/v1/thesis-ledger/market/fund-nav?symbol=${encodeURIComponent(symbol)}`,
      );
      const nav = fundNavSchemaV1.parse({
        ...raw,
        version: 1,
        symbol,
        provider: typeof raw.provider === 'string' ? raw.provider : 'dsa-fork',
        fetchedAt: typeof raw.fetchedAt === 'string' ? raw.fetchedAt : new Date().toISOString(),
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
        });
      throw error;
    }
  }

  async getBars(
    input: string,
    timeframe: '1m' | '1d',
    range?: { start?: string; end?: string },
  ): Promise<BarV1[]> {
    const { symbol } = normalizeSymbol(input);
    const query = new URLSearchParams({ symbol, timeframe });
    if (range?.start) query.set('start', range.start);
    if (range?.end) query.set('end', range.end);
    const raw = await this.dsa.get<unknown[]>(
      `/api/v1/thesis-ledger/market/bars?${query.toString()}`,
    );
    return barsSchemaV1.parse(
      raw.map((bar) => ({
        ...(bar as object),
        version: 1,
        symbol,
        timeframe,
        provider:
          typeof (bar as Record<string, unknown>).provider === 'string'
            ? (bar as Record<string, unknown>).provider
            : 'dsa-fork',
      })),
    );
  }

  async getIndicator(input: string, name: 'MA' | 'MACD' | 'RSI' | 'ATR'): Promise<IndicatorV1> {
    const { symbol } = normalizeSymbol(input);
    const raw = await this.dsa.get<Record<string, unknown>>(
      `/api/v1/thesis-ledger/market/indicators/${name.toLowerCase()}?symbol=${encodeURIComponent(symbol)}&timeframe=1d`,
    );
    return indicatorSchemaV1.parse({
      ...raw,
      version: 1,
      symbol,
      name,
      provider: typeof raw.provider === 'string' ? raw.provider : 'dsa-fork',
    });
  }

  async getChip(input: string): Promise<ChipDistributionV1> {
    const { symbol } = normalizeSymbol(input);
    const raw = await this.dsa.get<Record<string, unknown>>(
      `/api/v1/thesis-ledger/market/chip?symbol=${encodeURIComponent(symbol)}`,
    );
    return chipDistributionSchemaV1.parse({
      ...raw,
      version: 1,
      symbol,
      provider: typeof raw.provider === 'string' ? raw.provider : 'dsa-fork',
    });
  }
}
