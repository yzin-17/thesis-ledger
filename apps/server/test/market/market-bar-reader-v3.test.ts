import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type {
  MarketDataBarSeriesRequestV3,
  MarketDataBarSeriesResponseV3,
  MarketRouteCompatibilityObservationV3,
  MarketRouteCompatibilityProofV3,
} from '@thesis-ledger/schemas';
import type { DsaClient } from '../../src/integration/dsa/dsa.client.js';
import type { EffectivePolicyEnvelopeV3 } from '../../src/integration/dsa/dsa-v3-protocol.js';
import type { MarketControlService } from '../../src/market/market-control.service.js';
import {
  MarketBarWindowReaderV3,
  type MarketBarWindowReadInputV3,
} from '../../src/market/market-bar-reader-v3.js';
import type {
  MarketWindowEvidenceV3Repository,
  PinnedMarketWindowRequestV3,
  StoredMarketWindowEvidenceV3,
} from '../../src/market/market-window-evidence-v3.repository.js';

const fixture = <T>(path: string) =>
  JSON.parse(
    readFileSync(new URL(`../../../../packages/schemas/fixtures/${path}`, import.meta.url), 'utf8'),
  ) as T;

const desiredTemplate = fixture<Record<string, unknown>>('market-route-v3.etf-qfq.json');
const effectiveTemplate = fixture<Record<string, unknown>>(
  'market-control-v3.effective.etf-qfq.json',
);
const catalogTemplate = fixture<Record<string, unknown>>('market-route-catalog-v3.complete.json');
const responseTemplate = fixture<MarketDataBarSeriesResponseV3>(
  'market-data-v3.response.etf-qfq.json',
);
const compatibilityTemplate = fixture<{
  proof: MarketRouteCompatibilityProofV3;
  observation: MarketRouteCompatibilityObservationV3;
}>('market-route-compatibility-v3.synthetic.json');

const routeKey = responseTemplate.routeKey;
const window = { start: '2026-05-18', end: '2026-05-20' };
const symbol = '159516.SZ';
const primaryTarget = { providerId: 'hithink', upstreamSource: 'hithink-financial-api' };
const backupTarget = { providerId: 'synthetic-provider-b', upstreamSource: 'synthetic-adapter-b' };
const backupFingerprint = 'b'.repeat(64);

const policies = (withBackup = false) => {
  const targets = withBackup ? [primaryTarget, backupTarget] : [primaryTarget];
  const desired = structuredClone(desiredTemplate) as Record<string, unknown> & {
    routes: Array<{ targets: Array<Record<string, unknown>> }>;
  };
  desired.routes[0]!.targets = targets;

  const effective = structuredClone(effectiveTemplate) as Record<string, unknown> & {
    routes: Array<{ targets: Array<Record<string, unknown>> }>;
  };
  effective.routes[0]!.targets = targets.map((target, routeIndex) => ({
    ...target,
    routeIndex,
    eligible: true,
    reason: null,
  }));

  const catalog = structuredClone(catalogTemplate) as Record<string, unknown> & {
    entries: Array<Record<string, unknown>>;
  };
  catalog.entries = [
    ...targets.map((target) => ({ key: routeKey, target, state: 'ready' })),
    ...catalog.entries.filter(
      (entry) => (entry.key as { capability?: string }).capability !== 'DAILY_BAR',
    ),
  ];
  return { desired, effective, catalog };
};

const readPolicy = (withBackup = false, overrides: Record<string, unknown> = {}) => ({
  ...policies(withBackup).desired,
  syncState: 'applied',
  effectiveStale: false,
  ...overrides,
});

const makeCompatibility = () => {
  const compatibility = structuredClone(compatibilityTemplate);
  const { proof, observation } = compatibility;
  for (const value of [proof, observation]) {
    value.routeKey = routeKey;
    value.targets = { primary: primaryTarget, backup: backupTarget };
    value.symbol = symbol;
    value.window = window;
  }
  for (const facts of [proof.sourceFacts, observation.sourceFacts]) {
    facts.primary.fixedBasisRange = window;
    facts.backup.fixedBasisRange = window;
    facts.primary.priceBasis.basisScope = 'request-window';
    facts.backup.priceBasis.basisScope = 'request-window';
    facts.primary.priceBasis.anchor = window.end;
    facts.backup.priceBasis.anchor = window.end;
    facts.backup.seriesFingerprint = backupFingerprint;
  }
  return compatibility;
};

const makeResponse = (
  request: MarketDataBarSeriesRequestV3,
  target = primaryTarget,
  routeIndex = 0,
  options: {
    inputFingerprint?: string;
    sourcePriceBasis?: MarketDataBarSeriesResponseV3['sourcePriceBasis'];
  } = {},
) => {
  const response = structuredClone(responseTemplate);
  response.requestId = request.requestId;
  response.symbol = request.symbol;
  response.routeKey = request.routeKey;
  response.coverage.requestedStart = request.start;
  response.coverage.requestedEnd = request.end;
  response.coverageProof.listing.symbol = request.symbol;
  response.coverageProof.window.requestedStart = request.start;
  response.coverageProof.window.requestedEnd = request.end;
  response.provenance = {
    providerId: target.providerId,
    upstreamSource: target.upstreamSource,
    routeIndex,
    effectivePolicyRevision: 1,
  };
  response.inputFingerprint = options.inputFingerprint ?? 'synthetic-primary-series';
  if (options.sourcePriceBasis)
    response.sourcePriceBasis = structuredClone(options.sourcePriceBasis);
  return response;
};

const input: MarketBarWindowReadInputV3 = {
  market: 'CN',
  symbol,
  routeKey,
  window,
};

const makeEvidence = (
  request: PinnedMarketWindowRequestV3,
  response: MarketDataBarSeriesResponseV3,
): StoredMarketWindowEvidenceV3 => ({
  identityFingerprint: 'e'.repeat(64),
  routeKey: request.routeKey,
  target: request.routeTarget,
  symbol: request.symbol,
  window: { start: request.start, end: request.end },
  seriesVersion: 'series-v3-test',
  inputFingerprint: response.inputFingerprint,
  desiredRevision: 1,
  effectivePolicyRevision: 1,
  catalogRevision: 7,
  sourcePriceBasis: response.sourcePriceBasis,
  coverageProof: response.coverageProof,
  fetchedAt: new Date('2026-05-21T00:00:00Z'),
});

const makeReader = (
  options: {
    withBackup?: boolean;
    policyOverrides?: Record<string, unknown>;
    catalog?: unknown;
    read?: (request: PinnedMarketWindowRequestV3) => Promise<unknown>;
  } = {},
) => {
  const policy = readPolicy(options.withBackup, options.policyOverrides);
  const snapshots = policies(options.withBackup);
  const marketControl = { getPolicy: vi.fn().mockResolvedValue(policy) };
  const dsa = {
    effectiveControlPolicyV3: vi.fn().mockResolvedValue({
      contractVersion: 3,
      consumer: 'thesis-ledger',
      projection: {
        effective: snapshots.effective as unknown as NonNullable<
          EffectivePolicyEnvelopeV3['projection']
        >['effective'],
      },
    } satisfies EffectivePolicyEnvelopeV3),
    marketRouteCatalogV3: vi.fn().mockResolvedValue(options.catalog ?? snapshots.catalog),
    marketBarsV3: vi.fn(async (request: PinnedMarketWindowRequestV3) => {
      if (options.read) return options.read(request);
      return makeResponse(request, request.routeTarget, request.routeTarget.routeIndex);
    }),
  };
  const evidenceRepository = {
    record: vi.fn(
      async ({
        request,
        response,
      }: {
        request: PinnedMarketWindowRequestV3;
        response: MarketDataBarSeriesResponseV3;
      }) => makeEvidence(request, response),
    ),
  };
  const reader = new MarketBarWindowReaderV3(
    marketControl as unknown as MarketControlService,
    dsa as unknown as DsaClient,
    evidenceRepository as unknown as MarketWindowEvidenceV3Repository,
  );
  return { reader, marketControl, dsa, evidenceRepository };
};

describe('MarketBarWindowReaderV3', () => {
  it('reads and records one complete primary window with exact pinned provenance', async () => {
    const { reader, dsa, evidenceRepository } = makeReader();

    const result = await reader.read(input);

    expect(result.status).toBe('selected');
    if (result.status !== 'selected') return;
    expect(result.selection.source).toBe('primary');
    expect(result.request).toMatchObject({
      routeKey,
      routeTarget: { ...primaryTarget, routeIndex: 0 },
      symbol,
      start: window.start,
      end: window.end,
    });
    expect(result.selection.response.provenance).toMatchObject({ ...primaryTarget, routeIndex: 0 });
    expect(result.seriesVersion).toMatch(/^market-series-v1:unknown:/);
    expect(result.evidence).toMatchObject({ target: result.request.routeTarget, window });
    expect(dsa.marketBarsV3).toHaveBeenCalledTimes(1);
    expect(dsa.marketBarsV3.mock.calls[0]?.[0]).toMatchObject({
      routeTarget: { ...primaryTarget, routeIndex: 0 },
    });
    expect(evidenceRepository.record).toHaveBeenCalledTimes(1);
    expect(evidenceRepository.record.mock.calls[0]?.[0]).toMatchObject({
      request: result.request,
      desiredRevision: 1,
      effectivePolicyRevision: 1,
      catalogRevision: 7,
    });
  });

  it('does not call backup or persist evidence without an explicit compatibility proof', async () => {
    const { reader, dsa, evidenceRepository } = makeReader({
      withBackup: true,
      read: async () => {
        throw new Error('primary unavailable');
      },
    });

    const result = await reader.read(input);

    expect(result).toMatchObject({
      status: 'unavailable',
      selection: {
        reason: 'incompatible_backup',
        primaryFailure: 'fetch_failed',
        compatibilityReason: 'invalid_proof',
      },
    });
    expect(dsa.marketBarsV3).toHaveBeenCalledTimes(1);
    expect(dsa.marketBarsV3.mock.calls[0]?.[0].routeTarget.routeIndex).toBe(0);
    expect(evidenceRepository.record).not.toHaveBeenCalled();
  });

  it('records a synthetic backup only after primary failure and compatibility assessment', async () => {
    const compatibility = makeCompatibility();
    const { reader, dsa, evidenceRepository } = makeReader({
      withBackup: true,
      read: async (request) => {
        if (request.routeTarget.routeIndex === 0) throw new Error('synthetic primary outage');
        return makeResponse(request, backupTarget, 1, {
          inputFingerprint: backupFingerprint,
          sourcePriceBasis: compatibility.observation.sourceFacts.backup.priceBasis,
        });
      },
    });

    const result = await reader.read({ ...input, compatibility });

    expect(result.status).toBe('selected');
    if (result.status !== 'selected') return;
    expect(result.selection.source).toBe('backup');
    expect(result.selection.primaryFailure).toBe('fetch_failed');
    expect(result.request.routeTarget).toMatchObject({ ...backupTarget, routeIndex: 1 });
    expect(result.selection.response.inputFingerprint).toBe(backupFingerprint);
    expect(dsa.marketBarsV3.mock.calls.map(([request]) => request.routeTarget.routeIndex)).toEqual([
      0, 1,
    ]);
    expect(dsa.marketBarsV3.mock.calls.map(([request]) => [request.start, request.end])).toEqual([
      [window.start, window.end],
      [window.start, window.end],
    ]);
    expect(evidenceRepository.record).toHaveBeenCalledTimes(1);
    expect(evidenceRepository.record.mock.calls[0]?.[0]).toMatchObject({
      request: { routeTarget: { ...backupTarget, routeIndex: 1 } },
      desiredRevision: 1,
      effectivePolicyRevision: 1,
      catalogRevision: 7,
    });
  });

  it('fails closed for a partial route catalog and a stale desired policy', async () => {
    const partial = fixture('market-route-catalog-v3.partial.json');
    const catalogFailure = makeReader({ catalog: partial });
    const catalogResult = await catalogFailure.reader.read(input);
    expect(catalogResult).toMatchObject({
      status: 'unavailable',
      selection: { reason: 'catalog_unavailable' },
    });
    expect(catalogFailure.dsa.marketBarsV3).not.toHaveBeenCalled();
    expect(catalogFailure.evidenceRepository.record).not.toHaveBeenCalled();

    const stalePolicy = makeReader({ policyOverrides: { effectiveStale: true } });
    const staleResult = await stalePolicy.reader.read(input);
    expect(staleResult).toMatchObject({
      status: 'unavailable',
      selection: { reason: 'policy_mismatch' },
    });
    expect(stalePolicy.dsa.effectiveControlPolicyV3).not.toHaveBeenCalled();
    expect(stalePolicy.dsa.marketBarsV3).not.toHaveBeenCalled();
  });

  it('rejects wrong market identity and a response whose provenance does not match its pin', async () => {
    const wrongMarket = makeReader();
    const invalid = await wrongMarket.reader.read({ ...input, market: 'US' as 'CN' });
    expect(invalid).toMatchObject({
      status: 'unavailable',
      selection: { reason: 'invalid_input' },
    });
    expect(wrongMarket.marketControl.getPolicy).not.toHaveBeenCalled();
    expect(wrongMarket.dsa.marketBarsV3).not.toHaveBeenCalled();

    const wrongProvenance = makeReader({
      read: async (request) => makeResponse(request, backupTarget, 0),
    });
    const result = await wrongProvenance.reader.read(input);
    expect(result).toMatchObject({
      status: 'unavailable',
      selection: { reason: 'primary_unavailable', primaryFailure: 'provenance_mismatch' },
    });
    expect(wrongProvenance.evidenceRepository.record).not.toHaveBeenCalled();
  });

  it('does not persist a response whose claimed requested window differs from the pinned request', async () => {
    const mismatch = makeReader({
      read: async (request) => {
        const response = makeResponse(request, request.routeTarget, request.routeTarget.routeIndex);
        response.coverage.requestedEnd = '2026-05-21';
        return response;
      },
    });

    const result = await mismatch.reader.read(input);

    expect(result).toMatchObject({
      status: 'unavailable',
      selection: { primaryFailure: 'window_mismatch' },
    });
    expect(mismatch.evidenceRepository.record).not.toHaveBeenCalled();
  });
});
