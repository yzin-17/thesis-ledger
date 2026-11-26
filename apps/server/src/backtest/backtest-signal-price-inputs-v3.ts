import {
  marketDataBarSeriesRequestV3Schema,
  marketFrozenWindowRefV3Schema,
  type BacktestStrategy,
  type RunConfigV3,
  type BacktestSnapshotManifestV3,
} from '@thesis-ledger/schemas';
import { additionalSignalPricePlanV3 } from './backtest-signal-price-plan-v3.js';
import type { MarketBarReader } from '../market/market-bar-reader.js';
import { parseMarketWindowEvidenceResponseV3 } from '../market/market-window-response-v3.js';
import { marketFrozenWindowHashV3 } from '../market/market-frozen-window-v3.js';
import { canonicalizeManifest, hashCanonicalManifest } from './backtest-snapshot.js';
import { createBacktestSnapshotV3Source } from './backtest-snapshot-v3-source.js';
import { executionBarRowsV3 } from './backtest-v3-execution-bar-rows.js';
import type { ArtifactRow } from './backtest-artifact-store.js';

const same = (a: unknown, b: unknown) => canonicalizeManifest(a) === canonicalizeManifest(b);
type Plan = ReturnType<typeof additionalSignalPricePlanV3>[number];
const signalInputError = (message: string) => Object.assign(new Error(message), { code: 'DATA_UNAVAILABLE' });

/** 额外物理周期独立固定窗口；执行构建必须持有准备时已冻结的身份。 */
export async function readAdditionalSignalPricesV3(input: {
  strategy: BacktestStrategy;
  runConfig: RunConfigV3;
  warmupStart: string;
  reader: Pick<MarketBarReader, 'readV3'>;
  requireFrozen: boolean;
  freezeTimePolicy?: 'after-acquisition';
  actualBasis?: ReturnType<typeof parseMarketWindowEvidenceResponseV3>['sourcePriceBasis'];
}) {
  const { strategy, runConfig } = input;
  const plans = additionalSignalPricePlanV3(strategy, runConfig);
  const refs = runConfig.signalPriceWindows ?? [];
  if (
    refs.some((ref) => !plans.some((plan) => plan.artifactKey === ref.artifactKey)) ||
    new Set(refs.map((ref) => ref.artifactKey)).size !== refs.length
  )
    throw signalInputError('额外信号窗口包含未规划或重复身份');
  const results = [];
  for (const plan of plans) {
    const frozen = refs.find((item) => item.artifactKey === plan.artifactKey)?.frozenWindowRef;
    if (input.requireFrozen && !frozen)
      throw signalInputError(`额外周期 ${plan.routeKey.timeframe} 尚未准备冻结窗口`);
    const window = { start: input.warmupStart, end: runConfig.endDate };
    const read = await input.reader.readV3({
      market: plan.routeKey.market,
      symbol: plan.symbol,
      routeKey: plan.routeKey,
      window,
      tradabilityMode:
        plan.routeKey.timeframe === '1d' ? 'assume-untradable-no-bar' : 'observed-bars-only',
      ...(runConfig.priceResearch ? { priceResearch: true } : {}),
      ...(plan.routeKey.timeframe === '1d' && runConfig.priceResearch?.dailyObservationContract !== undefined
        ? { dailyObservationContract: runConfig.priceResearch.dailyObservationContract } : {}),
      ...(frozen ? { frozenWindowRef: frozen } : {}),
    });
    if (read.status !== 'selected')
      throw signalInputError(`额外信号来源 ${plan.routeKey.timeframe} 不可用：${read.selection.reason}`);
    const response = read.selection.response;
    const source = createBacktestSnapshotV3Source(
      { purpose: 'signal', symbol: plan.symbol, routeKey: plan.routeKey, window },
      read,
    );
    const childRef = {
      version: 'market-frozen-window-v1' as const,
      identityFingerprint: read.evidence.identityFingerprint,
      responseHash: marketFrozenWindowHashV3(response),
    };
    const sourceRef = read.frozenWindowRef ?? childRef;
    if (
      read.evidence.completeResponseHash !== childRef.responseHash ||
      (frozen && !same(frozen, sourceRef))
    )
      throw signalInputError('额外信号窗口身份与准备记录不一致');
    assertSignalPriceClockV3(
      response,
      input.freezeTimePolicy === 'after-acquisition' && !input.requireFrozen
        ? { ...runConfig, dataAsOf: new Date().toISOString() }
        : runConfig,
    );
    assertSignalPriceBasisV3(response, runConfig, input.actualBasis);
    const rows = signalRowsV3(response, plan.symbol, runConfig);
    if (!rows.length) throw signalInputError('额外信号窗口没有可冻结行情');
    assertSignalWarmupV3(plan, response, runConfig);
    results.push({
      plan,
      rows,
      actualSource: source.actualSource,
      frozenWindowRef: sourceRef,
      evidenceRow: {
        ...source.evidenceRow,
        completeResponse: canonicalizeManifest(response),
        barRowsFingerprint: hashCanonicalManifest(rows),
        frozenWindowRef: canonicalizeManifest(childRef),
        sourceFrozenWindowRef: canonicalizeManifest(sourceRef),
      } satisfies ArtifactRow,
    });
  }
  return results;
}

function assertSignalPriceClockV3(
  response: ReturnType<typeof parseMarketWindowEvidenceResponseV3>,
  runConfig: RunConfigV3,
) {
  if (
    Date.parse(response.sourcePriceBasis.observedAt) > Date.parse(runConfig.dataAsOf) ||
    response.bars.some((bar) => Date.parse(bar.availableAt) > Date.parse(runConfig.dataAsOf))
  )
    throw signalInputError('额外信号来源包含晚于冻结截点的行情');
}

export function validateAdditionalSignalPricesV3(
  strategy: BacktestStrategy,
  runConfig: RunConfigV3,
  manifest: BacktestSnapshotManifestV3,
  byKey: ReadonlyMap<string, readonly ArtifactRow[]>,
  actualBasis?: ReturnType<typeof parseMarketWindowEvidenceResponseV3>['sourcePriceBasis'],
) {
  const plans = additionalSignalPricePlanV3(strategy, runConfig);
  const refs = runConfig.signalPriceWindows ?? [];
  if (
    refs.length !== plans.length ||
    new Set(refs.map((ref) => ref.artifactKey)).size !== refs.length
  )
    throw signalInputError('额外信号冻结身份未准确覆盖物理来源');
  return plans.map((plan) =>
    validateSignalPricePlanV3(plan, runConfig, manifest, byKey, actualBasis),
  );
}

function validateSignalPricePlanV3(
  plan: Plan,
  runConfig: RunConfigV3,
  manifest: BacktestSnapshotManifestV3,
  byKey: ReadonlyMap<string, readonly ArtifactRow[]>,
  actualBasis?: ReturnType<typeof parseMarketWindowEvidenceResponseV3>['sourcePriceBasis'],
) {
  const rows = byKey.get(plan.artifactKey),
    evidence = byKey.get(plan.evidenceKey);
  if (!rows?.length || evidence?.length !== 1) throw signalInputError('额外信号行情或证据缺失');
  const row = evidence[0]!;
  const json = (key: string): unknown => {
    if (typeof row[key] !== 'string') throw signalInputError('额外信号证据字段缺失：' + key);
    return JSON.parse(row[key]) as unknown;
  };
  const request = marketDataBarSeriesRequestV3Schema.parse(json('request'));
  const response = parseMarketWindowEvidenceResponseV3(json('completeResponse'), request);
  const childRef = marketFrozenWindowRefV3Schema.parse(json('frozenWindowRef'));
  const sourceRef = marketFrozenWindowRefV3Schema.parse(json('sourceFrozenWindowRef'));
  const frozen = runConfig.signalPriceWindows?.find(
    (item) => item.artifactKey === plan.artifactKey,
  )?.frozenWindowRef;
  const actualSource = {
    purpose: 'signal' as const,
    symbol: request.symbol,
    routeKey: response.routeKey,
    provenance: response.provenance,
    inputFingerprint: response.inputFingerprint,
    ...('windowObservations' in response
      ? { windowProtocol: 'market-multi-window-content-v1' as const }
      : {}),
  };
  if (
    !request.routeTarget ||
    !same(request.routeKey, plan.routeKey) ||
    request.symbol !== plan.symbol ||
    request.start !== manifest.dateRange.warmupStartDate ||
    request.end !== runConfig.endDate ||
    (request.routeKey.timeframe === '1d' &&
      (request.dailyObservationContract) !== (runConfig.priceResearch?.dailyObservationContract)) ||
    !same(frozen, sourceRef) ||
    childRef.responseHash !== marketFrozenWindowHashV3(response) ||
    childRef.identityFingerprint !== json('identityFingerprint') ||
    row.barRowsFingerprint !== hashCanonicalManifest(rows) ||
    !same(rows, signalRowsV3(response, plan.symbol, runConfig)) ||
    !manifest.actualSources.some((source) => same(source, actualSource))
  )
    throw signalInputError('额外信号来源、窗口、身份或内容不一致');
  assertSignalPriceClockV3(response, runConfig);
  assertSignalWarmupV3(plan, response, runConfig);
  assertSignalPriceBasisV3(response, runConfig, actualBasis);
  return actualSource;
}

function signalRowsV3(
  response: ReturnType<typeof parseMarketWindowEvidenceResponseV3>,
  symbol: string,
  runConfig: RunConfigV3,
): ArtifactRow[] {
  return executionBarRowsV3(
    response,
    symbol,
    runConfig.executionPriceProtocol,
    Boolean(runConfig.priceResearch),
  ).map((row) => ({ ...row, purpose: 'signal' }));
}
function assertSignalPriceBasisV3(
  response: ReturnType<typeof parseMarketWindowEvidenceResponseV3>,
  runConfig: RunConfigV3,
  actualBasis?: ReturnType<typeof parseMarketWindowEvidenceResponseV3>['sourcePriceBasis'],
) {
  const basis = response.sourcePriceBasis;
  const expected =
    basis.adjustment === 'none' && runConfig.priceResearch
      ? actualBasis
      : runConfig.executionPriceProtocol.priceBasis;
  const coordinate = (value: unknown) =>
    Object.fromEntries(
      Object.entries(value as Record<string, unknown>).filter(
        ([key]) => !['quantityBasis', 'observedAt'].includes(key),
      ),
    );
  if (!expected || !same(coordinate(basis), coordinate(expected)))
    throw signalInputError('额外周期的价格或成交量口径与冻结坐标不一致，不能直接比较');
}

function assertSignalWarmupV3(
  plan: Plan,
  response: ReturnType<typeof parseMarketWindowEvidenceResponseV3>,
  runConfig: RunConfigV3,
) {
  const rows = response.bars.filter((bar) => bar.timestamp.slice(0, 10) < runConfig.startDate);
  if (rows.length < plan.minimumWarmupRows)
    throw signalInputError(`额外信号来源 ${plan.routeKey.timeframe} 缺少实际预热观测`);
}
