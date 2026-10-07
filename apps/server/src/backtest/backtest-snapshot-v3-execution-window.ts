import {
  marketCoverageProofV3Schema,
  marketDataBarSeriesCoverageV3Schema,
  marketDataBarSeriesRequestV3Schema,
  marketDataBarRouteKeyV3Schema,
  sourcePriceBasisSchema,
  type runConfigSchemaV3,
} from '@thesis-ledger/schemas';
import type { BacktestSnapshotManifestV3 } from '@thesis-ledger/schemas';
import type { ArtifactRow } from './backtest-artifact-store.js';
import type { SnapshotV3EvidenceContext } from './backtest-snapshot-v3-execution-evidence.js';
import { validateSnapshotMultiWindowV3 } from './backtest-snapshot-v3-multi-window.js';
import { isBacktestEvidenceAfterDataAsOfV3 } from './backtest-v3-evidence-clock.js';

type ExecutionSource = BacktestSnapshotManifestV3['actualSources'][number];
const protocolSourcePriceBasis = (manifest: BacktestSnapshotManifestV3) =>
  Object.fromEntries(
    Object.entries(manifest.executionPriceProtocol.priceBasis).filter(
      ([key]) => key !== 'quantityBasis',
    ),
  );

const parseJsonField = (
  row: ArtifactRow,
  field: string,
  integrityError: (message: string) => Error,
): unknown => {
  const value = row[field];
  if (typeof value !== 'string') throw integrityError(`V3 evidence field is missing: ${field}`);
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw integrityError(`V3 evidence field is invalid JSON: ${field}`);
  }
};

export const parseExecutionWindowEvidenceV3 = (
  manifest: BacktestSnapshotManifestV3,
  config: ReturnType<typeof runConfigSchemaV3.parse>,
  source: ExecutionSource,
  rows: ArtifactRow[],
  barsRows: ArtifactRow[],
  context: SnapshotV3EvidenceContext,
) => {
  function fail(message: string): never {
    throw context.integrityError(message);
  }
  if (rows.length !== 1 || rows[0]?.kind !== 'market-window-evidence-v3') {
    fail('Snapshot V3 窗口证据 Artifact 结构无效');
  }
  const evidence = rows[0];
  if (
    context.canonicalize(config.frozenExecutionWindow ?? null) !==
    context.canonicalize(manifest.frozenExecutionWindow ?? null)
  ) {
    fail('Snapshot V3 冻结窗口引用与 RunConfig 不一致');
  }
  if (manifest.frozenExecutionWindow) {
    const reference = parseJsonField(evidence, 'frozenWindowRef', (message) =>
      context.integrityError(message),
    );
    if (context.canonicalize(reference) !== context.canonicalize(manifest.frozenExecutionWindow)) {
      fail('Snapshot V3 行情证据的父窗口引用不一致');
    }
  } else if (evidence.frozenWindowRef !== undefined) {
    fail('Snapshot V3 行情证据包含未声明的父窗口引用');
  }
  const request = marketDataBarSeriesRequestV3Schema.safeParse(
    parseJsonField(evidence, 'request', (message) => context.integrityError(message)),
  );
  if (!request.success || !request.data.routeTarget)
    fail('Snapshot V3 证据缺少严格 pinned request');
  try {
    validateSnapshotMultiWindowV3({
      source,
      request: request.data,
      evidence,
      bars: barsRows,
      dataAsOf: manifest.dataAsOf,
      canonicalize: context.canonicalize,
    });
  } catch {
    fail('Snapshot V3 多窗口观测校验失败');
  }
  const routeKey = marketDataBarRouteKeyV3Schema.parse(
    parseJsonField(evidence, 'routeKey', (message) => context.integrityError(message)),
  );
  const target = parseJsonField(evidence, 'target', (message) => context.integrityError(message));
  const selection = parseJsonField(evidence, 'selection', (message) =>
    context.integrityError(message),
  );
  const provenance = parseJsonField(evidence, 'provenance', (message) =>
    context.integrityError(message),
  );
  const revisions = parseJsonField(evidence, 'revisions', (message) =>
    context.integrityError(message),
  );
  const evidenceInputFingerprint = parseJsonField(evidence, 'inputFingerprint', (message) =>
    context.integrityError(message),
  );
  const identityFingerprint = parseJsonField(evidence, 'identityFingerprint', (message) =>
    context.integrityError(message),
  );
  const fetchedAt = parseJsonField(evidence, 'fetchedAt', (message) =>
    context.integrityError(message),
  );
  const seriesVersion = parseJsonField(evidence, 'seriesVersion', (message) =>
    context.integrityError(message),
  );
  const coverage = marketDataBarSeriesCoverageV3Schema.parse(
    parseJsonField(evidence, 'coverage', (message) => context.integrityError(message)),
  );
  const coverageProof = marketCoverageProofV3Schema.parse(
    parseJsonField(evidence, 'coverageProof', (message) => context.integrityError(message)),
  );
  const sourcePriceBasis = sourcePriceBasisSchema.parse(
    parseJsonField(evidence, 'sourcePriceBasis', (message) => context.integrityError(message)),
  );
  return {
    evidence,
    request,
    routeTarget: request.data.routeTarget,
    routeKey,
    target,
    selection,
    provenance,
    revisions,
    evidenceInputFingerprint,
    identityFingerprint,
    fetchedAt,
    seriesVersion,
    coverage,
    coverageProof,
    sourcePriceBasis,
  };
};

export type ExecutionWindowEvidence = ReturnType<typeof parseExecutionWindowEvidenceV3>;

export const validateExecutionWindowCoverageV3 = (
  manifest: BacktestSnapshotManifestV3,
  source: ExecutionSource,
  executionRouteKey: ReturnType<typeof marketDataBarRouteKeyV3Schema.parse>,
  parsed: ExecutionWindowEvidence,
  context: SnapshotV3EvidenceContext,
): void => {
  const { request, coverage, coverageProof, sourcePriceBasis, fetchedAt } = parsed;
  function fail(message: string): never {
    throw context.integrityError(message);
  }
  if (
    request.data.symbol !== source.symbol ||
    request.data.start !== manifest.dateRange.warmupStartDate ||
    request.data.end !== manifest.dateRange.endDate ||
    context.canonicalize(request.data.routeKey) !== context.canonicalize(source.routeKey) ||
    coverage.requestedStart !== request.data.start ||
    coverage.requestedEnd !== request.data.end ||
    coverageProof.calendar.market !== executionRouteKey.market ||
    coverageProof.window.status !== 'complete' ||
    coverageProof.window.requestedStart !== request.data.start ||
    coverageProof.window.requestedEnd !== request.data.end
  ) {
    fail('Snapshot V3 coverage proof 未覆盖冻结 execution 全窗口');
  }
  if (
    context.canonicalize(sourcePriceBasis) !==
      context.canonicalize(protocolSourcePriceBasis(manifest)) ||
    isBacktestEvidenceAfterDataAsOfV3(sourcePriceBasis.observedAt, manifest.dataAsOf) ||
    typeof fetchedAt !== 'string' ||
    isBacktestEvidenceAfterDataAsOfV3(fetchedAt, manifest.dataAsOf)
  ) {
    fail('Snapshot V3 来源价格事实与冻结 execution protocol 或 dataAsOf 不一致');
  }
};
