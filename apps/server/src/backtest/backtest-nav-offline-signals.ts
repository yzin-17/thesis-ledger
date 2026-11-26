import { navLocalDate, sourceSeriesKey, type BacktestSeries, finishBacktestComputation, mapBacktestComputationItems } from '@thesis-ledger/domain';
import type { BacktestStrategy } from '@thesis-ledger/schemas';
import { compareNavOfflineTime, type NavOfflineInputs } from './backtest-nav-offline-events.js';
import { indicatorSeriesForSteps } from './backtest-v2-execution-shared.js';

export const navOfflineHoldingPeriods = (
  input: NavOfflineInputs,
  openedAt: string | undefined,
  date: string,
) => {
  const openedDate = openedAt && navLocalDate(openedAt, input.config.calendar.timezone);
  if (!openedDate) return 0;
  return input.plan.expectedValuationDates.filter((day) => day >= openedDate && day <= date).length;
};

/** 先按微秒过滤可见事实，再交给指标与表达式内核，避免毫秒截断泄露未来净值。 */
export function* navOfflineSignalInputsSteps(
  input: NavOfflineInputs,
  strategy: BacktestStrategy,
  at: string,
) {
  const points = yield* mapBacktestComputationItems(input.facts, (fact) => {
      const point = input.pricingFactAt(fact.valuationDate, at);
      return point?.nav
        ? [
            {
              occurredAt: point.occurredAt,
              availableAt: point.availableAt,
              value: point.nav,
              status: 'available' as const,
            },
          ]
        : [];
    });
  const visible = points.flat()
    .sort((a, b) => compareNavOfflineTime(a.occurredAt, b.occurredAt));
  const sourceSeries = new Map<string, BacktestSeries>();
  for (const source of strategy.signalSources) {
    sourceSeries.set(sourceSeriesKey(source.id, 'nav'), {
      sourceId: source.id,
      symbol: source.asset.symbol,
      market: 'CN',
      assetType: 'fund',
      field: 'nav',
      timeframe: '1d',
      adjusted: false,
      points: visible,
    });
  }
  const indicatorSeries = new Map<string, BacktestSeries>();
  yield* indicatorSeriesForSteps(strategy.entry, sourceSeries, indicatorSeries);
  yield* indicatorSeriesForSteps(strategy.exit, sourceSeries, indicatorSeries);
  return { latest: visible.at(-1), sourceSeries, indicatorSeries };
}

export const navOfflineSignalInputs = (...input: Parameters<typeof navOfflineSignalInputsSteps>) => finishBacktestComputation(navOfflineSignalInputsSteps(...input));
