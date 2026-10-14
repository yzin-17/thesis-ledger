import { Injectable, Optional } from '@nestjs/common';
import type { BarSeriesIdentity } from '@thesis-ledger/schemas';
import type { BarSeries } from '@thesis-ledger/schemas';
import { MarketBarReader } from './market-bar-reader.js';
import { MarketPeriodCalendarReader } from './market-period-calendar-reader.js';
import type { MarketPeriodCalendarResult } from './market-period-calendar-projection.js';
import { buildMarketPeriodView } from './market-period-view.js';
import { planMarketPeriodWindow, type MarketPeriodWindowInput } from './market-period-window.js';
import { compareDecisionClockV3 } from './market-pit-decision-window-calendar-v3.js';
import { MarketPeriodViewCache } from './market-period-view-cache.js';

export type MarketPeriodReadInput = Omit<MarketPeriodWindowInput, 'calendar' | 'evaluationAsOf'> & {
  identity: Omit<BarSeriesIdentity, 'timeframe'>;
  calendarRange: { start: string; end: string };
  refresh?: boolean;
};
type CalendarFailure = Extract<MarketPeriodCalendarResult, { status: 'unavailable' }>;
export type MarketPeriodReadResult =
  | { status: 'ready'; view: ReturnType<typeof buildMarketPeriodView> }
  | CalendarFailure
  | {
      status: 'unavailable';
      reason: 'source_unavailable' | 'source_invalid' | 'source_empty' | 'window_changed';
    };

/** 来源获取后固定时刻；窗口变化只允许一次有界重取。 */
@Injectable()
export class MarketPeriodReader {
  constructor(
    private readonly calendars: MarketPeriodCalendarReader,
    private readonly bars: MarketBarReader,
    @Optional() private readonly views?: MarketPeriodViewCache,
  ) {}

  private calendar(input: MarketPeriodReadInput, evaluationAsOf: string) {
    return this.calendars.read({ market: 'CN', ...input.calendarRange, evaluationAsOf });
  }

  private async assemble(
    source: BarSeries,
    input: MarketPeriodReadInput,
    window: MarketPeriodWindowInput,
  ): Promise<MarketPeriodReadResult> {
    const plan = planMarketPeriodWindow(window);
    try {
      if (
        source.identity.symbol !== input.identity.symbol ||
        source.identity.assetType !== input.identity.assetType ||
        source.identity.adjustment !== input.identity.adjustment ||
        source.chartContextV3?.requestedStart !== plan.baseStart ||
        source.chartContextV3?.requestedEnd !== plan.baseEnd
      )
        return { status: 'unavailable', reason: 'source_invalid' };
      const view = this.views
        ? (await this.views.resolve(source, window, input.refresh)).view
        : buildMarketPeriodView(source, window);
      if (!view.visible.series.points.length)
        return { status: 'unavailable', reason: 'source_empty' };
      return { status: 'ready', view };
    } catch {
      return { status: 'unavailable', reason: 'source_invalid' };
    }
  }

  async read(
    input: MarketPeriodReadInput,
    evaluationNow: () => string = () => new Date().toISOString(),
  ): Promise<MarketPeriodReadResult> {
    if (
      !/\.(SH|SZ|BJ)$/.test(input.identity.symbol) ||
      (input.identity.assetType !== 'STOCK' && input.identity.assetType !== 'ETF')
    )
      return { status: 'unavailable', reason: 'source_invalid' };
    let evaluationAsOf = evaluationNow();
    let result = await this.calendar(input, evaluationAsOf);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (result.status !== 'ready') return result;
      const window = { ...input, calendar: result.calendar, evaluationAsOf };
      const plan = planMarketPeriodWindow(window);
      if (!plan.baseStart || !plan.baseEnd)
        return { status: 'unavailable', reason: 'source_empty' };
      let source;
      try {
        source = await this.bars.readChartV3({
          identity: { ...input.identity, timeframe: '1d' },
          acceptance: 'interactive',
          window: { start: plan.baseStart, end: plan.baseEnd, limit: 3650 },
          ...(input.refresh !== undefined ? { refresh: input.refresh } : {}),
        });
      } catch {
        return { status: 'unavailable', reason: 'source_unavailable' };
      }
      const finalAsOf = evaluationNow();
      if (compareDecisionClockV3(finalAsOf, evaluationAsOf) < 0)
        return { status: 'unavailable', reason: 'source_invalid' };
      evaluationAsOf = finalAsOf;
      result = await this.calendar(input, evaluationAsOf);
      if (result.status !== 'ready') return result;
      const finalWindow = { ...input, calendar: result.calendar, evaluationAsOf };
      const finalPlan = planMarketPeriodWindow(finalWindow);
      if (plan.baseStart !== finalPlan.baseStart || plan.baseEnd !== finalPlan.baseEnd) continue;
      return this.assemble(source, input, finalWindow);
    }
    return { status: 'unavailable', reason: 'window_changed' };
  }
}
