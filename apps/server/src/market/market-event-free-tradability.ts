import {
  backtestDailyTradabilityEvidenceV3Schema,
  MARKET_DAILY_TRADABILITY_CONTRACT,
  marketDataBarSeriesResponseV3Schema,
  type MarketDataBarSeriesResponseV3,
} from '@thesis-ledger/schemas';
import { economicEvidenceHash } from './market-event-free-evidence.js';

/** 只声明同份完整正成交量日线已成交；不为缺日制造状态或假设。 */
export function withEventFreeTradability(
  response: MarketDataBarSeriesResponseV3,
  calendarAvailableAt: string,
): MarketDataBarSeriesResponseV3 {
  const { sourcePriceBasis: basis, coverageProof: proof } = response;
  if (basis.method !== 'local-derived' || !basis.derivation)
    throw new Error('无事件日级证据必须绑定真实本地派生材料');
  const material = {
    symbol: response.symbol,
    routeKey: response.routeKey,
    bars: response.bars,
    sourcePriceBasis: basis,
    coverageProof: proof,
    provenance: response.provenance,
  };
  const evidence = backtestDailyTradabilityEvidenceV3Schema.parse({
    contract: MARKET_DAILY_TRADABILITY_CONTRACT,
    priceOnlyAllowed: false,
    symbol: response.symbol,
    market: response.routeKey.market,
    instrumentType: response.routeKey.assetType,
    range: { start: proof.window.requestedStart, end: proof.window.requestedEnd },
    listing: { status: 'unknown' },
    calendar: {
      source: {
        provider: proof.calendar.source,
        revision: proof.calendar.revision,
        availableAt: calendarAvailableAt,
      },
      expectedSessions: proof.calendar.expectedSessionDates,
    },
    barSource: {
      routeKey: response.routeKey,
      routeTarget: {
        providerId: response.provenance.providerId,
        upstreamSource: response.provenance.upstreamSource,
      },
      providerRevision: `${basis.methodVersion}:${basis.derivation.inputFingerprint}`,
      responseSha256: economicEvidenceHash(material),
      observedAt: basis.observedAt,
      requestComplete: true,
      paginationComplete: true,
    },
    days: response.bars.map((bar) => ({
      date: bar.timestamp.slice(0, 10),
      state: 'observed-traded',
    })),
  });
  return marketDataBarSeriesResponseV3Schema.parse({
    ...response,
    historicalTradabilityWindows: [evidence],
  });
}
