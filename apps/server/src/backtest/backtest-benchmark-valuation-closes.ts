import { DecimalValue, availabilityForDecision, type TradingCalendar } from '@thesis-ledger/domain';
import { compareMarketPitEvidenceInstantStringsV1, type RunConfigV3 } from '@thesis-ledger/schemas';
import type { ArtifactRow } from './backtest-artifact-store.js';
import { barResearchClocksV3 } from './backtest-v3-research-clock.js';
import { intradayBarSessionWindow } from './backtest-intraday-bar-session.js';
import { dailyBarSessionIntervals } from './backtest-daily-bar-session.js';

interface ValuationClose {
  occurredAt: string;
  availableAt: string;
  decisionAt: string;
  close: string;
  tradingDate: string;
}

/** 分钟收盘只有真实全天末会话结束点才能用于日估值基准，不沿用盘中旧值。 */
export const valuationCloses = (
  rows: readonly ArtifactRow[],
  calendar: TradingCalendar,
  runConfig: RunConfigV3,
  warnings: Set<string>,
): ValuationClose[] => {
  const points: ValuationClose[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (
      typeof row.occurredAt !== 'string' ||
      typeof row.availableAt !== 'string' ||
      typeof row.close !== 'string' ||
      !['1d', '1m'].includes(String(row.timeframe))
    ) {
      continue;
    }
    let tradingDate: string;
    let occurredAt = row.occurredAt;
    try {
      if (row.timeframe === '1m') occurredAt = intradayBarSessionWindow(row, calendar).closedAt;
      tradingDate = calendar.status(occurredAt).date;
      if (
        row.timeframe === '1m' &&
        Date.parse(occurredAt) !== dailyBarSessionIntervals(tradingDate, calendar).at(-1)?.closedAt
      )
        continue;
    } catch {
      warnings.add('BENCHMARK_INVALID_OBSERVATION_TIME');
      continue;
    }
    if (tradingDate < runConfig.startDate || tradingDate > runConfig.endDate) continue;
    if (
      row.quality !== 'complete' ||
      row.completionStatus !== 'complete' ||
      row.suspended === true
    ) {
      warnings.add('BENCHMARK_INCOMPLETE_VALUATION_CLOSE');
      continue;
    }
    const closeIdentity = tradingDate;
    if (seen.has(closeIdentity)) {
      warnings.add('BENCHMARK_DUPLICATE_VALUATION_CLOSE');
      continue;
    }
    seen.add(closeIdentity);
    try {
      const close = DecimalValue.from(row.close);
      if (!close.isPositive()) {
        warnings.add('BENCHMARK_INVALID_VALUATION_PRICE');
        continue;
      }
      const clocks = barResearchClocksV3(row, calendar, runConfig);
      const decisionAt = availabilityForDecision({
        availableAt: row.availableAt,
        ...(clocks.researchClock ? { researchClock: clocks.researchClock } : {}),
      });
      if (
        !decisionAt ||
        compareMarketPitEvidenceInstantStringsV1(decisionAt, decisionAt) === undefined
      ) {
        warnings.add('BENCHMARK_FUTURE_OBSERVATION');
        continue;
      }
      points.push({
        occurredAt,
        availableAt: row.availableAt,
        decisionAt,
        close: close.toString(),
        tradingDate,
      });
    } catch {
      warnings.add('BENCHMARK_FUTURE_OBSERVATION');
    }
  }
  return points.sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt));
};
