import {
  compareMarketPitEvidenceInstantStringsV1,
  marketCoverageProofV3Schema,
  type RunConfigV3,
} from '@thesis-ledger/schemas';
import { tradingCalendarFromFact } from '@thesis-ledger/domain';
import type { ArtifactRow } from './backtest-artifact-store.js';
import type { SnapshotInputPlanV3 } from './backtest-snapshot-v3-input-plan.js';
import { SnapshotV3InputPlanError } from './backtest-snapshot-v3-input-plan.js';
import { calendarFact } from './backtest-v2-execution-shared.js';
import { dailyBarSessionTimes } from './backtest-daily-bar-session.js';
import { canonicalizeManifest } from './backtest-snapshot.js';
import { tradabilityExpectedBarDatesV3 } from './backtest-snapshot-v3-tradability.js';
import {
  assertSettlementCalendarCoverage,
  settlementCalendarRequirement,
} from './backtest-settlement-calendar.js';

function fail(message: string): never {
  throw new SnapshotV3InputPlanError(message);
}

/** The execution calendar and price coverage proof must describe the same sessions. */
export const validateSnapshotCalendarAlignmentV3 = (
  input: SnapshotInputPlanV3,
  artifacts: ReadonlyMap<string, readonly ArtifactRow[]>,
  settlementConfig?: RunConfigV3,
): void => {
  const rows = artifacts.get(`calendar/${input.executionRouteKey.market}.parquet`);
  if (rows?.length !== 1 || !rows[0]) fail('V3 完整快照需要唯一冻结执行日历');
  const calendar = tradingCalendarFromFact(calendarFact(rows[0]));
  const evidence = artifacts.get('metadata/market-window-evidence-v3.parquet')?.[0];
  if (typeof evidence?.coverageProof !== 'string') fail('V3 完整快照缺少行情覆盖证明');
  const proof = marketCoverageProofV3Schema.parse(JSON.parse(evidence.coverageProof) as unknown);
  const expectedDates: string[] = [];
  const cursor = new Date(`${input.plan.warmup.startDate}T12:00:00.000Z`);
  const last = new Date(`${input.plan.runWindow.endDate}T12:00:00.000Z`);
  for (; cursor <= last; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const status = calendar.status(cursor);
    if (status.open && status.date >= proof.listing.firstTradingDate)
      expectedDates.push(status.date);
  }
  const bars = artifacts.get('execution/bars.parquet');
  if (!bars?.length) fail('V3 完整快照缺少执行行情');
  const dates = bars.map((bar) => {
    if (typeof bar.occurredAt !== 'string') fail('V3 行情缺少发生时间');
    dailyBarSessionTimes(bar, calendar);
    return calendar.status(bar.occurredAt).date;
  });
  const instrumentFacts = artifacts.get(`instrumentFacts/${input.executionRouteKey.market}-${proof.listing.symbol}.parquet`) ?? [];
  if (canonicalizeManifest(dates) !== canonicalizeManifest(tradabilityExpectedBarDatesV3(instrumentFacts, expectedDates))) {
    fail('V3 冻结日历与行情覆盖证明的交易日不一致');
  }
  const preceding = dates.filter((date) => date < input.plan.runWindow.startDate);
  if (preceding.length < input.plan.warmup.lookbackPeriods) {
    fail('V3 冻结行情不足以满足策略预热周期');
  }
  const executionDates = dates.filter((date) => date >= input.plan.runWindow.startDate);
  if (executionDates.length === 0) fail('V3 运行区间内没有交易日');
  if (settlementConfig)
    assertSettlementCalendarCoverage(
      calendar,
      executionDates.at(-1)!,
      settlementCalendarRequirement(settlementConfig),
    );
  const firstBar = bars[dates.indexOf(executionDates[0]!)];
  if (!firstBar) fail('V3 运行区间缺少首个交易日');
  const openedAt = dailyBarSessionTimes(firstBar, calendar).openedAt;
  const facts = [...artifacts.entries()]
    .filter(([key]) => key.startsWith('instrumentFacts/'))
    .flatMap(([, value]) => value);
  if (
    !openedAt ||
    !facts.some((fact) => {
      if (typeof fact.occurredAt !== 'string') return false;
      const order = compareMarketPitEvidenceInstantStringsV1(fact.occurredAt, openedAt);
      return order === -1 || order === 0;
    })
  ) {
    fail('V3 完整快照缺少期初适用的标的历史事实');
  }
};
