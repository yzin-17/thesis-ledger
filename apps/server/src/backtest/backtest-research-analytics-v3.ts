import { DecimalValue as D, convertSimulationMoneyAt, researchAnalyticsV2Steps, finishBacktestComputation,
  type BacktestMetric, type BacktestCurrency, type BacktestAnalyticsResult } from '@thesis-ledger/domain';
import type { RunConfigV3, SimulationFill } from '@thesis-ledger/schemas';
import { fxRatesFrom, type RowsByArtifact } from './backtest-v2-execution-shared.js';

export function* researchAnalyticsV3Steps(
  analytics: BacktestAnalyticsResult, fills: readonly SimulationFill[], config: RunConfigV3,
  currency: BacktestCurrency, rows: RowsByArtifact,
) {
  const rates = fxRatesFrom(rows);
  let capital: BacktestMetric = { status: 'available', value: '0' };
  for (const [from, amount] of Object.entries(config.initialCash)) {
    if (amount === undefined) continue;
    const converted = convertSimulationMoneyAt(amount, from as BacktestCurrency,
      config.baseCurrency, rates, `${config.startDate}T00:00:00.000Z`);
    if (converted.status !== 'available') { capital = converted; break; }
    capital = { status: 'available', value: D.from(capital.value!).plus(converted.value).toString() };
  }
  return yield* researchAnalyticsV2Steps(analytics, fills, capital, (amount, fill) =>
    convertSimulationMoneyAt(amount, currency, config.baseCurrency, rates, fill.occurredAt!),
  );
}

export const buildResearchAnalyticsV3 = (...input: Parameters<typeof researchAnalyticsV3Steps>) => finishBacktestComputation(researchAnalyticsV3Steps(...input));
