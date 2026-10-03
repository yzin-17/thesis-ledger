import {
  marketCalendarTimezonesV3,
  backtestDailyTradabilityEvidenceV3Schema,
  observedTradabilityDatesV3,
  type marketCoverageProofV3Schema,
  type marketDataBarRouteKeyV3Schema,
} from '@thesis-ledger/schemas';
import type { BacktestSnapshotManifestV3 } from '@thesis-ledger/schemas';
import type { ArtifactRow } from './backtest-artifact-store.js';
import type { SnapshotV3EvidenceContext } from './backtest-snapshot-v3-execution-evidence.js';
import { isBacktestEvidenceAfterDataAsOfV3 } from './backtest-v3-evidence-clock.js';

type ExecutionSource = BacktestSnapshotManifestV3['actualSources'][number];

export const validateExecutionBarsEvidenceV3 = (
  manifest: BacktestSnapshotManifestV3,
  source: ExecutionSource,
  executionRouteKey: ReturnType<typeof marketDataBarRouteKeyV3Schema.parse>,
  evidence: ArtifactRow,
  barsRows: ArtifactRow[],
  coverageProof: ReturnType<typeof marketCoverageProofV3Schema.parse>,
  context: SnapshotV3EvidenceContext,
): void => {
  function fail(message: string): never {
    throw context.integrityError(message);
  }
  if (typeof evidence.barRowsFingerprint !== 'string' || barsRows.length === 0) {
    fail('Snapshot V3 execution bars fingerprint 或数据缺失');
  }
  if (context.hash(barsRows) !== evidence.barRowsFingerprint) {
    fail('Snapshot V3 execution bars 与窗口证据指纹不一致');
  }

  const timezone = marketCalendarTimezonesV3[coverageProof.calendar.market];
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const barDates = barsRows.map((row) => {
    if (
      row.kind !== 'market-bar-v3' ||
      row.purpose !== 'execution' ||
      row.symbol !== source.symbol ||
      row.market !== executionRouteKey.market ||
      row.assetType !== executionRouteKey.assetType ||
      row.timeframe !== executionRouteKey.timeframe ||
      row.adjustment !== executionRouteKey.adjustment ||
      row.providerId !== source.provenance.providerId ||
      row.upstreamSource !== source.provenance.upstreamSource ||
      row.routeIndex !== source.provenance.routeIndex ||
      row.effectivePolicyRevision !== source.provenance.effectivePolicyRevision ||
      row.inputFingerprint !== source.inputFingerprint ||
      row.completionStatus !== 'complete' ||
      row.quality !== 'complete' ||
      typeof row.occurredAt !== 'string' ||
      typeof row.availableAt !== 'string' ||
      isBacktestEvidenceAfterDataAsOfV3(row.occurredAt, manifest.dataAsOf) ||
      isBacktestEvidenceAfterDataAsOfV3(row.availableAt, manifest.dataAsOf)
    ) {
      fail('Snapshot V3 Bar row 与冻结 execution actualSource 不一致');
    }
    const parts = formatter.formatToParts(new Date(row.occurredAt));
    const part = (type: string) => parts.find((item) => item.type === type)?.value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  });
  let expectedDates = coverageProof.calendar.expectedSessionDates.filter(
    (date) => date >= coverageProof.listing.firstTradingDate,
  );
  if (typeof evidence.historicalTradabilityWindows === 'string') {
    expectedDates = observedTradabilityDatesV3(
      backtestDailyTradabilityEvidenceV3Schema.array().min(1).parse(JSON.parse(evidence.historicalTradabilityWindows)),
      { symbol: source.symbol, routeKey: executionRouteKey, target: source.provenance, coverageProof },
    );
  }
  if (context.canonicalize(barDates) !== context.canonicalize(expectedDates)) {
    fail('Snapshot V3 execution bars 未覆盖完整交易日历窗口');
  }
};
