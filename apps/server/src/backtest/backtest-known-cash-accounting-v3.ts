import type { BacktestCorporateActionFact, TradingCalendar } from '@thesis-ledger/domain';
import type { RunConfigV3 } from '@thesis-ledger/schemas';
import type { RowsByArtifact } from './backtest-v2-execution-shared.js';
import { prepareEventAccountingV3 } from './backtest-event-accounting-v3.js';
import { projectKnownCashResearchAccountingV3 } from './backtest-known-cash-research-v3.js';
import {
  knownCashMetadataKeyV3,
  knownCashRecordsKeyV3,
  readKnownCashSnapshotV3,
} from './backtest-known-cash-snapshot-v3.js';

export function frozenAccountingActionsV3(
  config: RunConfigV3,
  legacy: readonly BacktestCorporateActionFact[],
  rows: RowsByArtifact,
  marketInputs: { calendar: TradingCalendar; bars: readonly { openedAt: string }[] },
) {
  if (config.executionPriceProtocol.accountingBasis === 'normalized-series') return legacy;
  const original = prepareEventAccountingV3(legacy, {
    ...marketInputs,
    startDate: config.startDate,
    endDate: config.endDate,
    dataAsOf: config.dataAsOf,
    ...(config.executionPriceProtocol.cashEventResearch
      ? { cashEventResearch: config.executionPriceProtocol.cashEventResearch }
      : {}),
  });
  const expected = config.knownCashPreparation;
  if (!expected) return original;
  const get = (suffix: string) =>
    [...rows].find(([key]) => key.endsWith(`/${suffix}`) || key === suffix)?.[1] ?? [];
  const frozen = readKnownCashSnapshotV3(
    get(knownCashMetadataKeyV3),
    get(knownCashRecordsKeyV3),
    expected.contentHash,
  );
  const known = projectKnownCashResearchAccountingV3(
    frozen.prepared.input,
    expected.input.contentHash,
    marketInputs,
  );
  return [...original, ...known.actions];
}
