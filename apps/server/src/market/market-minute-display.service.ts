import { BadRequestException, HttpException, Injectable } from '@nestjs/common';
import {
  marketCivilInstant,
  MarketMinuteAggregationError,
  type MarketMinutePeriod,
} from '@thesis-ledger/domain';
import { marketCalculationAnchor } from '@thesis-ledger/schemas';
import { marketChartRequest } from './market-chart-request.js';
import { MarketBarReader } from './market-bar-reader.js';
import { MarketPeriodCalendarReader } from './market-period-calendar-reader.js';
import { MarketPeriodIndicatorReader } from './market-period-indicator-reader.js';
import { minuteWindowBudget, planMinuteWindow } from './market-minute-window.js';
import { buildMinuteView, type MinuteView } from './market-minute-view.js';
import type { MarketIndicatorRequest } from './market-indicator-window.js';

type Query = Record<string, string | undefined>;
function unavailable(reason: string): never {
  throw new HttpException(
    { error: 'market_period_unavailable', message: '分钟派生周期当前不可得', details: { reason } },
    503,
  );
}

@Injectable()
export class MarketMinuteDisplayService {
  constructor(
    private readonly calendars: MarketPeriodCalendarReader,
    private readonly barsReader: MarketBarReader,
    private readonly indicators: MarketPeriodIndicatorReader,
  ) {}

  validate(symbol: string, timeframe: MarketMinutePeriod, query: Query) {
    const input = marketChartRequest(symbol, {
      ...query,
      timeframe: '1m',
      limit: query.limit ?? '90',
    });
    if (input.acceptance !== 'interactive' || input.asOf)
      throw new BadRequestException('分钟展示仅支持interactive，不接受asOf');
    minuteWindowBudget(input.window.limit!, timeframe, []);
    marketCalculationAnchor({
      symbol,
      timeframe,
      calculationAnchor: query.calculationAnchor,
      end: query.end,
    });
    return input;
  }

  private async prepare(
    symbol: string,
    timeframe: MarketMinutePeriod,
    query: Query,
    requests: readonly MarketIndicatorRequest[],
    evaluationAsOf: string,
  ) {
    const input = this.validate(symbol, timeframe, query);
    const count = minuteWindowBudget(input.window.limit!, timeframe, requests);
    const market = input.identity.symbol.endsWith('.HK') ? 'HK' : 'US';
    const timezone = market === 'HK' ? 'Asia/Hong_Kong' : 'America/New_York';
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
        .formatToParts(new Date(evaluationAsOf))
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, part.value]),
    );
    const end = query.end ?? `${parts.year}-${parts.month}-${parts.day}`;
    const initialDays = Math.ceil((((count * Number.parseInt(timeframe, 10)) / 330) * 7) / 5) + 14;
    for (const expansion of [1, 2, 4]) {
      const start = new Date(
        Date.parse(marketCivilInstant(end, 0, timezone)) - initialDays * expansion * 86_400_000,
      )
        .toISOString()
        .slice(0, 10);
      const result = await this.calendars.read({ market, start, end, evaluationAsOf });
      if (result.status !== 'ready') unavailable(result.reason);
      const plan = planMinuteWindow({
        calendar: result.calendar,
        timeframe,
        limit: input.window.limit!,
        requests,
        evaluationAsOf,
        cutoffAt: query.calculationAnchor,
        start: query.start,
      });
      if (plan) return { input, plan };
    }
    return unavailable('calendar_incomplete');
  }

  async plan(
    symbol: string,
    timeframe: MarketMinutePeriod,
    query: Query,
    requests: readonly MarketIndicatorRequest[] = [],
    evaluationAsOf = new Date().toISOString(),
  ) {
    const { plan } = await this.prepare(symbol, timeframe, query, requests, evaluationAsOf);
    return {
      start: plan.start,
      end: plan.end,
      minutePointCount: plan.minutePointCount,
      calendarRevision: plan.calendarRevision,
    };
  }

  async read(
    symbol: string,
    timeframe: MarketMinutePeriod,
    query: Query,
    requests: readonly MarketIndicatorRequest[] = [],
    evaluationNow = () => new Date().toISOString(),
  ) {
    const { input, plan } = await this.prepare(symbol, timeframe, query, requests, evaluationNow());
    let source;
    try {
      source = await this.barsReader.readChartV3({
        ...input,
        window: { start: plan.start, end: query.calculationAnchor ?? plan.end },
      });
    } catch {
      return unavailable('source_unavailable');
    }
    const evaluationAsOf = evaluationNow();
    const final = await this.prepare(symbol, timeframe, query, requests, evaluationAsOf);
    if (
      final.plan.start !== plan.start ||
      final.plan.end !== plan.end ||
      final.plan.calendarRevision !== plan.calendarRevision
    )
      unavailable('window_changed');
    try {
      const view = buildMinuteView(
        source,
        timeframe,
        final.plan,
        evaluationAsOf,
        query.calculationAnchor,
      );
      if (!view.visible.series.points.length) unavailable('source_empty');
      return view;
    } catch (error) {
      return unavailable(
        error instanceof MarketMinuteAggregationError ? error.code : 'source_invalid',
      );
    }
  }

  async bars(symbol: string, timeframe: MarketMinutePeriod, query: Query) {
    return (await this.read(symbol, timeframe, query)).visible.series;
  }
  async calculate(view: MinuteView, requests: readonly MarketIndicatorRequest[], refresh = false) {
    const result = await this.indicators.read(view, requests, refresh);
    if (result.status !== 'ready') unavailable(result.reason);
    return result.response;
  }
  async indicator(
    symbol: string,
    timeframe: MarketMinutePeriod,
    query: Query,
    requests: readonly MarketIndicatorRequest[],
  ) {
    return this.calculate(
      await this.read(symbol, timeframe, query, requests),
      requests,
      query.refresh === '1',
    );
  }
}
