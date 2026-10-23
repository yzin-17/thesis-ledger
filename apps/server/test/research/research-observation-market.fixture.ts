import { readFileSync } from 'node:fs';
import {
  marketDataBarSeriesResponseV3Schema,
  type MarketDataBarSeriesResponseV3,
} from '@thesis-ledger/schemas';
import type { MarketBarWindowReadResultV3 } from '../../src/market/market-bar-reader-v3.js';
import { researchObservationDigest } from '../../src/research/research-observation-identity.js';
import { observationMethodFixture } from './research-observation-method.fixture.js';

/** 合成 Market 端口输入；不表示 fixtures 中或真实供应商已通过资格验收。 */
export function observationMarketFixture() {
  const method = observationMethodFixture();
  const instrument = {
    instrumentId: '00000000-0000-4000-8000-000000000001',
    market: 'CN' as const,
    assetType: 'STOCK' as const,
    symbol: '600519.SH',
    currency: 'CNY' as const,
    catalogGeneration: 1,
  };
  const raw = JSON.parse(
    readFileSync(
      new URL(
        '../../../../packages/schemas/fixtures/market-data-v3.response.etf-qfq.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ) as MarketDataBarSeriesResponseV3;
  const dates = [...new Set(method.fact.sessions.map((session) => session.tradingDate))].filter(
    (date) => date >= '2026-10-19' && date <= '2026-10-26',
  );
  raw.symbol = instrument.symbol;
  raw.routeKey.assetType = 'STOCK';
  raw.bars = dates.map((date, index) => ({
    timestamp: date + 'T07:00:00Z',
    open: 100 + index * 2,
    high: 101 + index * 2,
    low: 99 + index * 2,
    close: 100 + index * 2,
    volume: 1000,
    amount: 100_000,
    completionStatus: 'complete',
    availableAt: date + 'T07:01:00Z',
  }));
  raw.coverage = {
    requestedStart: dates[0]!,
    requestedEnd: dates.at(-1)!,
    actualStart: raw.bars[0]!.timestamp,
    actualEnd: raw.bars.at(-1)!.timestamp,
    hasMoreBefore: false,
    latestCompleteTradingDate: dates.at(-1)!,
  };
  raw.coverageProof.calendar.expectedSessionDates = dates;
  raw.coverageProof.calendar.source = 'controlled-not-live-calendar';
  raw.coverageProof.listing.symbol = instrument.symbol;
  raw.coverageProof.window = {
    status: 'complete',
    requestedStart: dates[0]!,
    requestedEnd: dates.at(-1)!,
  };
  raw.sourcePriceBasis = {
    ...raw.sourcePriceBasis,
    methodVersion: 'controlled-not-live-economic-v1',
    basisScope: 'request-window',
    anchor: 'controlled-window-1',
    volumeBasis: 'original',
    observedAt: '2026-10-26T07:01:00Z',
    dividendMeaning: 'embedded-verified',
    dividendEvidenceRef: 'controlled-not-live-proof',
  };
  raw.provenance = {
    providerId: 'controlled-not-live',
    upstreamSource: 'controlled-economic-close',
    routeIndex: 0,
    effectivePolicyRevision: 1,
  };
  raw.inputFingerprint = researchObservationDigest(raw.bars);
  const data = marketDataBarSeriesResponseV3Schema.parse(raw);
  const target = {
    providerId: data.provenance.providerId,
    upstreamSource: data.provenance.upstreamSource,
    routeIndex: 0,
  };
  const selected: Extract<MarketBarWindowReadResultV3, { status: 'selected' }> = {
    status: 'selected',
    selection: {
      status: 'selected',
      source: 'primary',
      response: data,
      target,
      routeIndex: 0,
      desiredRevision: 1,
      effectivePolicyRevision: 1,
      catalogRevision: 1,
    },
    request: {
      contractVersion: 3,
      requestId: 'controlled-review-window',
      symbol: data.symbol,
      routeKey: data.routeKey,
      routeTarget: target,
      start: dates[0]!,
      end: dates.at(-1)!,
    },
    seriesVersion: 'controlled-series-v1',
    evidence: {
      identityFingerprint: 'a'.repeat(64),
      routeKey: data.routeKey,
      target,
      symbol: data.symbol,
      window: { start: dates[0]!, end: dates.at(-1)! },
      seriesVersion: 'controlled-series-v1',
      inputFingerprint: data.inputFingerprint,
      desiredRevision: 1,
      effectivePolicyRevision: 1,
      catalogRevision: 1,
      sourcePriceBasis: data.sourcePriceBasis,
      coverageProof: data.coverageProof,
      fetchedAt: new Date('2026-10-26T07:01:00Z'),
    },
  };
  return { method, instrument, selected, data };
}
