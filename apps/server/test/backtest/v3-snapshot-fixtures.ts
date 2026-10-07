import { readFile } from 'node:fs/promises';
import { marketFrozenWindowHashV3 } from '../../src/market/market-frozen-window-v3.js';
import { tradabilityFixtureV3 } from './v3-tradability-fixtures.js';
import { tradabilityWindowFromResponseV3 } from '../../src/backtest/backtest-snapshot-v3-tradability.js';
import {
  marketDataBarSeriesRequestV3Schema,
  marketDataBarSeriesResponseV3Schema,
  runConfigSchemaV3,
  type MarketDataBarSeriesResponseV3,
  type BacktestExecutionModelV3,
  type BacktestStrategy,
} from '@thesis-ledger/schemas';
import type { DsaSnapshotBuilder } from '../../src/backtest/backtest-snapshot-builder.js';
import type {
  MarketBarWindowReadInputV3,
  MarketBarWindowReadResultV3,
} from '../../src/market/market-bar-reader-v3.js';
import type {
  PinnedMarketWindowRequestV3,
  StoredMarketWindowEvidenceV3,
} from '../../src/market/market-window-evidence-v3.repository.js';

const fixture = async <T>(name: string): Promise<T> =>
  JSON.parse(
    await readFile(
      new URL(`../../../../packages/schemas/fixtures/${name}`, import.meta.url),
      'utf8',
    ),
  ) as T;

const weekdays = (start: string, end: string): string[] => {
  const dates: string[] = [];
  const date = new Date(`${start}T00:00:00.000Z`);
  const last = new Date(`${end}T00:00:00.000Z`);
  while (date <= last) {
    const weekday = date.getUTCDay();
    if (weekday !== 0 && weekday !== 6) dates.push(date.toISOString().slice(0, 10));
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return dates;
};

export const makeReaderResult = async (
  input: MarketBarWindowReadInputV3,
  targetMismatch = false,
  missingDates: readonly string[] = [],
): Promise<MarketBarWindowReadResultV3> => {
  const request = marketDataBarSeriesRequestV3Schema.parse({
    contractVersion: 3,
    requestId: 'synthetic-snapshot-v3-request',
    symbol: input.symbol,
    routeKey: input.routeKey,
    routeTarget: {
      providerId: 'hithink',
      upstreamSource: 'hithink-financial-api',
      routeIndex: 0,
    },
    start: input.window.start,
    end: input.window.end,
    ...(input.tradabilityMode ? { tradabilityMode: input.tradabilityMode } : {}),
  }) as PinnedMarketWindowRequestV3;
  const response = await fixture<MarketDataBarSeriesResponseV3>(
    'market-data-v3.response.etf-qfq.json',
  );
  const dates = weekdays(input.window.start, input.window.end);
  const bars = dates.map((date, index) => {
    const close = 1 + index / 1000;
    return {
      timestamp: `${date}T07:00:00.000Z`,
      open: close - 0.001,
      high: close + 0.001,
      low: close - 0.002,
      close,
      volume: 1000 + index,
      amount: (1000 + index) * close,
      completionStatus: 'complete' as const,
      availableAt: `${date}T07:00:00.000Z`,
    };
  });
  let typedResponse = marketDataBarSeriesResponseV3Schema.parse({
    ...response,
    requestId: request.requestId,
    symbol: request.symbol,
    routeKey: request.routeKey,
    bars,
    coverage: {
      requestedStart: request.start,
      requestedEnd: request.end,
      actualStart: bars[0]?.timestamp ?? null,
      actualEnd: bars.at(-1)?.timestamp ?? null,
      hasMoreBefore: false,
      latestCompleteTradingDate: dates.at(-1) ?? null,
    },
    coverageProof: {
      ...response.coverageProof,
      calendar: {
        ...response.coverageProof.calendar,
        expectedSessionDates: dates,
      },
      listing: {
        ...response.coverageProof.listing,
        symbol: request.symbol,
      },
      window: {
        status: 'complete',
        requestedStart: request.start,
        requestedEnd: request.end,
      },
    },
    provenance: {
      providerId: request.routeTarget!.providerId,
      upstreamSource: request.routeTarget!.upstreamSource,
      routeIndex: request.routeTarget!.routeIndex,
      effectivePolicyRevision: 1,
    },
    inputFingerprint: 'synthetic-complete-v3-execution-bars',
  });
  typedResponse.bars = typedResponse.bars.filter((bar) => !missingDates.includes(bar.timestamp.slice(0, 10)));
  if (missingDates.length) typedResponse.inputFingerprint += `-missing-${missingDates.join(',')}`;
  typedResponse.coverage.actualStart = typedResponse.bars[0]?.timestamp ?? null;
  typedResponse.coverage.actualEnd = typedResponse.bars.at(-1)?.timestamp ?? null;
  if (input.tradabilityMode) typedResponse.historicalTradabilityWindows = [tradabilityFixtureV3(tradabilityWindowFromResponseV3(typedResponse))];
  typedResponse = marketDataBarSeriesResponseV3Schema.parse(typedResponse);
  const selectedTarget = {
    providerId: request.routeTarget!.providerId,
    upstreamSource: targetMismatch ? 'different-source' : request.routeTarget!.upstreamSource,
  };
  const desiredRevision = 7;
  const effectivePolicyRevision = typedResponse.provenance.effectivePolicyRevision;
  const catalogRevision = 12;
  const seriesVersion = 'synthetic-v3-series-version';
  const evidence: StoredMarketWindowEvidenceV3 = {
    identityFingerprint: 'a'.repeat(64),
    completeResponseHash: marketFrozenWindowHashV3(typedResponse),
    routeKey: request.routeKey,
    target: request.routeTarget!,
    symbol: request.symbol,
    window: { start: request.start, end: request.end },
    seriesVersion,
    inputFingerprint: typedResponse.inputFingerprint,
    desiredRevision,
    effectivePolicyRevision,
    catalogRevision,
    sourcePriceBasis: typedResponse.sourcePriceBasis,
    coverageProof: typedResponse.coverageProof,
    fetchedAt: new Date('2026-05-20T07:02:00.000Z'),
  };
  return {
    status: 'selected',
    request,
    seriesVersion,
    evidence,
    selection: {
      status: 'selected',
      source: 'primary',
      response: typedResponse,
      target: selectedTarget,
      routeIndex: request.routeTarget!.routeIndex,
      desiredRevision,
      effectivePolicyRevision,
      catalogRevision,
    },
  };
};
export const buildInput = async (): Promise<{
  input: Parameters<DsaSnapshotBuilder['buildV3']>[0];
}> => {
  const strategy = await fixture<BacktestStrategy>('backtest-v2.exchange.json');
  strategy.executionInstrument = {
    symbol: '159516.SZ',
    market: 'CN',
    assetType: 'etf',
  };
  strategy.signalSources = strategy.signalSources
    .filter((source) => source.id === 'execution')
    .map((source) => ({
      ...source,
      asset: { symbol: '159516.SZ', market: 'CN', assetType: 'etf' },
    }));
  const sourceResponse = await fixture<MarketDataBarSeriesResponseV3>(
    'market-data-v3.response.etf-qfq.json',
  );
  const executionModel = await fixture<BacktestExecutionModelV3>(
    'backtest-execution-model.cn-2024q1.json',
  );
  executionModel.scope.symbol = '159516.SZ';
  executionModel.scope.instrumentType = 'ETF';
  executionModel.scope.range = { start: '2026-05-18', end: '2026-05-20' };
  for (const segment of executionModel.segments) {
    segment.range = { start: '2026-05-18', end: '2026-05-20' };
    if (segment.source.kind !== 'historicalFact') {
      segment.source.configuredAt = '2026-05-17T07:00:00.000Z';
    }
    if (segment.execution.mode !== 'exchange') throw new Error('Expected exchange execution');
    segment.execution.price = {
      kind: 'noDailyLimit',
      reason: '合成 V3 归一化执行测试假设',
    };
    segment.execution.normalizedExecution = {
      priceCoordinate: 'continuous-decimal',
      quantityUnits: 'continuous-normalized-decimal',
      lotSizeConstraint: 'not-applied',
      tickSizeConstraint: 'not-applied',
      dailyPriceLimit: 'not-applied',
      feeBasis: 'simulatedTurnover',
    };
  }
  const runConfig = runConfigSchemaV3.parse({
    schemaVersion: '3',
    startDate: '2026-05-18',
    endDate: '2026-05-20',
    dataAsOf: '2026-05-21T00:00:00.000Z',
    baseCurrency: 'CNY',
    initialCash: { CNY: '1000000' },
    valuationPolicy: {
      baseTimezone: 'Asia/Shanghai',
      dailyValuationTime: '15:00',
      pricePolicy: 'latestAvailable',
      fxPolicy: 'latestAvailable',
    },
    executionPriceProtocol: {
      protocolVersion: 'execution-price-v1',
      priceBasis: {
        ...sourceResponse.sourcePriceBasis,
        quantityBasis: 'normalized-units',
      },
      accountingBasis: 'normalized-series',
      history: { basis: 'fixed-provider-snapshot' },
    },
    executionModel,
  });
  return {
    input: {
      runId: 'run-v3-snapshot-test',
      strategyVersionId: 'strategy-version-v3',
      strategyVersionHash: 'strategy-version-hash-v3',
      strategy,
      runConfig,
      executionRouteKey: {
        kind: 'bar',
        market: 'CN',
        assetType: 'ETF',
        capability: 'DAILY_BAR',
        timeframe: '1d',
        adjustment: 'qfq',
      },
    },
  };
};
