import {
  bindMarketPitReconstructionManifestV3,
  type HistoricalDecisionWindowV3,
} from '@thesis-ledger/schemas';
import type {
  MarketPitArchiveContentResultV3,
  MarketPitReconstructionInputV3,
} from './market-pit-reconstruction-content-v3.js';
import type { MarketPitSourceTimesResultV3 } from './market-pit-reconstruction-source-times-v3.js';
import {
  compareDecisionClockV3,
  indexMarketPitDecisionCalendarsV3,
  marketPitShanghaiTradingDateV3,
  type MarketPitVerifiedCalendarV3,
} from './market-pit-decision-window-calendar-v3.js';

import {
  assertMarketPitDecisionEvidenceCutoffV3,
  assertMarketPitDecisionSourceBindingV3,
  assertMarketPitDecisionSourceClocksV3,
  indexMarketPitDecisionArchivesV3,
} from './market-pit-decision-window-source-v3.js';

type Binding = HistoricalDecisionWindowV3['barDecisionBindings'][number];
export type MarketPitDecisionWindowInputV3 = {
  input: MarketPitReconstructionInputV3;
  content: Extract<MarketPitArchiveContentResultV3, { status: 'archives-bound' }>;
  sourceTimes: Extract<MarketPitSourceTimesResultV3, { status: 'source-times-bound' }>;
  calendars: readonly MarketPitVerifiedCalendarV3[];
};
export type MarketPitDecisionWindowFailureV3 =
  | 'historical-evidence-missing'
  | 'input-mismatch'
  | 'archive-binding-mismatch'
  | 'source-time-binding-mismatch'
  | 'calendar-binding-mismatch'
  | 'calendar-scope-mismatch'
  | 'calendar-model-unsupported'
  | 'calendar-range-incomplete'
  | 'calendar-session-invalid'
  | 'missing-successor'
  | 'bar-incomplete'
  | 'decision-binding-mismatch'
  | 'outside-decision-window'
  | 'historical-source-late'
  | 'historical-revision-unavailable'
  | 'calendar-horizon-unavailable'
  | 'evidence-future'
  | 'clock-invalid';
export type MarketPitDecisionWindowResultV3 =
  | { status: 'decision-windows-bound'; barDecisionBindings: Binding[] }
  | { status: 'unavailable'; reason: MarketPitDecisionWindowFailureV3 };

const failureReasons = new Set<MarketPitDecisionWindowFailureV3>([
  'historical-evidence-missing',
  'input-mismatch',
  'archive-binding-mismatch',
  'source-time-binding-mismatch',
  'calendar-binding-mismatch',
  'calendar-scope-mismatch',
  'calendar-model-unsupported',
  'calendar-range-incomplete',
  'calendar-session-invalid',
  'missing-successor',
  'bar-incomplete',
  'decision-binding-mismatch',
  'outside-decision-window',
  'historical-source-late',
  'historical-revision-unavailable',
  'calendar-horizon-unavailable',
  'evidence-future',
  'clock-invalid',
]);

function fail(reason: MarketPitDecisionWindowFailureV3): never {
  throw new Error(reason);
}

function assertManifestBindings(
  evidence: HistoricalDecisionWindowV3,
  references: MarketPitDecisionWindowInputV3['content']['proof']['barArchives'],
): void {
  if (evidence.barDecisionBindings.length !== references.length) fail('input-mismatch');
  const ids = [
    ...evidence.calendars,
    ...evidence.originalEvidence,
    ...evidence.calendarArtifacts,
    ...evidence.sourceWitnesses,
  ].map((item) => item.id);
  if (new Set(ids).size !== ids.length) fail('archive-binding-mismatch');
  for (const [index, claim] of evidence.barDecisionBindings.entries()) {
    const reference = references[index]!;
    if (
      claim.timestamp !== reference.timestamp ||
      claim.windowIdentityFingerprint !== reference.windowIdentityFingerprint ||
      claim.completeResponseHash !== reference.completeResponseHash
    )
      fail('archive-binding-mismatch');
  }
}

function bindWindows(args: MarketPitDecisionWindowInputV3): Binding[] {
  const { input, content, sourceTimes } = args;
  if (content.proof.contractVersion !== 2) fail('historical-evidence-missing');
  const bound = bindMarketPitReconstructionManifestV3({ ...input, proof: content.proof });
  if (bound.status !== 'bound') fail('input-mismatch');
  if (input.request.routeKey.market !== 'CN' || input.request.routeKey.timeframe !== '1d')
    fail('calendar-model-unsupported');
  if (compareDecisionClockV3(input.response.sourcePriceBasis.observedAt, input.dataAsOf) > 0)
    fail('evidence-future');
  const evidence = content.proof.historicalDecisionWindow;
  assertManifestBindings(evidence, content.proof.barArchives);
  const bars = input.response.bars;
  if (sourceTimes.bindings.length !== bars.length) fail('source-time-binding-mismatch');
  const calendars = indexMarketPitDecisionCalendarsV3(
    evidence.calendars,
    args.calendars,
    input.request.symbol,
    input.request.routeKey.market,
  );
  const archives = indexMarketPitDecisionArchivesV3(args);
  assertMarketPitDecisionEvidenceCutoffV3(evidence, input.dataAsOf);
  const result: Binding[] = [];
  let previousTimestamp: string | undefined;
  for (const [index, bar] of bars.entries()) {
    if (previousTimestamp && compareDecisionClockV3(previousTimestamp, bar.timestamp) >= 0)
      fail('archive-binding-mismatch');
    previousTimestamp = bar.timestamp;
    if (bar.completionStatus !== 'complete') fail('bar-incomplete');
    const claim = evidence.barDecisionBindings[index]!;
    const reference = content.proof.barArchives[index]!;
    const source = sourceTimes.bindings[index]!;
    assertMarketPitDecisionSourceBindingV3(bar, reference, source, archives);
    const calendar = calendars.get(claim.calendarEvidenceId);
    const tradingDate = marketPitShanghaiTradingDateV3(bar.timestamp);
    const window = calendar?.windows.get(tradingDate);
    if (!window) fail('missing-successor');
    if (
      claim.tradingDate !== tradingDate ||
      compareDecisionClockV3(claim.decisionAt, bar.availableAt) !== 0 ||
      compareDecisionClockV3(claim.closedAt, window.closedAt) !== 0 ||
      claim.nextTradingDate !== window.nextTradingDate ||
      compareDecisionClockV3(claim.nextOpenedAt, window.nextOpenedAt) !== 0
    )
      fail('decision-binding-mismatch');
    assertMarketPitDecisionSourceClocksV3(
      claim,
      reference,
      bar,
      source,
      calendar!.calendar,
      window,
      evidence,
      input.dataAsOf,
    );
    result.push({ ...claim, tradingDate, decisionAt: bar.availableAt, ...window });
  }
  return result;
}

/** 必要计算：不认证场所、原发布或修订真实性，不签发严格 PIT 准入。 */
export function bindMarketPitDailyDecisionWindowsV3(
  args: MarketPitDecisionWindowInputV3,
): MarketPitDecisionWindowResultV3 {
  try {
    return { status: 'decision-windows-bound', barDecisionBindings: bindWindows(args) };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'clock-invalid';
    if (!failureReasons.has(reason as MarketPitDecisionWindowFailureV3))
      return { status: 'unavailable', reason: 'clock-invalid' };
    return { status: 'unavailable', reason: reason as MarketPitDecisionWindowFailureV3 };
  }
}
