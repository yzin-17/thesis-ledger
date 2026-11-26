import { DecimalValue as D } from './decimal.js';
import { availabilityForDecision, isAvailableForDecisionAt } from './backtest-observation-clock.js';
import type { BacktestSeries, BacktestSeriesPoint } from './backtest-series.js';
import type { BacktestTradePlan } from './backtest-trade-plan-contract.js';
import { readTradePlanCalendar, type TradePlanCalendar } from './backtest-trade-plan-calendar.js';
import type { TradingCalendar } from './trading-calendar.js';

type Config = NonNullable<BacktestTradePlan['volatilityTarget']>;
export type TradePlanVolatilityResult =
  | { status: 'available'; annualVolatility: string; targetWeight: string; inputFacts: string[] }
  | { status: 'unavailable'; reason: string };

/** 使用冻结的完整日线，坏样本保留在窗口内，不向前跳过补齐。 */
export class BacktestTradeVolatility {
  private readonly points: BacktestSeriesPoint[];
  constructor(
    private readonly config: Config,
    private readonly prices: BacktestSeries,
    private readonly source: TradePlanCalendar | undefined,
  ) {
    this.points = [...prices.points].sort(
      (a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt),
    );
  }
  at(at: string): TradePlanVolatilityResult {
    if (this.prices.timeframe !== '1d' || this.prices.field !== 'close')
      return this.unavailable('DAILY_CLOSE_REQUIRED');
    const visible = readTradePlanCalendar(this.source, at);
    if (visible.status === 'unavailable') return this.unavailable('CALENDAR_' + visible.reason);
    const points = this.points
      .filter((point) => Date.parse(point.occurredAt) <= Date.parse(at))
      .slice(-(this.config.returnPeriods + 1));
    if (points.length !== this.config.returnPeriods + 1) return this.unavailable('WINDOW_UNFILLED');
    const current = points.at(-1)!;
    if (
      visible.calendar.status(current.occurredAt).date !== visible.calendar.status(at).date ||
      Date.parse(availabilityForDecision(current) ?? '') !== Date.parse(at)
    )
      return this.unavailable('CURRENT_CLOSE_MISSING');
    if (
      points.some(
        (point) =>
          point.status === 'unavailable' || !point.value || !isAvailableForDecisionAt(point, at),
      )
    )
      return this.unavailable('SAMPLE_UNAVAILABLE');
    const dates = points.map((point) => visible.calendar.status(point.occurredAt));
    if (dates.some((day) => !day.open)) return this.unavailable('CALENDAR_COVERAGE');
    if (new Set(dates.map((day) => day.date)).size !== points.length)
      return this.unavailable('DUPLICATE_DATE');
    if (
      !this.completeDates(
        dates.map((day) => day.date),
        visible.calendar,
      )
    )
      return this.unavailable('MISSING_TRADING_DATE');
    return this.calculate(points, at);
  }
  private completeDates(dates: string[], calendar: TradingCalendar): boolean {
    const expected = new Set(dates);
    const cursor = new Date(dates[0] + 'T12:00:00Z');
    for (let inspected = 0; inspected < 5000; inspected++) {
      const date = cursor.toISOString().slice(0, 10);
      if (date > dates.at(-1)!) return true;
      const day = calendar.status(cursor);
      if (day.date !== date || day.reason === 'calendar-unavailable') return false;
      if (day.open && !expected.has(date)) return false;
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return false;
  }
  private calculate(points: BacktestSeriesPoint[], at: string): TradePlanVolatilityResult {
    try {
      const closes = points.map((point) => D.from(point.value!));
      if (closes.some((close) => !close.isPositive()))
        return this.unavailable('PRICE_NON_POSITIVE');
      const returns = closes
        .slice(1)
        .map((close, n) => Number(close.dividedBy(closes[n]!, 40).minus('1').toString()));
      const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
      const variance =
        returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1);
      const annual = Math.sqrt(variance * this.config.annualizationPeriods);
      if (!Number.isFinite(annual) || annual <= 0)
        return this.unavailable('VOLATILITY_NON_POSITIVE');
      const annualDecimal = D.fromNumber(annual);
      const fraction = D.from(this.config.targetAnnualVolatility).dividedBy(annualDecimal, 40);
      const cap = D.from(this.config.maxEquityFraction);
      const weight = fraction.compareTo(cap) > 0 ? cap : fraction;
      return {
        status: 'available',
        annualVolatility: annualDecimal.toString(),
        targetWeight: weight.toString(),
        inputFacts: [
          'volatility.returnPeriods=' + this.config.returnPeriods,
          'volatility.variance=sample',
          'volatility.annualizationPeriods=252',
          'volatility.annual=' + annual,
          'volatility.targetWeight=' + weight.toString(),
          'volatility.windowStart=' + points[0]!.occurredAt,
          'volatility.windowEnd=' + at,
        ],
      };
    } catch {
      return this.unavailable('SAMPLE_INVALID');
    }
  }
  private unavailable(reason: string): TradePlanVolatilityResult {
    return { status: 'unavailable', reason: 'TRADE_PLAN_VOLATILITY_' + reason };
  }
}
