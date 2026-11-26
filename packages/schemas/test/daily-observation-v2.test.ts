import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { marketDataBarSeriesResponseV3Schema, marketDataBarSeriesRequestV3Schema,
  marketDataBarSeriesRequestResponseV3Schema, marketDataContractCapabilitiesV3Schema } from '../src/market-data-wire-v3.js';
import { backtestDailyTradabilityEvidenceV3Schema } from '../src/backtest-daily-tradability.js';

function sample() {
  const original = marketDataBarSeriesResponseV3Schema.parse(JSON.parse(readFileSync(
    new URL('../fixtures/market-data-v3.response.etf-qfq.json', import.meta.url), 'utf8')));
  const proof = original.coverageProof;
  const source = { provider: proof.calendar.source, revision: proof.calendar.revision, availableAt: original.sourcePriceBasis.observedAt };
  const window = backtestDailyTradabilityEvidenceV3Schema.parse({ contract: 'market-daily-tradability-window-v1', priceOnlyAllowed: true,
    symbol: original.symbol, market: original.routeKey.market, instrumentType: original.routeKey.assetType,
    range: { start: proof.window.requestedStart, end: proof.window.requestedEnd },
    listing: 'status' in proof.listing ? { status: 'unknown' } : { listedOn: proof.listing.firstTradingDate,
      source: { provider: proof.listing.source, revision: proof.listing.revision, availableAt: proof.listing.knownAt } },
    calendar: { source, expectedSessions: proof.calendar.expectedSessionDates },
    barSource: { routeKey: original.routeKey, routeTarget: { providerId: original.provenance.providerId,
      upstreamSource: original.provenance.upstreamSource }, providerRevision: 'fixture', responseSha256: 'a'.repeat(64),
      observedAt: source.availableAt, requestComplete: true, paginationComplete: true },
    days: proof.calendar.expectedSessionDates.map((date, index) => ({ date,
      state: index === 0 ? 'observed-price-only' : 'observed-traded' })),
  });
  const response = { ...original, bars: original.bars.map((bar, index) => ({ ...bar,
    volume: index === 0 ? null : bar.volume })), historicalTradabilityWindows: [window] };
  const request = marketDataBarSeriesRequestV3Schema.parse({ contractVersion: 1, requestId: response.requestId,
    symbol: response.symbol, routeKey: response.routeKey, start: proof.window.requestedStart, end: proof.window.requestedEnd,
    tradabilityMode: 'assume-untradable-no-bar', dailyObservationContract: 'market-daily-tradability-window-v1' });
  return { original, response, request, window };
}

it('具名日级观察关联有效价格及未知量，旧数字版本和缺省无效', () => {
  const { response, request } = sample();
  expect(marketDataBarSeriesRequestResponseV3Schema.parse({ request, response }).response.bars[0]?.volume).toBeNull();
  expect(marketDataBarSeriesRequestResponseV3Schema.safeParse({ request: { ...request, dailyObservationContract: 1 }, response }).success).toBe(false);
  const legacy = { ...request }; delete legacy.dailyObservationContract;
  expect(marketDataBarSeriesRequestResponseV3Schema.safeParse({ request: legacy, response }).success).toBe(false);
});

it.each([0, -1, 10])('价格观察状态不能冒充有效或零成交量 %s', (volume) => {
  const { response } = sample();
  response.bars[0]!.volume = volume;
  expect(marketDataBarSeriesResponseV3Schema.safeParse(response).success).toBe(false);
});

it('具名日级观察保留 OHLC、正量与缺日分区校验', () => {
  const { original, response, window } = sample();
  expect(marketDataBarSeriesResponseV3Schema.parse(original)).toEqual(original);
  expect(backtestDailyTradabilityEvidenceV3Schema.safeParse({ ...window, contract: 'retired-daily-observation' }).success).toBe(false);
  response.bars[0]!.low = response.bars[0]!.high + 1;
  expect(marketDataBarSeriesResponseV3Schema.safeParse(response).success).toBe(false);
  expect(marketDataContractCapabilitiesV3Schema.parse({ dataContract: 'dsa-data-v1', serviceCapabilities: { fundNav: true },
    dailyObservationContract: 'market-daily-tradability-window-v1' }).dailyObservationContract).toBe('market-daily-tradability-window-v1');
});

it('日级观察版本不能用于分钟或不带日级证据的请求', () => {
  const { request } = sample();
  const noEvidence = { ...request }; delete noEvidence.tradabilityMode;
  expect(marketDataBarSeriesRequestV3Schema.safeParse(noEvidence).success).toBe(false);
  expect(marketDataBarSeriesRequestV3Schema.safeParse({ ...request, routeKey: { ...request.routeKey,
    timeframe: '1m', capability: 'MINUTE_BAR' }, tradabilityMode: 'observed-bars-only' }).success).toBe(false);
});
