import { vi } from 'vitest';
import {
  runConfigSchemaV3,
  marketDataBarSeriesResponseV3Schema,
  type MarketKnownCashControlResponseV3,
} from '@thesis-ledger/schemas';
import { marketFrozenWindowHashV3 } from '../../src/market/market-frozen-window-v3.js';
import { completeSnapshotFixture } from './v3-complete-snapshot-fixtures.js';
import { makeReaderResult } from './v3-snapshot-fixtures.js';
import { knownCashRunFixture, knownCashControlFixture } from './known-cash-test-fixtures.js';
import { planBacktestPriceInputs } from '../../src/backtest/backtest-dependency-price.js';
import { tradabilityFixtureV3 } from './v3-tradability-fixtures.js';
import { tradabilityWindowFromResponseV3 } from '../../src/backtest/backtest-snapshot-v3-tradability.js';
import { hashCanonicalManifest } from '../../src/backtest/backtest-snapshot.js';

export async function knownCashSnapshotFixture(buffered = false) {
  const known = await knownCashRunFixture();
  if (buffered)
    known.runConfig = runConfigSchemaV3.parse({
      ...known.runConfig,
      frozenPriceWarmupPolicy: 'cash-reference-calendar-buffer-v1',
    });
  const routeKey = {
    kind: 'bar' as const,
    market: 'CN' as const,
    assetType: 'ETF' as const,
    capability: 'DAILY_BAR' as const,
    timeframe: '1d' as const,
    adjustment: 'none' as const,
  };
  const plan = planBacktestPriceInputs(known.strategy, known.runConfig, {
    cashEventResearch: known.runConfig.executionPriceProtocol.cashEventResearch,
  });
  const raw = await makeReaderResult({
    market: 'CN',
    symbol: known.strategy.executionInstrument.symbol,
    routeKey: { ...routeKey, adjustment: 'qfq' },
    window: { start: plan.warmup.startDate, end: known.runConfig.endDate },
  });
  if (raw.status !== 'selected') throw new Error('fixture selected');
  const basis = Object.fromEntries(
    Object.entries(known.prepared.input.executionPriceProtocol.priceBasis).filter(
      ([key]) => key !== 'quantityBasis',
    ),
  );
  const bars = raw.selection.response.bars.map((bar) => ({
    ...bar,
    open: Number(bar.open.toFixed(3)),
    close: Number(bar.close.toFixed(3)),
    high: Number(bar.high.toFixed(3)),
    low: Number(bar.low.toFixed(3)),
  }));
  const response = marketDataBarSeriesResponseV3Schema.parse({
    ...raw.selection.response,
    bars,
    routeKey,
    sourcePriceBasis: basis,
  });
  raw.request.routeKey = routeKey;
  raw.selection.response = response;
  raw.selection.desiredRevision = 1;
  raw.selection.catalogRevision = 1;
  raw.evidence = {
    ...raw.evidence,
    routeKey,
    desiredRevision: 1,
    catalogRevision: 1,
    sourcePriceBasis: response.sourcePriceBasis,
    completeResponseHash: marketFrozenWindowHashV3(response),
  };
  const reference = {
    version: 'market-frozen-window-v1' as const,
    identityFingerprint: raw.evidence.identityFingerprint,
    responseHash: raw.evidence.completeResponseHash!,
  };
  raw.frozenWindowRef = reference;
  const config = runConfigSchemaV3.parse({ ...known.runConfig, frozenExecutionWindow: reference });
  const base = await completeSnapshotFixture();
  base.dsa.backtestInstrumentFacts.mockImplementation(async (request) => ({
    version: 3,
    status: 'supported',
    provider: 'fixture-instrument',
    providerRevision: 'instrument-v1',
    coverage: { start: request.start, end: request.end, complete: true },
    historicalTradability: tradabilityFixtureV3(tradabilityWindowFromResponseV3(response)),
    facts: [
      {
        symbol: request.symbol,
        market: request.market,
        instrumentType: request.instrumentType,
        currency: 'CNY',
        lotSize: '100',
        tickSize: '0.001',
        tradable: true,
        executionRules: { status: 'unavailable', reason: '显式研究模型' },
        provider: 'fixture-instrument',
        providerRevision: 'instrument-v1',
        occurredAt: '2023-07-27T00:00:00Z',
        availableAt: '2023-07-27T00:00:00Z',
      },
    ],
  }));
  const reader = { readV3: vi.fn(async () => raw) };
  const control = vi.fn(
    async () => knownCashControlFixture(known.prepared) as MarketKnownCashControlResponseV3,
  );
  const input = {
    ...base.input,
    runId: 'known-cash-local-integration',
    strategy: known.strategy,
    strategyVersionHash: hashCanonicalManifest(known.strategy),
    runConfig: config,
    executionRouteKey: routeKey,
  };
  return { input, reader, dsa: base.dsa, control };
}
