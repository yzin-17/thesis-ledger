import { assertBacktestTradabilityBars } from '@thesis-ledger/domain';
import {
  backtestDailyTradabilityEvidenceV3Schema,
  type RunConfigV3,
  type BacktestStrategy,
} from '@thesis-ledger/schemas';
import type { ArtifactRow } from './backtest-artifact-store.js';

/** Runner 从冻结标的状态建立可执行日期分区；缺日不插入 Bar。 */
export const skippedBacktestTradingDatesV3 = (
  strategy: BacktestStrategy,
  config: RunConfigV3,
  rows: ReadonlyMap<string, readonly ArtifactRow[]>,
  runId: string,
): string[] => {
  const instrument = strategy.executionInstrument;
  const facts =
    rows.get(`${runId}/instrumentFacts/${instrument.market}-${instrument.symbol}.parquet`) ?? [];
  const first = facts[0];
  const encoded = first?.historicalTradabilityWindows ?? first?.historicalTradability;
  if (encoded === undefined) return [];
  if (typeof encoded !== 'string') throw new Error('Runner 缺少冻结日级状态');
  const decoded: unknown = JSON.parse(encoded);
  const windows = (Array.isArray(decoded) ? decoded : [decoded]).map((value) =>
    backtestDailyTradabilityEvidenceV3Schema.parse(value),
  );
  const bars = rows.get(`${runId}/execution/bars.parquet`) ?? [];
  return assertBacktestTradabilityBars({
    days: windows.flatMap((window) => window.days),
    barDates: bars.map((bar) => {
      if (typeof bar.occurredAt !== 'string') throw new Error('执行 Bar 缺少日期');
      return bar.occurredAt.slice(0, 10);
    }),
    range: { startDate: config.startDate, endDate: config.endDate },
  });
};
