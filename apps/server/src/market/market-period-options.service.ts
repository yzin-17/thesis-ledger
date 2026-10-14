import { BadRequestException, Injectable } from '@nestjs/common';
import type { MarketPeriod } from '@thesis-ledger/domain';
import {
  marketDetailRequestSchema,
  marketPeriodOptionsSchema,
  type MarketPeriodOptions,
} from '@thesis-ledger/schemas';
import { MarketChartReaderV3 } from './market-chart-reader-v3.js';
import { MarketPeriodDisplayService } from './market-period-display.service.js';
import type { ResolvedMarketDetailIdentity } from './market-detail.service.js';
import { selectIndicatorParameters } from './market-indicator-request.js';
import { periodAvailabilityReason } from './market-period-availability.js';
import type { MarketIndicatorRequest } from './market-indicator-window.js';

type Query = Record<string, string | undefined>;
type Availability = Pick<MarketPeriodOptions['options'][number], 'available' | 'reason' | 'window'>;
const timeframes = ['5d', '1w', '1mo', '1y'] as const;
const indicatorNames = ['MA', 'MACD', 'RSI'] as const;

@Injectable()
export class MarketPeriodOptionsService {
  constructor(
    private readonly periods: MarketPeriodDisplayService,
    private readonly chart: MarketChartReaderV3,
  ) {}

  private async check(
    identity: ResolvedMarketDetailIdentity,
    timeframe: MarketPeriod,
    query: Query,
    evaluationAsOf: string,
    requests: MarketIndicatorRequest[],
  ): Promise<Availability> {
    try {
      const window = await this.periods.plan(
        identity.symbol,
        timeframe,
        query,
        requests,
        evaluationAsOf,
      );
      const prices = await this.chart.options(identity, { start: window.start, end: window.end });
      const selected = prices.options.find(
        (item) => item.adjustment === (query.adjustment ?? 'qfq'),
      );
      if (!selected?.available)
        return { available: false, reason: selected?.reason ?? 'price_unavailable', window };
      return { available: true, reason: null, window };
    } catch (error) {
      return { available: false, reason: periodAvailabilityReason(error) };
    }
  }

  async get(identity: ResolvedMarketDetailIdentity, query: Query, indicatorParams?: string) {
    try {
      marketDetailRequestSchema.parse({
        symbol: identity.symbol,
        adjustment: query.adjustment ?? 'qfq',
        start: query.start,
        end: query.end,
        ...(query.limit ? { barsLimit: Number(query.limit) } : {}),
      });
    } catch {
      throw new BadRequestException('周期窗口或价格口径参数无效');
    }
    const requests = indicatorNames.map((name) => ({
      name,
      parameters: selectIndicatorParameters(name, indicatorParams),
    }));
    const evaluationAsOf = new Date().toISOString();
    const supported =
      /\.(SH|SZ|BJ)$/.test(identity.symbol) && ['STOCK', 'ETF'].includes(identity.assetType);
    let globalReason: string | null = 'asset_unsupported';
    if (supported) {
      this.periods.validate(identity.symbol, '1w', { ...query, assetType: identity.assetType });
      const prices = await this.chart.options(identity);
      const selected = prices.options.find(
        (item) => item.adjustment === (query.adjustment ?? 'qfq'),
      );
      globalReason = selected?.available ? null : (selected?.reason ?? 'price_unavailable');
    }
    const options = [];
    for (const timeframe of timeframes) {
      const scoped = {
        ...query,
        assetType: identity.assetType,
        limit: query.limit ?? String(timeframe === '1y' ? 10 : 90),
      };
      const base = globalReason
        ? { available: false, reason: globalReason }
        : await this.check(identity, timeframe, scoped, evaluationAsOf, []);
      const indicators = [];
      for (const request of requests) {
        const capability = base.available
          ? await this.check(identity, timeframe, scoped, evaluationAsOf, [request])
          : { available: false, reason: base.reason };
        indicators.push({ ...request, ...capability });
      }
      options.push({
        timeframe,
        kind: 'derived',
        limit: Number(scoped.limit),
        ...base,
        indicators,
      });
    }
    return marketPeriodOptionsSchema.parse({
      version: 'market-period-options-v1',
      symbol: identity.symbol,
      assetType: identity.assetType,
      adjustment: query.adjustment ?? 'qfq',
      evaluationAsOf,
      options,
    });
  }
}
