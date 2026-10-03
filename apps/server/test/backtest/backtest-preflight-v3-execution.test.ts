import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  backtestPreflightRequestV3Schema,
  marketDataBarSeriesRequestV3Schema,
  marketDataBarSeriesResponseV3Schema,
  runConfigSchemaV3,
  strategySchema,
  type MarketDataBarSeriesResponseV3,
  type RunConfigV3,
  type BacktestStrategy,
} from '@thesis-ledger/schemas';
import { planBacktestDependencies } from '../../src/backtest/backtest-dependency-plan.js';
import {
  deriveRunConfigChecksum,
  hashCanonicalManifest,
} from '../../src/backtest/backtest-snapshot.js';
import {
  preflightBacktestExecutionWindowV3,
  type BacktestExecutionWindowPreflightInputV3,
} from '../../src/backtest/backtest-preflight-v3-execution.js';
import type { MarketBarWindowReadResultV3 } from '../../src/market/market-bar-reader-v3.js';
import type {
  PinnedMarketWindowRequestV3,
  StoredMarketWindowEvidenceV3,
} from '../../src/market/market-window-evidence-v3.repository.js';

const readFixture = <T>(path: string): T =>
  JSON.parse(
    readFileSync(new URL(`../../../../packages/schemas/fixtures/${path}`, import.meta.url), 'utf8'),
  ) as T;

const responseTemplate = readFixture<Record<string, unknown>>(
  'market-data-v3.response.etf-qfq.json',
);
const executionModel = readFixture<unknown>('backtest-execution-model.cn-2024q1.json');
const target = { providerId: 'hithink', upstreamSource: 'hithink-financial-api' };
const checkedAt = '2026-05-21T08:00:00.000Z';

const strategyValue = (): BacktestStrategy =>
  strategySchema.parse({
    schemaVersion: '2',
    name: 'execution preflight',
    signalSources: [
      {
        id: 'execution-close',
        asset: { symbol: '600519.SH', market: 'CN', assetType: 'stock' },
        timeframe: '1d',
        series: ['close'],
      },
    ],
    executionInstrument: { symbol: '600519.SH', market: 'CN', assetType: 'stock' },
    primaryTimeframe: '1d',
    entry: {
      type: 'compare',
      operator: 'gt',
      left: {
        type: 'indicator',
        name: 'MA',
        input: { type: 'series', sourceId: 'execution-close', field: 'close' },
        params: { period: 5 },
      },
      right: { type: 'constant', value: '0' },
    },
    exit: { type: 'positionState', field: 'isOpen' },
    sizing: { type: 'percentOfEquity', percent: '1' },
    risk: [],
    execution: {
      mode: 'exchange',
      orderType: 'market',
      timeInForce: 'DAY',
      timing: 'nextEligibleBarOpen',
    },
    cost: { commissionRate: '0', slippageRate: '0' },
  }) as BacktestStrategy;

const basisFromTemplate = () => {
  const sourcePriceBasis = {
    ...(responseTemplate.sourcePriceBasis as Record<string, unknown>),
  };
  delete sourcePriceBasis.quantityBasis;
  return {
    ...sourcePriceBasis,
    quantityBasis: 'normalized-units' as const,
  } as Record<string, unknown> & { quantityBasis: 'normalized-units' };
};

const normalizedExecutionModel = () => {
  const model = structuredClone(executionModel) as {
    segments: Array<{ execution: Record<string, unknown> }>;
  } & Record<string, unknown>;
  for (const segment of model.segments) {
    const execution = segment.execution;
    execution.price = {
      kind: 'noDailyLimit',
      reason: '归一化连续价格坐标不沿用原始价格限制',
    };
    execution.normalizedExecution = {
      priceCoordinate: 'continuous-decimal',
      quantityUnits: 'continuous-normalized-decimal',
      lotSizeConstraint: 'not-applied',
      tickSizeConstraint: 'not-applied',
      dailyPriceLimit: 'not-applied',
      feeBasis: 'simulatedTurnover',
    };
  }
  return model;
};

const runConfigValue = (
  options: { pointInTime?: boolean; observedAt?: string } = {},
): RunConfigV3 => {
  const sourcePriceBasis = basisFromTemplate();
  if (options.pointInTime) {
    sourcePriceBasis.basisScope = 'request-window';
    sourcePriceBasis.anchor = '2024-02-29';
    sourcePriceBasis.observedAt = options.observedAt ?? '2024-03-01T04:01:00.000Z';
    sourcePriceBasis.conversionAvailable = true;
    sourcePriceBasis.conversionEvidenceRef = 'conversion-evidence-1';
  }
  return runConfigSchemaV3.parse({
    schemaVersion: '3',
    startDate: '2024-02-01',
    endDate: '2024-02-29',
    dataAsOf: options.pointInTime ? '2024-03-04T08:00:00.000Z' : checkedAt,
    baseCurrency: 'CNY',
    initialCash: { CNY: '100000' },
    executionModel: normalizedExecutionModel(),
    valuationPolicy: {
      baseTimezone: 'Asia/Shanghai',
      dailyValuationTime: '15:00',
      pricePolicy: 'latestAvailable',
      fxPolicy: 'latestAvailable',
    },
    executionPriceProtocol: {
      protocolVersion: 'execution-price-v1',
      accountingBasis: 'normalized-series',
      priceBasis: sourcePriceBasis,
      history: options.pointInTime
        ? { basis: 'point-in-time', reconstructionEvidenceRef: 'reconstruction-evidence-1' }
        : { basis: 'fixed-provider-snapshot' },
    },
  }) as RunConfigV3;
};

const allWeekdays = (start: string, end: string) => {
  const dates: string[] = [];
  const date = new Date(`${start}T00:00:00.000Z`);
  const final = new Date(`${end}T00:00:00.000Z`);
  while (date <= final) {
    const day = date.getUTCDay();
    if (day !== 0 && day !== 6) dates.push(date.toISOString().slice(0, 10));
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return dates;
};

const makeResponse = (
  request: PinnedMarketWindowRequestV3,
  options: { pointInTime?: boolean; wrongBasis?: boolean; futureObservation?: boolean } = {},
): MarketDataBarSeriesResponseV3 => {
  const response = structuredClone(responseTemplate) as unknown as MarketDataBarSeriesResponseV3;
  const sessions = allWeekdays(request.start, request.end);
  const templateBar = response.bars[0]!;
  response.requestId = request.requestId;
  response.symbol = request.symbol;
  response.routeKey = request.routeKey;
  response.bars = sessions.map((date, index) => ({
    ...templateBar,
    timestamp: `${date}T07:00:00.000Z`,
    availableAt: `${date}T07:00:00.000Z`,
    open: 1 + index / 1000,
    high: 1.02 + index / 1000,
    low: 0.99 + index / 1000,
    close: 1.01 + index / 1000,
  }));
  response.coverage = {
    requestedStart: request.start,
    requestedEnd: request.end,
    actualStart: `${sessions[0]}T07:00:00.000Z`,
    actualEnd: `${sessions.at(-1)}T07:00:00.000Z`,
    hasMoreBefore: false,
    latestCompleteTradingDate: sessions[sessions.length - 1]!,
  };
  response.coverageProof.calendar.expectedSessionDates = sessions;
  response.coverageProof.listing.symbol = request.symbol;
  response.coverageProof.window.requestedStart = request.start;
  response.coverageProof.window.requestedEnd = request.end;
  response.provenance = {
    ...response.provenance,
    providerId: request.routeTarget.providerId,
    upstreamSource: request.routeTarget.upstreamSource,
    routeIndex: request.routeTarget.routeIndex,
  };
  if (options.pointInTime) {
    response.sourcePriceBasis = {
      ...response.sourcePriceBasis,
      basisScope: 'request-window',
      anchor: '2024-02-29',
      observedAt: '2024-03-01T04:01:00.000Z',
      conversionAvailable: true,
      conversionEvidenceRef: 'conversion-evidence-1',
    };
  }
  if (options.wrongBasis) response.sourcePriceBasis.volumeBasis = 'original';
  if (options.futureObservation) {
    response.sourcePriceBasis = {
      ...response.sourcePriceBasis,
      basisScope: 'request-window',
      anchor: request.end,
      observedAt: '2024-03-05T00:00:00.000Z',
      conversionAvailable: true,
      conversionEvidenceRef: 'conversion-evidence-1',
    };
  }
  return marketDataBarSeriesResponseV3Schema.parse(response) as MarketDataBarSeriesResponseV3;
};

type ValidFixture = {
  input: Omit<BacktestExecutionWindowPreflightInputV3, 'reader'>;
  result: MarketBarWindowReadResultV3;
};

const validFixture = (
  options: { pointInTime?: boolean; wrongBasis?: boolean; futureObservation?: boolean } = {},
): ValidFixture => {
  const strategy = strategyValue();
  const runConfig = runConfigValue({
    ...(options.pointInTime ? { pointInTime: true } : {}),
    ...(options.futureObservation ? { observedAt: '2024-03-05T00:00:00.000Z' } : {}),
  });
  const dependencyPlan = planBacktestDependencies({ strategy, runConfig });
  const dataset = dependencyPlan.datasets.find((candidate) => candidate.purpose === 'execution');
  if (!dataset) throw new Error('fixture planner must produce an execution dataset');
  const routeKey = {
    kind: 'bar',
    market: 'CN',
    assetType: 'STOCK',
    capability: 'DAILY_BAR',
    timeframe: '1d',
    adjustment: 'qfq',
  } as const;
  const requirement = {
    symbol: '600519.SH',
    capability: 'DAILY_BAR',
    purpose: 'execution',
    dateRange: dataset.range,
    routeKey,
  };
  const request = backtestPreflightRequestV3Schema.parse({
    contractVersion: 3,
    requestId: 'execution-window-preflight-1',
    strategyVersionId: 'strategy-version-1',
    strategyContentHash: hashCanonicalManifest(strategy),
    runConfigChecksum: deriveRunConfigChecksum(runConfig),
    requirements: [requirement],
  });
  const routeTarget = { ...target, routeIndex: 0 as const };
  const pinnedRequest = marketDataBarSeriesRequestV3Schema.parse({
    contractVersion: 3,
    requestId: 'window-read-1',
    symbol: '600519.SH',
    routeKey,
    routeTarget,
    start: dataset.range.startDate,
    end: dataset.range.endDate,
  }) as PinnedMarketWindowRequestV3;
  const response = makeResponse(pinnedRequest, options);
  const desiredRevision = 7;
  const effectivePolicyRevision = response.provenance.effectivePolicyRevision;
  const catalogRevision = 12;
  const seriesVersion = options.pointInTime
    ? `market-series-v1:identified:${'a'.repeat(64)}`
    : `market-series-v1:unknown:${'b'.repeat(64)}`;
  const evidence: StoredMarketWindowEvidenceV3 = {
    identityFingerprint: 'e'.repeat(64),
    routeKey,
    target: routeTarget,
    symbol: pinnedRequest.symbol,
    window: { start: pinnedRequest.start, end: pinnedRequest.end },
    seriesVersion,
    inputFingerprint: response.inputFingerprint,
    desiredRevision,
    effectivePolicyRevision,
    catalogRevision,
    sourcePriceBasis: response.sourcePriceBasis,
    coverageProof: response.coverageProof,
    fetchedAt: new Date(options.pointInTime ? '2024-03-01T04:01:00.000Z' : checkedAt),
  };
  return {
    input: {
      strategy,
      runConfig,
      dependencyPlan,
      context: {
        request,
        checkedAt,
        routeRevisions: {
          desiredRevision,
          effectiveRevision: effectivePolicyRevision,
          catalogRevision,
          targetSources: [routeTarget],
        },
      },
    },
    result: {
      status: 'selected',
      request: pinnedRequest,
      seriesVersion,
      evidence,
      selection: {
        status: 'selected',
        source: 'primary',
        response,
        target,
        routeIndex: 0,
        desiredRevision,
        effectivePolicyRevision,
        catalogRevision,
      },
    },
  };
};

const readerFor = (result: MarketBarWindowReadResultV3) => ({
  readV3: vi.fn().mockResolvedValue(result),
});

const refreshFixtureChecksum = (fixture: ValidFixture) => {
  fixture.input.context.request.runConfigChecksum = deriveRunConfigChecksum(fixture.input.runConfig);
};

describe('execution-window V3 preflight', () => {
  it('reads the exact planned window once and returns a comparable revision stamp', async () => {
    const fixture = validFixture();
    const reader = readerFor(fixture.result);
    const result = await preflightBacktestExecutionWindowV3({ ...fixture.input, reader });

    expect(result.status).toBe('ready');
    expect(result.revisionStamp).toMatchObject({
      desiredRevision: 7,
      effectiveRevision: 1,
      catalogRevision: 12,
    });
    expect(reader.readV3).toHaveBeenCalledTimes(1);
    expect(reader.readV3).toHaveBeenCalledWith({
      market: 'CN',
      tradabilityMode: 'assume-untradable-no-bar',
      priceResearch: true,
      symbol: '600519.SH',
      routeKey: fixture.result.status === 'selected' ? fixture.result.request.routeKey : null,
      window: {
        start: fixture.result.status === 'selected' ? fixture.result.request.start : '',
        end: fixture.result.status === 'selected' ? fixture.result.request.end : '',
      },
    });
  });

  it('maps a missing window as insufficient coverage and does not infer suspension', async () => {
    const fixture = validFixture();
    const reader = readerFor({
      status: 'unavailable',
      selection: {
        status: 'unavailable',
        reason: 'primary_unavailable',
        primaryFailure: 'missing_window',
      },
    });
    const result = await preflightBacktestExecutionWindowV3({ ...fixture.input, reader });

    expect(result.status).toBe('blocked');
    expect(result.diagnostics[0]).toMatchObject({
      category: 'insufficient-coverage',
      missingFields: ['coverageProof.completeRequestedWindow'],
    });
    expect(result.diagnostics[0]?.message).not.toMatch(/停牌/);
  });

  it('distinguishes pre-listing evidence from a missing requested window', async () => {
    const fixture = validFixture();
    const reader = readerFor({
      status: 'unavailable',
      selection: {
        status: 'unavailable',
        reason: 'primary_unavailable',
        primaryFailure: 'pre_listing',
      },
    });
    const result = await preflightBacktestExecutionWindowV3({ ...fixture.input, reader });

    expect(result.status).toBe('blocked');
    expect(result.diagnostics[0]).toMatchObject({
      category: 'insufficient-coverage',
      message: '执行窗口早于已证明上市日期。',
      missingFields: ['coverageProof.listing.firstTradingDate'],
    });
  });

  it('reports insufficient warmup separately from run-window coverage', async () => {
    const fixture = validFixture({ pointInTime: true });
    const reader = readerFor({
      status: 'unavailable',
      selection: {
        status: 'unavailable',
        reason: 'primary_unavailable',
        primaryFailure: 'insufficient_warmup',
      },
    });
    const result = await preflightBacktestExecutionWindowV3({ ...fixture.input, reader });

    expect(result.status).toBe('blocked');
    expect(result.diagnostics[0]).toMatchObject({
      category: 'insufficient-coverage',
      message: '执行行情窗口未提供依赖计划要求的完整预热交易日。',
      missingFields: ['coverageProof.warmupSessions'],
    });
  });

  it('rejects source price basis facts that differ from the frozen protocol', async () => {
    const fixture = validFixture({ wrongBasis: true });
    const reader = readerFor(fixture.result);
    const result = await preflightBacktestExecutionWindowV3({ ...fixture.input, reader });

    expect(result.status).toBe('blocked');
    expect(result.diagnostics[0]).toMatchObject({
      category: 'incompatible-price-basis',
      incompatibleRules: ['sourcePriceBasis.volumeBasis'],
    });
  });

  it('blocks PIT data observed after dataAsOf even when the selected series is identified', async () => {
    const fixture = validFixture({ pointInTime: true, futureObservation: true });
    const reader = readerFor(fixture.result);
    const result = await preflightBacktestExecutionWindowV3({ ...fixture.input, reader });

    expect(result.status).toBe('blocked');
    expect(result.diagnostics[0]).toMatchObject({
      category: 'point-in-time-unavailable',
      code: 'FUTURE_DATA',
      missingFields: ['sourcePriceBasis.observedAt'],
    });
  });

  it('blocks a fixed snapshot whose matching source observation is after the freeze cutoff', async () => {
    const fixture = validFixture();
    if (fixture.result.status !== 'selected') throw new Error('selected fixture required');
    const observedAt = '2026-05-22T08:00:00.000Z';
    fixture.input.runConfig.executionPriceProtocol.priceBasis.observedAt = observedAt;
    fixture.result.selection.response.sourcePriceBasis.observedAt = observedAt;
    refreshFixtureChecksum(fixture);
    const reader = readerFor(fixture.result);
    const result = await preflightBacktestExecutionWindowV3({ ...fixture.input, reader });

    expect(result.status).toBe('blocked');
    expect(result.diagnostics[0]).toMatchObject({
      category: 'point-in-time-unavailable',
      code: 'FUTURE_DATA',
      missingFields: ['sourcePriceBasis.observedAt'],
      suggestedActions: [{ action: 'repair-price-series' }],
    });
    expect(reader.readV3).toHaveBeenCalledTimes(1);
  });

  it('blocks a source observation one microsecond after dataAsOf', async () => {
    const fixture = validFixture();
    if (fixture.result.status !== 'selected') throw new Error('selected fixture required');
    const observedAt = '2026-05-21T08:00:00.000001Z';
    fixture.input.runConfig.executionPriceProtocol.priceBasis.observedAt = observedAt;
    fixture.result.selection.response.sourcePriceBasis.observedAt = observedAt;
    refreshFixtureChecksum(fixture);
    const result = await preflightBacktestExecutionWindowV3({
      ...fixture.input, reader: readerFor(fixture.result),
    });
    expect(result.status).toBe('blocked');
    expect(result.diagnostics[0]).toMatchObject({
      code: 'FUTURE_DATA', missingFields: ['sourcePriceBasis.observedAt'],
    });
  });

  it('blocks a Bar available one microsecond after dataAsOf', async () => {
    const fixture = validFixture();
    if (fixture.result.status !== 'selected') throw new Error('selected fixture required');
    fixture.result.selection.response.bars.at(-1)!.availableAt = '2026-05-21T08:00:00.000001Z';
    const result = await preflightBacktestExecutionWindowV3({
      ...fixture.input, reader: readerFor(fixture.result),
    });
    expect(result.status).toBe('blocked');
    expect(result.diagnostics[0]).toMatchObject({
      code: 'FUTURE_DATA', missingFields: ['bars.timestamp', 'bars.availableAt'],
    });
  });

  it('blocks a selected window fetched after dataAsOf', async () => {
    const fixture = validFixture();
    if (fixture.result.status !== 'selected') throw new Error('selected fixture required');
    fixture.result.evidence.fetchedAt = new Date('2026-05-21T08:00:00.001Z');
    const result = await preflightBacktestExecutionWindowV3({
      ...fixture.input, reader: readerFor(fixture.result),
    });
    expect(result.status).toBe('blocked');
    expect(result.diagnostics[0]).toMatchObject({
      code: 'FUTURE_DATA', missingFields: ['evidence.fetchedAt'],
    });
  });

  it.each([false, true])('blocks future Bar visibility with pointInTime=%s', async (pointInTime) => {
    const fixture = validFixture({ pointInTime });
    if (fixture.result.status !== 'selected') throw new Error('selected fixture required');
    fixture.result.selection.response.bars.at(-1)!.availableAt = '2026-05-22T08:00:00.000Z';
    const reader = readerFor(fixture.result);
    const result = await preflightBacktestExecutionWindowV3({ ...fixture.input, reader });

    expect(result.status).toBe('blocked');
    expect(result.diagnostics[0]).toMatchObject({
      code: 'FUTURE_DATA',
      missingFields: ['bars.timestamp', 'bars.availableAt'],
    });
    expect(reader.readV3).toHaveBeenCalledTimes(1);
  });

  it('keeps the historical price times and actual research observation at the freeze boundary', async () => {
    const fixture = validFixture();
    if (fixture.result.status !== 'selected') throw new Error('selected fixture required');
    const response = fixture.result.selection.response;
    response.sourcePriceBasis.observedAt = fixture.input.runConfig.dataAsOf;
    fixture.input.runConfig.executionPriceProtocol.priceBasis.observedAt = fixture.input.runConfig.dataAsOf;
    for (const bar of response.bars) bar.availableAt = fixture.input.runConfig.dataAsOf;
    refreshFixtureChecksum(fixture);
    const original = structuredClone(response);
    const result = await preflightBacktestExecutionWindowV3({
      ...fixture.input, reader: readerFor(fixture.result),
    });

    expect(result.status).toBe('ready');
    expect(response).toEqual(original);
    expect(response.bars[0]!.timestamp).toMatch(/^2024-/);
    expect(response.bars[0]!.availableAt).toBe(checkedAt);
  });

  it('accepts the same unknown series for fixed research and rejects it for strict PIT', async () => {
    const fixture = validFixture();
    const reader = readerFor(fixture.result);
    const original = structuredClone(fixture.result);
    const fixed = await preflightBacktestExecutionWindowV3({ ...fixture.input, reader });
    fixture.input.runConfig.executionPriceProtocol.history = {
      basis: 'point-in-time', reconstructionEvidenceRef: 'controlled-archive-ref',
    };
    refreshFixtureChecksum(fixture);
    const strict = await preflightBacktestExecutionWindowV3({ ...fixture.input, reader });

    expect(fixed.status).toBe('ready');
    expect(strict.status).toBe('blocked');
    expect(strict.diagnostics[0]?.missingFields).toContain('knownProviderSeriesRevision');
    expect(fixture.result).toEqual(original);
    expect(reader.readV3).toHaveBeenCalledTimes(2);
  });

  it('blocks identified PIT inputs when no actual reconstruction evidence is injected', async () => {
    const fixture = validFixture({ pointInTime: true });
    const reader = readerFor(fixture.result);
    const result = await preflightBacktestExecutionWindowV3({ ...fixture.input, reader });

    expect(result.status).toBe('blocked');
    expect(result.diagnostics[0]).toMatchObject({ category: 'point-in-time-unavailable',
      code: 'DATA_UNAVAILABLE', missingFields: ['verifiedReconstructionEvidence'] });
    expect(fixture.input.runConfig.executionPriceProtocol.history.basis).toBe('point-in-time');
    expect(reader.readV3).toHaveBeenCalledTimes(1);
  });

  it.each(['missing', 'read-error'] as const)('strict PIT reconstruction %s fails closed after the selected window', async (kind) => {
    const fixture = validFixture({ pointInTime: true });
    const read = vi.fn(async () => {
      if (kind === 'read-error') throw new Error('private-provider-error');
      return null;
    });
    const result = await preflightBacktestExecutionWindowV3({ ...fixture.input,
      reader: readerFor(fixture.result), reconstruction: { bindSourceTimes: read } });
    expect(result.status).toBe('blocked');
    expect(result.diagnostics[0]?.missingFields).toContain('verifiedReconstructionEvidence');
    expect(read).toHaveBeenCalledTimes(1);
    expect(read.mock.calls[0]).toHaveLength(2);
    expect(JSON.stringify(result)).not.toContain('private-provider-error');
  });

  it.each(['unknown', 'incomplete'] as const)('blocks %s Bar status rather than inventing completion', async (status) => {
    const fixture = validFixture();
    if (fixture.result.status !== 'selected') throw new Error('selected fixture required');
    fixture.result.selection.response.bars[0]!.completionStatus = status;
    const reader = readerFor(fixture.result);
    const result = await preflightBacktestExecutionWindowV3({ ...fixture.input, reader });

    expect(result.status).toBe('blocked');
    expect(result.diagnostics[0]?.missingFields).toContain('requestResponseCorrelation');
    expect(fixture.result.selection.response.bars[0]!.completionStatus).toBe(status);
    expect(reader.readV3).toHaveBeenCalledTimes(1);
  });

  it('rejects an empty PIT reconstruction reference before invoking the Reader', async () => {
    const fixture = validFixture({ pointInTime: true });
    fixture.input.runConfig.executionPriceProtocol.history = {
      basis: 'point-in-time', reconstructionEvidenceRef: '',
    };
    refreshFixtureChecksum(fixture);
    const reader = readerFor(fixture.result);
    const result = await preflightBacktestExecutionWindowV3({ ...fixture.input, reader });

    expect(result.status).toBe('invalid-input');
    expect(reader.readV3).not.toHaveBeenCalled();
  });

  it('blocks a historical window whose last price is later than the freeze cutoff', async () => {
    const fixture = validFixture();
    if (fixture.result.status !== 'selected') throw new Error('selected fixture required');
    fixture.input.runConfig.dataAsOf = '2024-02-29T06:59:00.000Z';
    fixture.input.runConfig.executionPriceProtocol.priceBasis.observedAt = '2024-02-29T06:58:00.000Z';
    fixture.result.selection.response.sourcePriceBasis.observedAt = '2024-02-29T06:58:00.000Z';
    fixture.result.evidence.fetchedAt = new Date('2024-02-29T06:58:00.000Z');
    refreshFixtureChecksum(fixture);
    const result = await preflightBacktestExecutionWindowV3({
      ...fixture.input, reader: readerFor(fixture.result),
    });

    expect(result.status).toBe('blocked');
    expect(result.diagnostics[0]).toMatchObject({
      code: 'FUTURE_DATA', missingFields: ['bars.timestamp', 'bars.availableAt'],
    });
  });

  it.each([null, '2030-01-01'] as const)('does not downgrade PIT for anchor=%s', async (anchor) => {
    const fixture = validFixture({ pointInTime: true });
    if (fixture.result.status !== 'selected') throw new Error('selected fixture required');
    const basis = fixture.input.runConfig.executionPriceProtocol.priceBasis;
    basis.anchor = anchor;
    basis.conversionAvailable = false;
    fixture.result.selection.response.sourcePriceBasis.anchor = anchor;
    fixture.result.selection.response.sourcePriceBasis.conversionAvailable = false;
    refreshFixtureChecksum(fixture);
    const result = await preflightBacktestExecutionWindowV3({
      ...fixture.input, reader: readerFor(fixture.result),
    });

    expect(result.status).toBe('blocked');
    expect(result.diagnostics[0]).toMatchObject({
      code: anchor === null ? 'DATA_UNAVAILABLE' : 'FUTURE_DATA',
      missingFields: ['sourcePriceBasis.anchor'],
    });
    expect(fixture.input.runConfig.executionPriceProtocol.history.basis).toBe('point-in-time');
  });

  it('rejects a pinned target or window that disagrees with the preflight revision context', async () => {
    const fixture = validFixture();
    if (fixture.result.status !== 'selected') throw new Error('fixture result should be selected');
    const wrongTarget = {
      ...fixture.result,
      request: {
        ...fixture.result.request,
        routeTarget: { ...fixture.result.request.routeTarget, providerId: 'other-provider' },
      } as PinnedMarketWindowRequestV3,
    };
    const reader = readerFor(wrongTarget);
    const result = await preflightBacktestExecutionWindowV3({ ...fixture.input, reader });

    expect(result.status).toBe('blocked');
    expect(result.diagnostics[0]?.missingFields).toContain('exactExecutionRouteRevisionMatch');
  });

  it.each(['strategyContentHash', 'runConfigChecksum'] as const)(
    'rejects changed %s before reading market data',
    async (field) => {
      const fixture = validFixture();
      const reader = readerFor(fixture.result);
      if (field === 'strategyContentHash') {
        fixture.input.strategy.name = '修改后的策略';
      } else {
        fixture.input.runConfig.initialCash.CNY = '200000';
      }
      const result = await preflightBacktestExecutionWindowV3({ ...fixture.input, reader });

      expect(result.status).toBe('invalid-input');
      expect(result.revisionStamp).toBeNull();
      expect(result.diagnostics[0]?.missingFields).toContain(field);
      expect(reader.readV3).not.toHaveBeenCalled();
    },
  );

  it.each(['desiredRevision', 'effectivePolicyRevision', 'catalogRevision'] as const)(
    'blocks a Reader result whose %s changed during preflight',
    async (field) => {
      const fixture = validFixture();
      if (fixture.result.status !== 'selected') throw new Error('selected fixture required');
      fixture.result.selection[field] += 1;
      const reader = readerFor(fixture.result);
      const result = await preflightBacktestExecutionWindowV3({ ...fixture.input, reader });

      expect(result.status).toBe('blocked');
      expect(result.diagnostics[0]?.missingFields).toContain('exactExecutionRouteRevisionMatch');
      expect(result.diagnostics[0]?.suggestedActions[0]?.action).toBe('retry-preflight');
      expect(reader.readV3).toHaveBeenCalledTimes(1);
    },
  );

  it('does not call the Reader when route revisions are absent', async () => {
    const fixture = validFixture();
    const reader = readerFor(fixture.result);
    const input = {
      ...fixture.input,
      context: {
        ...fixture.input.context,
        routeRevisions: {
          ...fixture.input.context.routeRevisions,
          effectiveRevision: null,
        },
      },
    };
    const result = await preflightBacktestExecutionWindowV3({ ...input, reader });

    expect(result.status).toBe('blocked');
    expect(result.diagnostics[0]?.missingFields).toContain('effectiveRevision');
    expect(reader.readV3).not.toHaveBeenCalled();
  });

  it('rejects incomplete request contract before reading', async () => {
    const fixture = validFixture();
    const reader = readerFor(fixture.result);
    const input = {
      ...fixture.input,
      context: {
        ...fixture.input.context,
        request: { ...fixture.input.context.request, extra: true },
      },
    };
    const result = await preflightBacktestExecutionWindowV3({
      ...input,
      context: input.context as BacktestExecutionWindowPreflightInputV3['context'],
      reader,
    });

    expect(result.status).toBe('invalid-input');
    expect(reader.readV3).not.toHaveBeenCalled();
  });
});
