import { Injectable } from '@nestjs/common';
import { marketMinuteOptionsSchema, type MarketMinuteOptions } from '@thesis-ledger/schemas';
import { MarketMinuteDisplayService } from './market-minute-display.service.js';
import { MarketChartReaderV3 } from './market-chart-reader-v3.js';
import type { ResolvedMarketDetailIdentity } from './market-detail.service.js';
import { selectIndicatorParameters } from './market-indicator-request.js';
import { periodAvailabilityReason } from './market-period-availability.js';
import type { MarketIndicatorRequest } from './market-indicator-window.js';

type Availability = Pick<MarketMinuteOptions['options'][number], 'available' | 'reason' | 'window'>;
@Injectable()
export class MarketMinuteOptionsService {
  constructor(
    private readonly minutes: MarketMinuteDisplayService,
    private readonly chart: MarketChartReaderV3,
  ) {}

  async get(
    identity: ResolvedMarketDetailIdentity,
    query: Record<string, string | undefined>,
    indicatorParams?: string,
  ) {
    const evaluationAsOf = new Date().toISOString();
    const scoped = {
      ...query,
      adjustment: 'none',
      assetType: identity.assetType,
      limit: query.limit ?? '90',
    };
    const requests = (['MA', 'MACD', 'RSI'] as const).map((name) => ({
      name,
      parameters: selectIndicatorParameters(name, indicatorParams),
    }));
    const native = await this.chart.options({ ...identity, timeframe: '1m' });
    const route = native.options.find((option) => option.adjustment === 'none');
    const options = [];
    for (const timeframe of ['5m', '15m', '30m', '60m'] as const) {
      const check = async (indicators: MarketIndicatorRequest[]): Promise<Availability> => {
        if (!route?.available)
          return { available: false, reason: route?.reason ?? 'price_unavailable' };
        try {
          return {
            available: true,
            reason: null,
            window: await this.minutes.plan(
              identity.symbol,
              timeframe,
              scoped,
              indicators,
              evaluationAsOf,
            ),
          };
        } catch (error) {
          return { available: false, reason: periodAvailabilityReason(error) };
        }
      };
      const base = await check([]);
      const indicators = [];
      for (const request of requests) indicators.push({ ...request, ...(await check([request])) });
      options.push({
        timeframe,
        kind: 'derived',
        limit: Number(scoped.limit),
        ...base,
        indicators,
      });
    }
    return marketMinuteOptionsSchema.parse({
      version: 'market-minute-options-v1',
      symbol: identity.symbol,
      assetType: identity.assetType,
      adjustment: 'none',
      evaluationAsOf,
      options,
    });
  }
}
