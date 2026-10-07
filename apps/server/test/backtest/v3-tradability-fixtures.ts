import type { BacktestDailyTradabilityEvidenceV3 } from '@thesis-ledger/schemas';
import type { SnapshotTradabilityWindowV3 } from '../../src/backtest/backtest-snapshot-v3-tradability.js';

export const tradabilityFixtureV3 = (
  window: SnapshotTradabilityWindowV3,
): BacktestDailyTradabilityEvidenceV3 => {
  const proof = window.coverageProof;
  return {
    contractVersion: 1,
    symbol: window.symbol,
    market: 'CN',
    instrumentType: window.routeKey.assetType as 'ETF' | 'STOCK',
    range: { start: proof.window.requestedStart, end: proof.window.requestedEnd },
    listing: {
      listedOn: proof.listing.firstTradingDate,
      source: {
        provider: proof.listing.source,
        revision: proof.listing.revision,
        availableAt: proof.listing.knownAt,
      },
    },
    calendar: {
      expectedSessions: proof.calendar.expectedSessionDates,
      source: {
        provider: proof.calendar.source,
        revision: proof.calendar.revision,
        availableAt: '2026-02-01T00:00:00Z',
      },
    },
    barSource: {
      routeKey: {
        ...window.routeKey,
        market: 'CN',
        assetType: window.routeKey.assetType as 'ETF' | 'STOCK',
        capability: 'DAILY_BAR',
        timeframe: '1d',
      },
      routeTarget: {
        providerId: window.target.providerId,
        upstreamSource: window.target.upstreamSource,
      },
      providerRevision: 'fixture-manifest-r1',
      responseSha256: 'a'.repeat(64),
      observedAt: '2026-02-01T00:00:00Z',
      requestComplete: true,
      paginationComplete: true,
    },
    days: proof.calendar.expectedSessionDates.map((date) => ({
      date,
      state: window.barDates.includes(date) ? 'observed-traded' : 'assumed-untradable-no-bar',
    })),
  };
};
