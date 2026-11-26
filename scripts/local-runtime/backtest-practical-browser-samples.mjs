import { readFile } from 'node:fs/promises';
import { backtestRunPreparationResultV3Schema, backtestRunDetailReadSchema,
  strategySchema, projectPriceResearchStrategy } from '../../packages/schemas/dist/index.js';
const load = async (name) => JSON.parse(await readFile(new URL(`../../packages/schemas/fixtures/${name}`, import.meta.url), 'utf8'));
export async function practicalBrowserSamples() {
  const manifest = await load('backtest-snapshot-v3.manifest.json');
  const stamp = await load('backtest-preparation-stamp-v3.json');
  const model = await load('backtest-execution-model.cn-2024q1.json');
  model.scope.symbol = '159516.SZ'; model.scope.instrumentType = 'ETF';
  for (const segment of model.segments) {
    segment.execution.price = { kind: 'noDailyLimit', reason: '隔离归一化价格研究样本' };
    segment.execution.normalizedExecution = { priceCoordinate: 'continuous-decimal',
      quantityUnits: 'continuous-normalized-decimal', lotSizeConstraint: 'not-applied',
      tickSizeConstraint: 'not-applied', dailyPriceLimit: 'not-applied', feeBasis: 'simulatedTurnover' };
  }
  const basis = { ...manifest.executionPriceProtocol.priceBasis, adjustment: 'hfq' };
  const protocol = { ...manifest.executionPriceProtocol, priceBasis: basis };
  const scope = { version: 1, executionInstrument: { symbol: '159516.SZ', market: 'CN', assetType: 'etf' },
    priceCoordinates: ['research'], sizingModes: ['fixedAmount', 'equityRatio'], unavailableCapabilities: [],
    sources: [{ sourceId: 'execution', coordinate: 'research', timeframe: '1d',
      fields: ['open', 'high', 'low', 'close'], warmupRows: 30, observedRows: 100, volumeBasis: 'unknown',
      fieldWindows: ['open', 'high', 'low', 'close'].map((field) => ({ field, validRows: 100, warmupRows: 30, longestWindowRows: 100 })) }] };
  const runConfig = { schemaVersion: '3', startDate: '2024-01-02', endDate: '2024-03-29',
    dataAsOf: '2026-11-20T08:00:00Z', baseCurrency: 'CNY', initialCash: { CNY: '10000' },
    valuationPolicy: { baseTimezone: 'Asia/Shanghai', dailyValuationTime: '15:00', pricePolicy: 'latestAvailable', fxPolicy: 'latestAvailable' },
    executionPriceProtocol: protocol, executionModel: model,
    priceInputBindings: { signals: [], benchmark: { binding: 'execution-series' } },
    priceResearch: { protocolVersion: 'price-research-v1', dailyObservationContract: 'market-daily-tradability-window-v1', dataScope: scope } };
  const actualSource = { ...manifest.actualSources[0], routeKey: { ...manifest.actualSources[0].routeKey, adjustment: 'hfq' } };
  const ready = { contractVersion: 1, requestId: 'browser', checkedAt: runConfig.dataAsOf, status: 'ready', revisionStamp: stamp, diagnostics: [] };
  const prepared = backtestRunPreparationResultV3Schema.parse({ contractVersion: 1, requestId: 'browser',
    checkedAt: runConfig.dataAsOf, scope: 'execution-window', status: 'prepared', runConfig, actualSource, executionPreflight: ready });
  const blocked = backtestRunPreparationResultV3Schema.parse({ contractVersion: 1, requestId: 'browser', checkedAt: runConfig.dataAsOf,
    scope: 'execution-window', status: 'blocked', diagnostics: [{ severity: 'error', category: 'data-unavailable', code: 'DATA_UNAVAILABLE',
      message: '入场规则需要research／1d的volume二十根连续输入，当前未取得成交量。', symbol: '159516.SZ', capability: 'DAILY_BAR', purpose: 'signal',
      dateRange: { startDate: '2024-01-02', endDate: '2024-03-29' }, routeKey: null, missingFields: ['volume'], incompatibleRules: ['entry'],
      targetSources: [], suggestedActions: [{ action: 'retry-preflight', description: '恢复成交量来源后重新准备' }] }] });
  const id = '11111111-1111-4111-8111-111111111901';
  const childId = '11111111-1111-4111-8111-111111111902';
  const originalStrategy = strategySchema.parse(await load('backtest-v2.exchange.json'));
  originalStrategy.executionInstrument = scope.executionInstrument;
  originalStrategy.signalSources = originalStrategy.signalSources.filter((source) => source.id === 'execution')
    .map((source) => ({ ...source, asset: scope.executionInstrument }));
  originalStrategy.entry = { type: 'compare', operator: 'gt',
    left: { type: 'indicator', name: 'MA', input: { type: 'series', sourceId: 'execution', field: 'close' }, params: { period: 5 } },
    right: { type: 'indicator', name: 'MA', input: { type: 'series', sourceId: 'execution', field: 'close' }, params: { period: 10 } } };
  const strategy = projectPriceResearchStrategy(originalStrategy);
  strategy.entryTrigger = 'rising-edge';
  const strategyRecord = { id: 'practical-strategy', name: '隔离价格研究', versions: [{ id: stamp.strategyVersionId, version: 1, schemaVersion: 3, schema: strategy }] };
  const base = { id, strategyVersionId: stamp.strategyVersionId, mode: 'V3', status: 'running',
    stage: 'preparing', progress: 10, executionAttempt: 1, snapshotId: null, runConfig,
    input: { runConfig }, createdAt: '2026-11-20T08:00:00Z', updatedAt: '2026-11-20T08:01:00Z',
    periodStart: '2024-01-02', periodEnd: '2024-03-29',
    readEligibility: { state: 'readable', code: 'READABLE', scope: 'none', accessedAt: null, revealedAt: null } };
  const result = { source: 'BACKTEST', runId: id, strategyVersionId: base.strategyVersionId,
    snapshotId: 'browser-frozen', engineVersion: 'thesis-ledger-v3-local-runner-v5', schemaVersion: '3',
    snapshotVersion: 'snapshot-manifest-v3', marketRuleVersion: 'v1', calendarVersion: 'v1', aggregationVersion: 'v1',
    contentHash: 'browser-frozen', resultChecksum: 'browser-result', completeness: 'complete',
    executionPriceProtocol: protocol, comparableDataFingerprint: manifest.comparableDataFingerprint,
    actualSources: [actualSource], warnings: [], rejectedOrders: [], simulationFills: [], trades: [],
    equityCurve: ['2024-01-02', '2024-03-29'].map((date) => ({ occurredAt: `${date}T07:00:00Z`, value: { amount: '10000', currency: 'CNY' } })),
    metrics: { totalReturn: { status: 'available', value: '0' }, maxDrawdown: { status: 'available', value: '0' },
      tradedNotional: { status: 'available', value: '15000' }, turnoverRate: { status: 'available', value: '1.5' },
      sharpe: { status: 'unavailable', reason: 'ZERO_VOLATILITY' } },
    ruleDiagnostics: { version: 'rule-evaluation-v1', rules: [{ ruleId: 'entry', path: ['entry'], observations: 10,
      computableObservations: 10, trueObservations: 0, applicableDecisions: 10, computableDecisions: 10,
      warmupObservations: 0, unavailableReasons: [] }] } };
  const succeeded = backtestRunDetailReadSchema.parse({ ...base, status: 'succeeded', stage: 'succeeded', progress: 100,
    snapshotId: result.snapshotId, result, updatedAt: '2026-11-20T08:02:00Z' });
  return { base, succeeded, prepared, blocked, ready, model, strategyRecord, id, childId };
}
