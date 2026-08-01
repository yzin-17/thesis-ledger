import { Injectable } from '@nestjs/common';
import { normalizeSymbol } from '@investment-os/domain';
import {
  barsSchemaV1,
  chipDistributionSchemaV1,
  indicatorSchemaV1,
  quoteSchemaV1,
  type BarV1,
  type ChipDistributionV1,
  type IndicatorV1,
  type QuoteV1,
} from '@investment-os/schemas';
import { DsaClient } from './dsa-client.js';
import { RedisService, redisKey } from '../platform/redis.service.js';

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
        `/api/quote?symbol=${encodeURIComponent(symbol)}`,
      );
      const quote = quoteSchemaV1.parse({
        version: 1,
        symbol,
        ...raw,
        provider: 'dsa',
        fetchedAt: new Date().toISOString(),
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

  async getBars(
    input: string,
    timeframe: '1m' | '1d',
    range?: { start?: string; end?: string },
  ): Promise<BarV1[]> {
    const { symbol } = normalizeSymbol(input);
    const query = new URLSearchParams({ symbol, timeframe });
    if (range?.start) query.set('start', range.start);
    if (range?.end) query.set('end', range.end);
    const raw = await this.dsa.get<unknown[]>(`/api/bars?${query.toString()}`);
    return barsSchemaV1.parse(
      raw.map((bar) => ({ version: 1, symbol, timeframe, provider: 'dsa', ...(bar as object) })),
    );
  }

  async getIndicator(input: string, name: 'MA' | 'MACD' | 'RSI' | 'ATR'): Promise<IndicatorV1> {
    const { symbol } = normalizeSymbol(input);
    const raw = await this.dsa.get<Record<string, unknown>>(
      `/api/indicators/${name.toLowerCase()}?symbol=${encodeURIComponent(symbol)}`,
    );
    return indicatorSchemaV1.parse({ version: 1, symbol, name, provider: 'dsa', ...raw });
  }

  async getChip(input: string): Promise<ChipDistributionV1> {
    const { symbol } = normalizeSymbol(input);
    const raw = await this.dsa.get<Record<string, unknown>>(
      `/api/chip?symbol=${encodeURIComponent(symbol)}`,
    );
    return chipDistributionSchemaV1.parse({ version: 1, symbol, provider: 'dsa', ...raw });
  }
}
