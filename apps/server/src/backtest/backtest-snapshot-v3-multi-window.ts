import type {
  BacktestSnapshotActualSourceV3,
  MarketDataBarSeriesRequestV3,
} from '@thesis-ledger/schemas';
import { marketDataMultiWindowResponseV3Schema } from '@thesis-ledger/schemas';
import type { ArtifactRow } from './backtest-artifact-store.js';
import { parseMarketWindowEvidenceResponseV3 } from '../market/market-window-response-v3.js';
import { isBacktestEvidenceAfterDataAsOfV3 } from './backtest-v3-evidence-clock.js';

export const validateSnapshotMultiWindowV3 = (input: {
  source: BacktestSnapshotActualSourceV3;
  request: MarketDataBarSeriesRequestV3;
  evidence: ArtifactRow;
  bars: ArtifactRow[];
  dataAsOf: string;
  canonicalize: (value: unknown) => string;
}) => {
  const { source, request, evidence, bars, canonicalize } = input;
  const fail = (): never => {
    throw new Error('Snapshot V3 多窗口观测与执行证据不一致');
  };
  if (!source.windowProtocol) {
    if (evidence.multiWindowResponse !== undefined) fail();
    return;
  }
  const encoded = evidence.multiWindowResponse;
  if (typeof encoded !== 'string') return fail();
  const response = marketDataMultiWindowResponseV3Schema.parse(
    parseMarketWindowEvidenceResponseV3(JSON.parse(encoded), request),
  );
  if (
    response.inputFingerprint !== source.inputFingerprint ||
    canonicalize(response.provenance) !== canonicalize(source.provenance) ||
    canonicalize(response.routeKey) !== canonicalize(source.routeKey) ||
    response.bars.length !== bars.length
  )
    fail();
  for (const field of [
    'coverage',
    'coverageProof',
    'sourcePriceBasis',
    'inputFingerprint',
  ] as const) {
    if (
      typeof evidence[field] !== 'string' ||
      canonicalize(JSON.parse(evidence[field])) !== canonicalize(response[field])
    )
      fail();
  }
  for (const observation of response.windowObservations) {
    if (isBacktestEvidenceAfterDataAsOfV3(observation.completedAt, input.dataAsOf)) fail();
  }
  response.bars.forEach((point, index) => {
    const row = bars[index]!;
    if (
      row.occurredAt !== point.timestamp ||
      row.availableAt !== point.availableAt ||
      row.completionStatus !== point.completionStatus
    )
      fail();
    for (const field of ['open', 'high', 'low', 'close', 'volume', 'amount'] as const) {
      if (row[field] !== String(point[field])) fail();
    }
  });
};
