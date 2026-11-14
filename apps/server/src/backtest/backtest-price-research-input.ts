import {
  marketDataBarSeriesRequestV3Schema,
  marketFrozenWindowRefV3Schema,
  priceResearchNeedsActualPrice,
  priceResearchReferenceArtifactKey,
  priceResearchEvidenceArtifactKey,
  type BacktestStrategy,
  type BacktestSnapshotManifestV3,
  type MarketDataBarSeriesResponseV3,
  type RunConfigV3,
} from '@thesis-ledger/schemas';
import type { MarketBarReader } from '../market/market-bar-reader.js';
import type { MarketBarWindowReadResultV3 } from '../market/market-bar-reader-v3.js';
import { marketFrozenWindowHashV3 } from '../market/market-frozen-window-v3.js';
import { parseMarketWindowEvidenceResponseV3 } from '../market/market-window-response-v3.js';
import type { ArtifactRow } from './backtest-artifact-store.js';
import { canonicalizeManifest, hashCanonicalManifest } from './backtest-snapshot.js';
import { createBacktestSnapshotV3Source } from './backtest-snapshot-v3-source.js';
import { executionBarRowsV3 } from './backtest-v3-execution-bar-rows.js';
import type { BacktestRuleCompatibilityFacts } from './backtest-dependency-plan.js';

type Selected = Extract<MarketBarWindowReadResultV3, { status: 'selected' }>;

export class PriceResearchReferenceUnavailableError extends Error {
  readonly selection: Extract<MarketBarWindowReadResultV3, { status: 'unavailable' }>['selection'];
  constructor(
    read: Extract<MarketBarWindowReadResultV3, { status: 'unavailable' }>,
    execution: Selected,
  ) {
    const failure = read.selection.primaryFailure ?? read.selection.reason;
    super(
      `不复权参考行情不可用：${failure}；标的 ${execution.request.symbol}，窗口 ${execution.request.start} 至 ${execution.request.end}${read.selection.backupFailure ? `；备用来源：${read.selection.backupFailure}` : ''}`,
    );
    this.name = 'PriceResearchReferenceUnavailableError';
    this.selection = read.selection;
  }
}
const same = (a: unknown, b: unknown) => canonicalizeManifest(a) === canonicalizeManifest(b);
const referenceRows = (response: MarketDataBarSeriesResponseV3, symbol: string) =>
  executionBarRowsV3(response, symbol, 'normalized-series', true).map((row) => ({
    ...row,
    purpose: 'actual-price-reference',
  }));

export async function readPriceResearchReference(input: {
  strategy: BacktestStrategy;
  runConfig: RunConfigV3;
  execution: Selected;
  reader: Pick<MarketBarReader, 'readV3'>;
  forceReference?: boolean;
}) {
  const { strategy, runConfig, execution, reader } = input;
  if (
    !runConfig.priceResearch ||
    (!input.forceReference &&
      !runConfig.priceResearch.actualPriceWindow &&
      !priceResearchNeedsActualPrice(strategy))
  )
    return undefined;
  const routeKey = { ...execution.request.routeKey, adjustment: 'none' as const };
  const window = { start: execution.request.start, end: execution.request.end };
  const read = await reader.readV3({
    market: routeKey.market,
    symbol: strategy.executionInstrument.symbol,
    routeKey,
    window,
    tradabilityMode: 'assume-untradable-no-bar',
    priceResearch: true,
    ...(runConfig.priceResearch.actualPriceWindow
      ? { frozenWindowRef: runConfig.priceResearch.actualPriceWindow }
      : {}),
  });
  if (read.status !== 'selected') throw new PriceResearchReferenceUnavailableError(read, execution);
  const response = read.selection.response;
  const source = createBacktestSnapshotV3Source(
    { purpose: 'execution', symbol: strategy.executionInstrument.symbol, routeKey, window },
    read,
  );
  const responseHash = read.evidence.completeResponseHash;
  if (!responseHash || responseHash !== marketFrozenWindowHashV3(response))
    throw new Error('不复权参考窗口未可靠冻结，请重新准备');
  const frozenWindowRef = {
    version: 'market-frozen-window-v1' as const,
    identityFingerprint: read.evidence.identityFingerprint,
    responseHash,
  };
  // Market verifies the parent acquisition; a cropped view has its own evidence and hash.
  const sourceFrozenWindowRef = read.frozenWindowRef ?? frozenWindowRef;
  if (
    runConfig.priceResearch.actualPriceWindow &&
    !same(sourceFrozenWindowRef, runConfig.priceResearch.actualPriceWindow)
  )
    throw new Error('不复权参考行情与准备时的冻结版本不一致');
  const rows = referenceRows(response, strategy.executionInstrument.symbol);
  return {
    ...source,
    rows,
    response,
    frozenWindowRef: sourceFrozenWindowRef,
    evidenceRow: {
      ...source.evidenceRow,
      completeResponse: canonicalizeManifest(response),
      barRowsFingerprint: hashCanonicalManifest(rows),
      frozenWindowRef: canonicalizeManifest(frozenWindowRef),
      ...(!same(sourceFrozenWindowRef, frozenWindowRef)
        ? { sourceFrozenWindowRef: canonicalizeManifest(sourceFrozenWindowRef) }
        : {}),
    } satisfies ArtifactRow,
  };
}

/** Frozen reference prices are checked independently, without promoting them to actual-share execution facts. */
export function validatePriceResearchReference(
  manifest: BacktestSnapshotManifestV3,
  byKey: ReadonlyMap<string, readonly ArtifactRow[]>,
  strategy: BacktestStrategy,
  runConfig: RunConfigV3,
): MarketDataBarSeriesResponseV3['sourcePriceBasis'] | undefined {
  if (manifest.priceResearch?.protocolVersion !== runConfig.priceResearch?.protocolVersion)
    throw new Error('价格研究协议与冻结运行配置不一致');
  if (
    !runConfig.priceResearch ||
    (!runConfig.priceResearch.actualPriceWindow && !priceResearchNeedsActualPrice(strategy))
  ) {
    if (
      manifest.priceResearch?.actualPriceSource ||
      byKey.has(priceResearchReferenceArtifactKey) ||
      byKey.has(priceResearchEvidenceArtifactKey) ||
      runConfig.priceResearch?.actualPriceWindow
    )
      throw new Error('冻结快照包含未规划的原价参考输入');
    return undefined;
  }
  const evidence = byKey.get(priceResearchEvidenceArtifactKey);
  const rows = byKey.get(priceResearchReferenceArtifactKey);
  const ref = runConfig.priceResearch.actualPriceWindow;
  if (evidence?.length !== 1 || !rows?.length || !ref || !manifest.priceResearch?.actualPriceSource)
    throw new Error('价格研究缺少已冻结的原价参考窗口');
  return readAndValidatePriceReference(
    manifest,
    strategy,
    runConfig,
    evidence[0]!,
    rows,
    ref,
    manifest.priceResearch.actualPriceSource,
  );
}

export function priceResearchRuleFacts(
  strategy: BacktestStrategy,
  runConfig: RunConfigV3,
  actualBasis?: MarketDataBarSeriesResponseV3['sourcePriceBasis'],
): BacktestRuleCompatibilityFacts {
  if (!runConfig.executionModel) throw new Error('价格研究缺少冻结研究模型');
  const executionCoordinate = {
    coordinateId: 'execution-series',
    currency: runConfig.executionModel.scope.currency,
    priceBasis: runConfig.executionPriceProtocol.priceBasis,
  };
  const actualCoordinate = actualBasis
    ? {
        coordinateId: 'actual-price-series',
        currency: executionCoordinate.currency,
        priceBasis: { ...actualBasis, quantityBasis: 'actual-units' as const },
      }
    : undefined;
  return {
    executionCoordinate,
    sourceCoordinates: Object.fromEntries(
      strategy.signalSources.flatMap((source) => {
        if (source.priceCoordinate === 'actual')
          return actualCoordinate ? [[source.id, actualCoordinate]] : [];
        return [[source.id, executionCoordinate]];
      }),
    ),
    executionUnits: {
      realLotSize: null,
      realTickSize: null,
      researchQuantity: 'reference-notional-v1',
      actualQuantityConversion: { available: false, evidenceRef: null },
    },
  };
}

function readAndValidatePriceReference(
  manifest: BacktestSnapshotManifestV3,
  strategy: BacktestStrategy,
  runConfig: RunConfigV3,
  row: ArtifactRow,
  rows: readonly ArtifactRow[],
  ref: NonNullable<NonNullable<RunConfigV3['priceResearch']>['actualPriceWindow']>,
  source: NonNullable<
    NonNullable<BacktestSnapshotManifestV3['priceResearch']>['actualPriceSource']
  >,
): MarketDataBarSeriesResponseV3['sourcePriceBasis'] {
  const json = (key: string) => {
    if (typeof row[key] !== 'string') throw new Error(`原价参考证据缺少 ${key}`);
    return JSON.parse(row[key]) as unknown;
  };
  const request = marketDataBarSeriesRequestV3Schema.parse(json('request'));
  const response = parseMarketWindowEvidenceResponseV3(json('completeResponse'), request);
  const windowRef = marketFrozenWindowRefV3Schema.parse(json('frozenWindowRef'));
  const sourceRef =
    row.sourceFrozenWindowRef === undefined
      ? windowRef
      : marketFrozenWindowRefV3Schema.parse(json('sourceFrozenWindowRef'));
  const execution = manifest.actualSources.find((source) => source.purpose === 'execution');
  if (
    !referenceRequestMatchesExecution(execution, request, strategy, manifest, runConfig) ||
    !same(source.routeKey, response.routeKey) ||
    !same(source.provenance, response.provenance) ||
    source.inputFingerprint !== response.inputFingerprint ||
    source.symbol !== request.symbol ||
    !same(sourceRef, ref) ||
    json('identityFingerprint') !== windowRef.identityFingerprint ||
    marketFrozenWindowHashV3(response) !== windowRef.responseHash ||
    !same(rows, referenceRows(response, request.symbol)) ||
    row.barRowsFingerprint !== hashCanonicalManifest(rows)
  )
    throw new Error('原价参考的来源、窗口、冻结身份或行情数据不一致');
  if (
    Date.parse(response.sourcePriceBasis.observedAt) > Date.parse(runConfig.dataAsOf) ||
    response.bars.some((bar) => Date.parse(bar.availableAt) > Date.parse(runConfig.dataAsOf))
  )
    throw new Error('原价参考包含晚于冻结截点的数据');
  return response.sourcePriceBasis;
}

function referenceRequestMatchesExecution(
  execution: BacktestSnapshotManifestV3['actualSources'][number] | undefined,
  request: ReturnType<typeof marketDataBarSeriesRequestV3Schema.parse>,
  strategy: BacktestStrategy,
  manifest: BacktestSnapshotManifestV3,
  runConfig: RunConfigV3,
) {
  return Boolean(
    execution &&
    request.symbol === strategy.executionInstrument.symbol &&
    same(request.routeKey, { ...execution.routeKey, adjustment: 'none' }) &&
    request.start === manifest.dateRange.warmupStartDate &&
    request.end === runConfig.endDate,
  );
}
