import { createHash } from 'node:crypto';

export function rqdataIdentityBundle() {
  return {
    contractVersion: 1,
    kind: 'rqdata-fund-identity',
    mappings: [
      {
        symbol: '159516.SZ',
        instrumentType: 'ETF',
        queryFundCode: '159516',
        scopeDateFrom: '2025-01-01',
        scopeDateTo: '2025-12-31',
        observedAt: '2026-09-27T10:00:00Z',
        identityEvidence: {
          documentUrl: 'https://identity.example.test/ETF',
          documentSha256: 'a'.repeat(64),
        },
        dividendCurrencyEvidence: {
          currency: 'CNY',
          documentUrl: 'https://identity.example.test/cash',
          documentSha256: 'b'.repeat(64),
        },
      },
    ],
  };
}
export function rqdataEventFixture(
  capability: 'CASH_DISTRIBUTION' | 'SPLIT_EVENT' = 'CASH_DISTRIBUTION',
) {
  const content = JSON.stringify(rqdataIdentityBundle());
  const digest = createHash('sha256').update(content).digest('hex');
  const request = {
    contractVersion: 3,
    requestId: 'rqdata-event',
    symbol: '159516.SZ',
    routeKey: { kind: 'data', market: 'CN', assetType: 'ETF', capability },
    routeTarget: { providerId: 'rqdata', upstreamSource: 'rqdata', routeIndex: 0 },
    desiredRevision: 1,
    effectivePolicyRevision: 1,
    catalogRevision: 1,
    start: '2025-02-01',
    end: '2025-03-01',
    dataAsOf: '2026-09-27T12:00:00Z',
  };
  const facts = [
    {
      symbol: request.symbol,
      market: 'CN',
      instrumentType: 'ETF',
      type: capability === 'SPLIT_EVENT' ? 'SPLIT' : 'CASH_DIVIDEND',
      ...(capability === 'SPLIT_EVENT' ? { ratio: '2' } : { cashAmount: '0.125', currency: 'CNY' }),
      effectiveDate: '2025-02-20',
      occurredAt: '2025-02-20T00:00:00+08:00',
      availableAt: '2026-09-27T11:30:00Z',
      provider: 'rqdata',
      providerRevision: 'synthetic-content-v1',
    },
  ];
  const admission = {
    consumer: 'thesis-ledger',
    routeKey: request.routeKey,
    target: { providerId: 'rqdata', upstreamSource: 'rqdata' },
    status: 'admitted',
    admissionState: 'admitted',
    evidenceRef: `sha256:${digest}`,
    evidenceSha256: digest,
    scopeSymbols: [request.symbol],
    scopeDateFrom: '2025-01-01',
    scopeDateTo: '2025-12-31',
    adapterRevision: 'synthetic-rqdata-event',
    sourceRevision: 'synthetic-rqdata-api',
    credentialRevision: 'synthetic-account-revision',
    validFrom: '2026-09-27T11:00:00Z',
    validUntil: '2026-09-28T00:00:00Z',
    recordedAt: '2026-09-27T11:00:00Z',
    recordVersion: 1,
    invalidatedAt: null,
    invalidationReason: null,
  };
  const response = {
    ...request,
    fetchedAt: '2026-09-27T12:00:00Z',
    providerRevision: 'synthetic-content-v1',
    admission,
    identityEvidence: { ref: `sha256:${digest}`, sha256: digest, content },
    facts,
    coverage: { complete: false, reason: 'historical_coverage_unverified' },
  };
  return { request, response };
}
