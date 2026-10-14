import { Injectable, Optional } from '@nestjs/common';
import {
  indicatorCalculateResponseSchema,
  marketPeriodIndicatorRequestSchema,
  canonicalBarSeriesEncoding,
  canonicalMarketPeriodIndicatorEncoding,
  type IndicatorCalculateResponse,
} from '@thesis-ledger/schemas';
import { DsaClient, DSA_MARKET_INDICATOR_ENGINE_VERSION } from '../integration/dsa/dsa.client.js';
import { RedisService } from '../platform/redis.service.js';
import { MarketIndicatorCache, indicatorRequestKey } from './market-indicator-cache.js';
import {
  projectIndicatorResponse,
  type MarketIndicatorRequest,
} from './market-indicator-window.js';
import type { buildMarketPeriodView } from './market-period-view.js';
import { compareDecisionClockV3 } from './market-pit-decision-window-calendar-v3.js';
import { ZodError } from 'zod';
import { periodContentFingerprint } from './market-period-source.js';

type View = ReturnType<typeof buildMarketPeriodView>;
type Payload = ReturnType<typeof marketPeriodIndicatorRequestSchema.parse>;

function validatePeriodIndicatorResult(raw: unknown, input: Payload) {
  const response = indicatorCalculateResponseSchema.parse(raw);
  const expected = input.requests.map(indicatorRequestKey).sort();
  const actual = response.results.map(indicatorRequestKey).sort();
  if (
    response.inputFingerprint !== input.inputFingerprint ||
    response.engineVersion !== DSA_MARKET_INDICATOR_ENGINE_VERSION ||
    expected.length !== actual.length ||
    expected.some((key, index) => key !== actual[index]) ||
    response.results.some(
      (result) =>
        result.points.length !== input.points.length ||
        result.points.some(
          (point, index) =>
            compareDecisionClockV3(point.timestamp, input.points[index]!.timestamp) !== 0,
        ),
    )
  )
    throw new Error('周期指标结果与实际计算输入不一致');
  return response;
}

@Injectable()
export class MarketPeriodIndicatorReader {
  private readonly cache: MarketIndicatorCache;
  constructor(
    private readonly dsa: DsaClient,
    @Optional() redis?: RedisService,
  ) {
    this.cache = new MarketIndicatorCache(redis, 128);
  }

  async read(
    view: View,
    requests: readonly MarketIndicatorRequest[],
    refresh = false,
  ): Promise<
    | { status: 'ready'; response: IndicatorCalculateResponse }
    | {
        status: 'unavailable';
        reason: 'indicator_input_empty' | 'indicator_unavailable' | 'indicator_invalid';
      }
  > {
    if (!view.calculation.series.points.length)
      return { status: 'unavailable', reason: 'indicator_input_empty' };
    const input = marketPeriodIndicatorRequestSchema.parse({
      contractVersion: 3,
      identity: view.calculation.series.identity,
      points: view.calculation.series.points,
      periodContext: view.calculation.periodContext,
      inputFingerprint: view.calculation.series.inputFingerprint,
      requests: requests.map((request) => ({
        ...request,
        parameters: Object.fromEntries(
          Object.entries(request.parameters).sort(([a], [b]) => a.localeCompare(b)),
        ),
      })),
    });
    if (
      input.periodContext.pointFingerprint !==
        periodContentFingerprint(canonicalBarSeriesEncoding(input.identity, input.points)) ||
      input.inputFingerprint !==
        periodContentFingerprint(canonicalMarketPeriodIndicatorEncoding(input.periodContext))
    )
      throw new Error('周期指标实际输入指纹不一致');
    const key = `period-v1:${input.inputFingerprint}:${DSA_MARKET_INDICATOR_ENGINE_VERSION}:${input.requests.map(indicatorRequestKey).sort().join('|')}`;
    let response: IndicatorCalculateResponse | undefined;
    if (!refresh) {
      const cached = await this.cache.get(key);
      if (cached) {
        try {
          response = validatePeriodIndicatorResult(cached, input);
        } catch {
          /* 无效缓存不冒充计算结果，重新交给 DSA。 */
        }
      }
    }
    if (!response) {
      let raw;
      try {
        raw = await this.dsa.calculatePeriodIndicators(input);
      } catch (error) {
        return {
          status: 'unavailable',
          reason: error instanceof ZodError ? 'indicator_invalid' : 'indicator_unavailable',
        };
      }
      try {
        response = validatePeriodIndicatorResult(raw, input);
      } catch {
        return { status: 'unavailable', reason: 'indicator_invalid' };
      }
      await this.cache.set(key, response, Date.now() + 60_000);
    }
    return {
      status: 'ready',
      response: projectIndicatorResponse(response, view.calculation.series, view.visible.series),
    };
  }
}
