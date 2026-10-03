import {
  marketDataBarRouteKeyV3Schema,
  type marketDataBarSeriesRequestResponseV3Schema,
  marketDataBarSeriesRequestV3Schema,
  type BacktestSnapshotActualSourceV3,
  type MarketDataBarRouteKeyV3,
} from '@thesis-ledger/schemas';
import type { ArtifactRow } from './backtest-artifact-store.js';
import { canonicalizeManifest } from './backtest-snapshot.js';
import type { MarketBarWindowReadResultV3 } from '../market/market-bar-reader-v3.js';
import { parseMarketWindowEvidenceResponseV3 } from '../market/market-window-response-v3.js';
import {
  encodeSnapshotSourceEvidenceV3,
  snapshotSourceEvidenceMatchesV3,
} from './backtest-snapshot-v3-source-evidence.js';

export interface BacktestSnapshotV3SourcePlan {
  purpose: BacktestSnapshotActualSourceV3['purpose'];
  symbol: string;
  routeKey: MarketDataBarRouteKeyV3;
  window: { start: string; end: string };
}

export interface BacktestSnapshotV3SourceArtifacts {
  actualSource: BacktestSnapshotActualSourceV3;
  evidenceRow: ArtifactRow;
}

export type BacktestSnapshotV3SourceErrorCode =
  | 'unsupported_purpose'
  | 'window_unavailable'
  | 'request_unpinned'
  | 'reader_contract_invalid'
  | 'planned_scope_mismatch'
  | 'reader_evidence_mismatch';

export class BacktestSnapshotV3SourceError extends Error {
  constructor(
    readonly code: BacktestSnapshotV3SourceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'BacktestSnapshotV3SourceError';
  }
}

const fail = (code: BacktestSnapshotV3SourceErrorCode, message: string): never => {
  throw new BacktestSnapshotV3SourceError(code, message);
};

const sameCanonicalValue = (left: unknown, right: unknown) =>
  canonicalizeManifest(left) === canonicalizeManifest(right);

/** Builds an immutable source record and scalar-only evidence row from a selected Reader V3 result. */
export const createBacktestSnapshotV3Source = (
  plan: BacktestSnapshotV3SourcePlan,
  readResult: MarketBarWindowReadResultV3,
): BacktestSnapshotV3SourceArtifacts => {
  if (plan.purpose !== 'execution') {
    return fail('unsupported_purpose', '当前 Snapshot V3 来源 helper 仅支持 execution 用途。');
  }
  if (readResult.status !== 'selected') {
    return fail('window_unavailable', 'V3 行情窗口未 selected，不能冻结为 Snapshot 来源。');
  }

  const { selection } = readResult;
  let correlated: ReturnType<typeof marketDataBarSeriesRequestResponseV3Schema.parse>;
  try {
    const request = marketDataBarSeriesRequestV3Schema.parse(readResult.request);
    correlated = {
      request,
      response: parseMarketWindowEvidenceResponseV3(selection.response, request),
    };
  } catch {
    return fail('reader_contract_invalid', 'V3 Reader 请求与响应未通过严格相关性校验。');
  }

  const { request, response } = correlated;
  const target = request.routeTarget;
  if (!target) {
    return fail('request_unpinned', 'Snapshot V3 来源必须来自固定 RouteTarget 请求。');
  }

  const plannedRouteKey = marketDataBarRouteKeyV3Schema.parse(plan.routeKey);
  const expectedWindow = { start: plan.window.start, end: plan.window.end };
  if (
    plan.symbol !== request.symbol ||
    !sameCanonicalValue(plannedRouteKey, request.routeKey) ||
    expectedWindow.start !== request.start ||
    expectedWindow.end !== request.end ||
    response.coverage.requestedStart !== expectedWindow.start ||
    response.coverage.requestedEnd !== expectedWindow.end ||
    response.coverageProof.window.requestedStart !== expectedWindow.start ||
    response.coverageProof.window.requestedEnd !== expectedWindow.end
  ) {
    return fail(
      'planned_scope_mismatch',
      'V3 Reader 结果与预先确定的标的、RouteKey 或完整窗口不一致。',
    );
  }

  if (
    selection.routeIndex !== target.routeIndex ||
    selection.target.providerId !== target.providerId ||
    selection.target.upstreamSource !== target.upstreamSource ||
    selection.effectivePolicyRevision !== response.provenance.effectivePolicyRevision
  ) {
    return fail(
      'reader_evidence_mismatch',
      'V3 Reader selected 目标与固定请求或来源 provenance 不一致。',
    );
  }

  const evidenceInput = {
    plan,
    readResult,
    request,
    response,
    plannedRouteKey,
    expectedWindow,
    target,
  };
  if (!snapshotSourceEvidenceMatchesV3(evidenceInput)) {
    return fail('reader_evidence_mismatch', '持久化的 V3 窗口证据与 selected Reader 结果不一致。');
  }

  return encodeSnapshotSourceEvidenceV3(evidenceInput);
};
