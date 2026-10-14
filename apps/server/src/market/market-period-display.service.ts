import { BadRequestException, HttpException, Injectable } from '@nestjs/common';
import type { MarketPeriod } from '@thesis-ledger/domain';
import { inferAssetType } from '../ledger/asset-type.js';
import { marketChartRequest } from './market-chart-request.js';
import { MarketPeriodCalendarReader } from './market-period-calendar-reader.js';
import { MarketPeriodReader, type MarketPeriodReadInput } from './market-period-reader.js';
import { MarketPeriodIndicatorReader } from './market-period-indicator-reader.js';
import { planPublicPeriodCalendar } from './market-period-public-window.js';
import { MarketPeriodWindowError, planMarketPeriodWindow } from './market-period-window.js';
import type { MarketIndicatorRequest } from './market-indicator-window.js';

type Query = Record<string, string | undefined>;
function unavailable(timeframe: MarketPeriod, reason: string): never {
  throw new HttpException(
    {
      error: 'market_period_unavailable',
      message: '派生行情周期当前不可得',
      details: { requestedTimeframe: timeframe, reason },
    },
    503,
  );
}
function windowFailure(timeframe: MarketPeriod, error: unknown): never {
  if (!(error instanceof MarketPeriodWindowError)) throw error;
  if (error.code === 'calendar_incomplete') unavailable(timeframe, error.code);
  throw new BadRequestException({
    error: 'market_period_window_invalid',
    message: error.message,
    details: { requestedTimeframe: timeframe, reason: error.code },
  });
}

@Injectable()
export class MarketPeriodDisplayService {
  constructor(
    private readonly calendars: MarketPeriodCalendarReader,
    private readonly reader: MarketPeriodReader,
    private readonly indicators: MarketPeriodIndicatorReader,
  ) {}

  private request(symbol: string, timeframe: MarketPeriod, query: Query) {
    const normalized = symbol.trim().toUpperCase();
    const assetType =
      query.assetType?.trim().toUpperCase() ?? inferAssetType(normalized)?.toUpperCase();
    if (!/\.(SH|SZ|BJ)$/.test(normalized) || (assetType !== 'STOCK' && assetType !== 'ETF'))
      throw new HttpException(
        {
          error: 'market_period_asset_unsupported',
          message: '当前资产或市场不支持派生行情周期',
          details: { requestedTimeframe: timeframe, assetType: assetType ?? 'UNKNOWN' },
        },
        422,
      );
    const input = marketChartRequest(normalized, {
      ...query,
      assetType,
      timeframe: '1d',
      limit: query.limit ?? String(timeframe === '1y' ? 10 : 90),
    });
    if (input.acceptance !== 'interactive' || input.asOf)
      throw new BadRequestException('图表只支持 interactive 验收，不接受 asOf');
    return input;
  }

  validate(symbol: string, timeframe: MarketPeriod, query: Query) {
    this.request(symbol, timeframe, query);
  }

  private async prepare(
    input: ReturnType<typeof marketChartRequest>,
    timeframe: MarketPeriod,
    requests: readonly MarketIndicatorRequest[],
    evaluationAsOf: string,
  ) {
    const window = { ...input.window, limit: input.window.limit!, timeframe, indicators: requests };
    for (const expansion of [1, 2, 4, 8]) {
      const planned = planPublicPeriodCalendar(window, evaluationAsOf, expansion);
      const result = await this.calendars.read({
        market: 'CN',
        ...planned.calendarRange,
        evaluationAsOf,
      });
      if (result.status !== 'ready') unavailable(timeframe, result.reason);
      const anchorTradingDate =
        timeframe === '5d'
          ? result.calendar.sessions
              .map((session) => session.tradingDate)
              .filter((date) => date <= planned.end)
              .sort()
              .at(-1)
          : undefined;
      if (timeframe === '5d' && !anchorTradingDate) unavailable(timeframe, 'source_empty');
      const complete = {
        ...window,
        end: planned.end,
        calendar: result.calendar,
        evaluationAsOf,
        ...(anchorTradingDate ? { anchorTradingDate } : {}),
      };
      let plan;
      try {
        plan = planMarketPeriodWindow(complete);
      } catch (error) {
        if (
          timeframe === '5d' &&
          error instanceof MarketPeriodWindowError &&
          error.code === 'calendar_incomplete'
        )
          continue;
        throw error;
      }
      if (!plan.visible.length) unavailable(timeframe, 'source_empty');
      // 探测范围不足不是来源历史不足；先扩大，禁止漏取预热后进入计算。
      if (
        plan.availableWarmup < plan.warmup ||
        (!window.start && plan.visible.length < window.limit)
      )
        continue;
      const readInput: MarketPeriodReadInput = {
        ...window,
        end: planned.end,
        identity: input.identity,
        calendarRange: planned.calendarRange,
        refresh: input.refresh,
        ...(anchorTradingDate ? { anchorTradingDate } : {}),
      };
      return { readInput, plan, calendarRevision: result.calendar.revision };
    }
    return unavailable(timeframe, 'calendar_incomplete');
  }

  async plan(
    symbol: string,
    timeframe: MarketPeriod,
    query: Query,
    requests: readonly MarketIndicatorRequest[] = [],
    evaluationAsOf = new Date().toISOString(),
  ) {
    try {
      const prepared = await this.prepare(
        this.request(symbol, timeframe, query),
        timeframe,
        requests,
        evaluationAsOf,
      );
      if (!prepared.plan.baseStart || !prepared.plan.baseEnd)
        unavailable(timeframe, 'source_empty');
      return {
        start: prepared.plan.baseStart,
        end: prepared.plan.baseEnd,
        dailyPointCount: prepared.plan.dailyPointCount,
        calendarRevision: prepared.calendarRevision,
      };
    } catch (error) {
      return windowFailure(timeframe, error);
    }
  }

  async read(
    symbol: string,
    timeframe: MarketPeriod,
    query: Query,
    requests: readonly MarketIndicatorRequest[] = [],
    evaluationNow: () => string = () => new Date().toISOString(),
  ) {
    const input = this.request(symbol, timeframe, query);
    try {
      const prepared = await this.prepare(input, timeframe, requests, evaluationNow());
      const result = await this.reader.read(prepared.readInput, evaluationNow);
      if (result.status !== 'ready') unavailable(timeframe, result.reason);
      return result.view;
    } catch (error) {
      return windowFailure(timeframe, error);
    }
  }

  async bars(symbol: string, timeframe: MarketPeriod, query: Query) {
    return (await this.read(symbol, timeframe, query)).visible.series;
  }

  async indicator(
    symbol: string,
    timeframe: MarketPeriod,
    query: Query,
    requests: readonly MarketIndicatorRequest[],
  ) {
    const view = await this.read(symbol, timeframe, query, requests);
    return this.calculate(view, requests, query.refresh === '1');
  }

  async calculate(
    view: Awaited<ReturnType<MarketPeriodDisplayService['read']>>,
    requests: readonly MarketIndicatorRequest[],
    refresh = false,
  ) {
    const result = await this.indicators.read(view, requests, refresh);
    if (result.status !== 'ready')
      unavailable(view.visible.series.identity.timeframe, result.reason);
    return result.response;
  }
}
