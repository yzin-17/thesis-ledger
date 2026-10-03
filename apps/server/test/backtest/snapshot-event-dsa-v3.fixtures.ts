import { vi } from 'vitest';
import type { CorporateActionFact, MarketEventRequestV3, MarketEventResponseV3 } from '@thesis-ledger/schemas';

export const eventRevisions = { desiredRevision: 2, effectivePolicyRevision: 2, catalogRevision: 3 };
export function snapshotEventDsaFixture(options: { facts?: CorporateActionFact[]; complete?: boolean; status?: string } = {}) {
  const keys = (['CASH_DISTRIBUTION', 'SPLIT_EVENT'] as const).map((capability) => ({
    kind: 'data' as const, market: 'CN' as const, assetType: 'STOCK' as const, capability,
  }));
  const target = { providerId: 'fixture-actions', upstreamSource: 'fixture-events' };
  return {
    effectiveControlPolicyV3: vi.fn(async () => ({
      contractVersion: 3 as const, consumer: 'thesis-ledger' as const,
      projection: { effective: {
        contractVersion: 3 as const, consumer: 'thesis-ledger' as const, requestId: 'policy',
        revision: 2, sourceDesiredRevision: 2, enabled: true, appliedAt: '2024-01-01T00:00:00Z',
        routes: keys.map((key) => ({ key, reason: null,
          targets: [{ ...target, routeIndex: 0, eligible: true, reason: null }] })),
      } },
    })),
    marketRouteCatalogV3: vi.fn(async () => ({
      contractVersion: 3 as const, consumer: 'thesis-ledger' as const, catalogRevision: 3,
      generatedAt: '2024-01-01T00:00:00Z', integrity: 'complete' as const,
      entries: keys.map((key) => ({ key, target, state: 'ready' as const })),
    })),
    marketEventsV3: vi.fn(async (request: MarketEventRequestV3): Promise<MarketEventResponseV3> => ({
      ...request, fetchedAt: '2024-03-04T00:00:00Z', providerRevision: 'actions-r1',
      facts: (options.facts ?? []).filter((fact) => (fact.type === 'CASH_DIVIDEND')
        === (request.routeKey.capability === 'CASH_DISTRIBUTION')),
      coverage: options.complete === false || (options.status && options.status !== 'supported')
        ? { complete: false, reason: 'fixture-incomplete' }
        : { complete: true, admissionEvidenceRef: 'review-1' },
      admission: {
        consumer: 'thesis-ledger', routeKey: request.routeKey, target,
        status: 'admitted', admissionState: 'admitted', evidenceRef: 'review-1', evidenceSha256: 'a'.repeat(64),
        scopeSymbols: [request.symbol], scopeDateFrom: request.start, scopeDateTo: request.end,
        adapterRevision: 'adapter-1', sourceRevision: 'endpoint-1', credentialRevision: 'not-required',
        validFrom: '2024-01-01T00:00:00Z', validUntil: '2025-01-01T00:00:00Z',
        recordedAt: '2024-01-01T00:00:00Z', recordVersion: 1, invalidatedAt: null, invalidationReason: null,
      },
    })),
  };
}
