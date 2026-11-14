import { Injectable, Optional } from '@nestjs/common';
import { indicatorCalculateResponseSchema, type BarSeries } from '@thesis-ledger/schemas';
import { DSA_MARKET_INDICATOR_ENGINE_VERSION, DsaClient } from '../integration/dsa/dsa.client.js';
import { RedisService } from '../platform/redis.service.js';
import { MarketIndicatorCache, indicatorRequestKey } from './market-indicator-cache.js';

@Injectable()
export class MarketNativeIndicatorReader {
  private readonly cache: MarketIndicatorCache;
  constructor(private readonly dsa: DsaClient, @Optional() redis?: RedisService) { this.cache = new MarketIndicatorCache(redis); }
  async calculate(series: BarSeries, requests: Array<{ name: 'MA' | 'MACD' | 'RSI'; parameters: Record<string, number> }>) {
    const normalized = requests.map((r) => ({ name: r.name,
      parameters: Object.fromEntries(Object.entries(r.parameters).sort(([a], [b]) => a.localeCompare(b))),
    }));
    const key = `${series.inputFingerprint}:${DSA_MARKET_INDICATOR_ENGINE_VERSION}:${JSON.stringify(normalized)}`;
    const cached = await this.cache.get(key);
    if (cached) return cached;
    const response = indicatorCalculateResponseSchema.parse(await this.dsa.calculateIndicators({
      identity: series.identity, inputFingerprint: series.inputFingerprint, points: series.points, requests: normalized,
    }));
    const expected = normalized.map(indicatorRequestKey).sort(), actual = response.results.map(indicatorRequestKey).sort();
    if (response.inputFingerprint !== series.inputFingerprint || response.results.some((r) => r.inputFingerprint !== response.inputFingerprint) ||
      expected.length !== actual.length || expected.some((keyValue, index) => keyValue !== actual[index]) ||
      response.engineVersion !== DSA_MARKET_INDICATOR_ENGINE_VERSION) throw new Error('指标结果与实际输入或计算版本不一致');
    await this.cache.set(key, response, new Date(series.provenance.freshUntil).getTime());
    return response;
  }
}
