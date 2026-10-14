import { marketPeriodBarSeriesSchema } from '@thesis-ledger/schemas';

export function marketDisplayDetailFixture() {
  const fingerprint = 'a'.repeat(64);
  const tradingDates = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'];
  const timestamp = '2026-10-02T07:00:00.000Z';
  const series = marketPeriodBarSeriesSchema.parse({
    contractVersion: 3,
    identity: { symbol: '159516.SZ', assetType: 'ETF', timeframe: '1w', adjustment: 'qfq' },
    points: [
      {
        timestamp,
        tradingDate: '2026-10-02',
        bucketStartDate: '2026-09-28',
        bucketEndDate: '2026-10-04',
        bucketEndAt: timestamp,
        open: 10,
        high: 12,
        low: 9,
        close: 11,
        volume: 10,
        amount: 15,
        completionStatus: 'complete',
        availableAt: timestamp,
        expectedTradingDates: tradingDates,
        observedTradingDates: tradingDates,
        explainedTradingDates: [],
        missingTradingDates: [],
      },
    ],
    coverage: {
      actualStart: timestamp,
      actualEnd: timestamp,
      hasMoreBefore: false,
      latestCompleteTradingDate: '2026-10-02',
    },
    provenance: {
      kind: 'derived',
      provider: 'thesis-ledger-server',
      providerRevision: 'market-period-aggregation-v1',
      baseSources: [
        {
          providerId: 'tencent',
          upstreamSource: 'tencent',
          providerRevision: 'r1',
          inputFingerprint: fingerprint,
          priceBasisFingerprint: fingerprint,
        },
      ],
    },
    derivation: {
      ruleVersion: 'market-period-aggregation-v1',
      calendarRevision: 'controlled-calendar-r1',
      baseInputFingerprint: fingerprint,
      priceBasisFingerprint: fingerprint,
      evaluationAsOf: '2026-10-04T00:00:00Z',
      coverageEvidence: [],
    },
    inputFingerprint: fingerprint,
  });
  const indicator = {
    name: 'MA',
    parameters: { period: 5 },
    inputFingerprint: fingerprint,
    points: [{ timestamp, values: { ma5: 11 } }],
    calculationInput: {
      inputFingerprint: 'b'.repeat(64),
      actualStart: '2025-07-25T07:00:00.000Z',
      actualEnd: timestamp,
      pointCount: 60,
    },
  };
  return {
    contractVersion: 3 as const,
    symbol: '159516.SZ',
    assetType: 'ETF' as const,
    identity: { source: 'symbol' as const, status: 'confirmed' as const },
    requested: ['bars', 'indicator:MA'],
    capabilities: { supported: ['bars', 'indicator:MA'], unsupported: [] },
    limits: { bars: 1, nav: 30 },
    barSeries: series,
    sections: {
      bars: { capability: 'bars', status: 'ready', data: series },
      'indicator:MA': { capability: 'indicator:MA', status: 'ready', data: indicator },
    },
    dependencies: { DAILY_BAR: { status: 'ready' } },
    requestId: 'controlled-display-detail',
    generatedAt: '2026-10-04T00:00:00Z',
  };
}
