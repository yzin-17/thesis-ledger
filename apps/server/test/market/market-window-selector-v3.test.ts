import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { canonicalMarketMultiWindowEncodingV3 } from '@thesis-ledger/schemas';
import { describe, expect, it, vi } from 'vitest';
import type {
  MarketDataBarRouteKeyV3,
  MarketDataBarSeriesRequestV3,
  MarketDataBarSeriesResponseV3,
  MarketDataMultiWindowResponseV3,
  MarketRouteCompatibilityObservationV3,
  MarketRouteCompatibilityProofV3,
} from '@thesis-ledger/schemas';
import {
  selectMarketWindowV3,
  type MarketWindowReadRequestV3,
  type MarketWindowSelectionInputV3,
} from '../../src/market/market-window-selector-v3.js';

const fixture = (path: string) =>
  JSON.parse(
    readFileSync(new URL(`../../../../packages/schemas/fixtures/${path}`, import.meta.url), 'utf8'),
  ) as unknown;

const responseTemplate = fixture(
  'market-data-v3.response.etf-qfq.json',
) as MarketDataBarSeriesResponseV3;
const compatibilityTemplate = fixture('market-route-compatibility-v3.synthetic.json') as {
  proof: MarketRouteCompatibilityProofV3;
  observation: MarketRouteCompatibilityObservationV3;
};

const routeKey = responseTemplate.routeKey as MarketDataBarRouteKeyV3;
const window = { start: '2026-05-18', end: '2026-05-20' };
const symbol = '159516.SZ';
const primaryTarget = { providerId: 'synthetic-provider-a', upstreamSource: 'synthetic-adapter-a' };
const backupTarget = { providerId: 'synthetic-provider-b', upstreamSource: 'synthetic-adapter-b' };
const primaryFingerprint = 'a'.repeat(64);
const backupFingerprint = 'b'.repeat(64);

const makePolicies = () => {
  const desired = {
    contractVersion: 3 as const,
    consumer: 'thesis-ledger' as const,
    requestId: 'desired-request-7',
    revision: 7,
    enabled: true,
    routes: [{ key: routeKey, targets: [primaryTarget, backupTarget] }],
  };
  const effective = {
    contractVersion: 3 as const,
    consumer: 'thesis-ledger' as const,
    requestId: 'effective-snapshot-12',
    revision: 12,
    sourceDesiredRevision: 7,
    enabled: true,
    routes: [
      {
        key: routeKey,
        targets: [primaryTarget, backupTarget].map((target, routeIndex) => ({
          ...target,
          routeIndex,
          eligible: true,
          reason: null,
        })),
        reason: null,
      },
    ],
    appliedAt: '2026-05-17T00:00:00Z',
  };
  const catalog = {
    contractVersion: 3 as const,
    consumer: 'thesis-ledger' as const,
    catalogRevision: 20,
    generatedAt: '2026-05-17T00:00:00Z',
    integrity: 'complete' as const,
    entries: [primaryTarget, backupTarget].map((target) => ({
      key: routeKey,
      target,
      state: 'ready' as const,
    })),
  };
  return { desired, effective, catalog };
};

const makeCompatibility = (): {
  proof: MarketRouteCompatibilityProofV3;
  observation: MarketRouteCompatibilityObservationV3;
} => {
  const value = structuredClone(compatibilityTemplate);
  const { proof, observation } = value;
  proof.routeKey = routeKey;
  proof.targets = { primary: primaryTarget, backup: backupTarget };
  proof.symbol = symbol;
  proof.window = window;
  observation.routeKey = routeKey;
  observation.targets = { primary: primaryTarget, backup: backupTarget };
  observation.symbol = symbol;
  observation.window = window;
  for (const facts of [proof.sourceFacts, observation.sourceFacts]) {
    facts.primary.seriesFingerprint = primaryFingerprint;
    facts.backup.seriesFingerprint = backupFingerprint;
    facts.primary.fixedBasisRange = window;
    facts.backup.fixedBasisRange = window;
    facts.primary.priceBasis.basisScope = 'request-window';
    facts.backup.priceBasis.basisScope = 'request-window';
    facts.primary.priceBasis.anchor = window.end;
    facts.backup.priceBasis.anchor = window.end;
    facts.primary.priceBasis.methodVersion = 'synthetic-fixed-qfq-v1';
    facts.backup.priceBasis.methodVersion = 'synthetic-fixed-qfq-v1';
    facts.primary.priceBasis.observedAt = '2026-05-20T08:00:00Z';
    facts.backup.priceBasis.observedAt = '2026-05-20T08:00:00Z';
  }
  proof.issuedAt = '2026-05-01T00:00:00Z';
  proof.validFrom = '2026-05-01T00:00:00Z';
  proof.validUntil = '2026-06-01T00:00:00Z';
  return value;
};

const makeResponse = (
  request: MarketDataBarSeriesRequestV3,
  target: { providerId: string; upstreamSource: string },
  routeIndex: number,
  options: {
    inputFingerprint?: string;
    priceBasis?: MarketDataBarSeriesResponseV3['sourcePriceBasis'];
  } = {},
): MarketDataBarSeriesResponseV3 => {
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
    effectivePolicyRevision: 12,
  };
  response.inputFingerprint = options.inputFingerprint ?? `synthetic-series-${routeIndex}`;
  if (options.priceBasis) response.sourcePriceBasis = structuredClone(options.priceBasis);
  return response;
};

const makeInput = (
  overrides: Partial<MarketWindowSelectionInputV3> = {},
): MarketWindowSelectionInputV3 => ({
  ...makePolicies(),
  routeKey,
  symbol,
  window,
  requestId: 'selector-test',
  now: '2026-05-21T00:00:00Z',
  read: vi.fn(async ({ request, target, routeIndex }: MarketWindowReadRequestV3) =>
    makeResponse(request, target, routeIndex),
  ),
  readCapabilities: vi.fn(async () => ({
    dataContractVersions: [3] as [3],
    serviceCapabilities: { fundNav: true as const },
  })),
  ...overrides,
});

describe('market window selector V3', () => {
  it.each([true, false])('共同价格来源免证明回退只对固定价格研究启用（%s）', async (priceResearch) => {
    const policies = makePolicies();
    const targets = [
      { providerId: 'hithink', upstreamSource: 'fund-market-historical' },
      { providerId: 'tencent', upstreamSource: 'tencent' },
    ];
    policies.desired.routes[0]!.targets = targets;
    policies.effective.routes[0]!.targets = targets.map((target, routeIndex) => ({
      ...target, routeIndex, eligible: true, reason: null,
    }));
    policies.catalog.entries = targets.map((target) => ({ key: routeKey, target, state: 'ready' as const }));
    const read = vi.fn(async ({ request, target, routeIndex }: MarketWindowReadRequestV3) => {
      if (routeIndex === 0) throw new Error('主源故障');
      return makeResponse(request, target, routeIndex);
    });
    const result = await selectMarketWindowV3(makeInput({ ...policies, priceResearch, read }));
    if (priceResearch) {
      expect(result).toMatchObject({ status: 'selected', source: 'backup', target: targets[1] });
      expect(read).toHaveBeenCalledTimes(2);
    } else {
      expect(result).toMatchObject({ status: 'unavailable', reason: 'incompatible_backup' });
      expect(read).toHaveBeenCalledTimes(1);
    }
  });

  it.each([true, false])('多窗口二次解析要求明确能力（%s）并保留子响应', async (supported) => {
    const golden = fixture('market-data-v3.multi-window-hash.json') as { response: MarketDataMultiWindowResponseV3 };
    const response = golden.response;
    const readCapabilities = vi.fn(async () => ({ dataContractVersions: [3] as [3], serviceCapabilities: { fundNav: true as const },
      ...(supported ? { multiWindowProtocols: ['market-multi-window-content-v1' as const] } : {}) }));
    const read = vi.fn(async ({ request, target, routeIndex }: MarketWindowReadRequestV3) => {
      response.requestId = request.requestId;
      response.provenance = { ...target, routeIndex, effectivePolicyRevision: 12 };
      for (const child of response.windowObservations) child.response.provenance = response.provenance;
      const hash = createHash('sha256').update(canonicalMarketMultiWindowEncodingV3(response)).digest('hex');
      response.inputFingerprint = hash;
      response.sourcePriceBasis.revision = { origin: 'local-observation', contentHash: hash };
      return response;
    });
    const result = await selectMarketWindowV3(makeInput({ read, readCapabilities }));
    expect(readCapabilities).toHaveBeenCalledOnce();
    expect(result.status).toBe(supported ? 'selected' : 'unavailable');
    if (result.status === 'selected') expect(result.response).toEqual(response);
  });
  it('accepts a complete primary response and validates actual provenance', async () => {
    const read = vi.fn(async ({ request, target, routeIndex }: MarketWindowReadRequestV3) =>
      makeResponse(request, target, routeIndex),
    );

    const result = await selectMarketWindowV3(makeInput({ read }));

    expect(result.status).toBe('selected');
    if (result.status !== 'selected') return;
    expect(result.source).toBe('primary');
    expect(result.response.provenance).toEqual({
      providerId: primaryTarget.providerId,
      upstreamSource: primaryTarget.upstreamSource,
      routeIndex: 0,
      effectivePolicyRevision: 12,
    });
    expect(result).toMatchObject({
      desiredRevision: 7,
      effectivePolicyRevision: 12,
      catalogRevision: 20,
    });
    expect(read).toHaveBeenCalledTimes(1);
    expect(read.mock.calls[0]?.[0]).toMatchObject({
      catalogRevision: 20,
      effectivePolicyRevision: 12,
      request: { start: window.start, end: window.end },
    });
  });

  it('replaces a primary missing-page result with one compatible complete backup window', async () => {
    const compatibility = makeCompatibility();
    const reads: MarketWindowReadRequestV3[] = [];
    const read = vi.fn(async (input: MarketWindowReadRequestV3) => {
      reads.push(input);
      const response =
        input.routeIndex === 0
          ? makeResponse(input.request, input.target, input.routeIndex)
          : makeResponse(input.request, input.target, input.routeIndex, {
              inputFingerprint: backupFingerprint,
              priceBasis: compatibility.observation.sourceFacts.backup.priceBasis,
            });
      if (input.routeIndex === 0) {
        response.bars.pop();
        response.coverage.actualEnd = response.bars.at(-1)?.timestamp ?? null;
      }
      return response;
    });

    const result = await selectMarketWindowV3(makeInput({ compatibility, read }));

    expect(result.status).toBe('selected');
    if (result.status !== 'selected') return;
    expect(result.source).toBe('backup');
    expect(result.routeIndex).toBe(1);
    expect(result.primaryFailure).toBe('missing_window');
    expect(result.response.bars).toHaveLength(3);
    expect(result.response.provenance.providerId).toBe(backupTarget.providerId);
    expect(reads.map((item) => item.routeIndex)).toEqual([0, 1]);
    expect(reads.map((item) => [item.request.start, item.request.end])).toEqual([
      [window.start, window.end],
      [window.start, window.end],
    ]);
    expect(read).toHaveBeenCalledTimes(2);
    expect(reads.every((item) => item.routeIndex < 2)).toBe(true);
  });

  it('does not fetch a backup based on matching qfq labels without proof', async () => {
    const read = vi.fn(async () => {
      throw new Error('synthetic primary outage');
    });

    const result = await selectMarketWindowV3(makeInput({ read }));

    expect(result).toMatchObject({
      status: 'unavailable',
      reason: 'incompatible_backup',
      primaryFailure: 'fetch_failed',
      backupFailure: 'incompatible_backup',
      compatibilityReason: 'invalid_proof',
    });
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('blocks backup reads when both observed sources lack verified amount semantics', async () => {
    const compatibility = makeCompatibility();
    compatibility.proof.sourceFacts.primary.amountSemantics = { status: 'unknown' };
    compatibility.observation.sourceFacts.primary.amountSemantics = { status: 'unknown' };
    const read = vi.fn(async () => {
      throw new Error('synthetic primary outage');
    });

    const result = await selectMarketWindowV3(makeInput({ compatibility, read }));

    expect(result).toMatchObject({
      status: 'unavailable',
      reason: 'incompatible_backup',
      compatibilityReason: 'basis_unverified',
    });
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('does not read a backup after the explicit compatibility proof expires', async () => {
    const compatibility = makeCompatibility();
    compatibility.proof.validUntil = '2026-05-20T00:00:00Z';
    const read = vi.fn(async () => {
      throw new Error('synthetic primary outage');
    });

    const result = await selectMarketWindowV3(makeInput({ compatibility, read }));

    expect(result).toMatchObject({
      status: 'unavailable',
      reason: 'incompatible_backup',
      compatibilityReason: 'expired',
    });
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('distinguishes pre-listing, missing-window, and insufficient-warmup diagnostics', async () => {
    const preListingRead = vi.fn(async (input: MarketWindowReadRequestV3) => {
      const response = makeResponse(input.request, input.target, input.routeIndex);
      response.coverageProof.listing.firstTradingDate = '2026-05-21';
      return response;
    });
    const preListing = await selectMarketWindowV3(makeInput({ read: preListingRead }));
    expect(preListing).toMatchObject({
      status: 'unavailable',
      reason: 'primary_unavailable',
      primaryFailure: 'pre_listing',
    });
    expect(preListingRead).toHaveBeenCalledTimes(1);

    const missingWindowRead = vi.fn(async (input: MarketWindowReadRequestV3) => {
      const response = makeResponse(input.request, input.target, input.routeIndex);
      response.bars.pop();
      response.coverage.actualEnd = response.bars.at(-1)?.timestamp ?? null;
      return response;
    });
    const noBackup = makePolicies();
    noBackup.desired.routes[0]!.targets = [primaryTarget];
    noBackup.effective.routes[0]!.targets = noBackup.effective.routes[0]!.targets.slice(0, 1);
    noBackup.catalog.entries = noBackup.catalog.entries.slice(0, 1);
    const missingWindow = await selectMarketWindowV3(
      makeInput({ ...noBackup, read: missingWindowRead }),
    );
    expect(missingWindow).toMatchObject({
      status: 'unavailable',
      reason: 'primary_unavailable',
      primaryFailure: 'missing_window',
    });

    const insufficientWarmup = await selectMarketWindowV3(
      makeInput({
        warmup: { analysisStart: '2026-05-20', minimumSessions: 3 },
      }),
    );
    expect(insufficientWarmup).toMatchObject({
      status: 'unavailable',
      reason: 'primary_unavailable',
      primaryFailure: 'insufficient_warmup',
    });
  });

  it('rejects a misaligned response window and does not query another source without proof', async () => {
    const read = vi.fn(async (input: MarketWindowReadRequestV3) => {
      const response = makeResponse(input.request, input.target, input.routeIndex);
      response.coverage.requestedStart = '2026-05-19';
      return response;
    });

    const result = await selectMarketWindowV3(makeInput({ read }));

    expect(result).toMatchObject({
      status: 'unavailable',
      reason: 'incompatible_backup',
      primaryFailure: 'window_mismatch',
    });
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('rejects response provenance that names another exact target or Effective revision', async () => {
    const read = vi.fn(async (input: MarketWindowReadRequestV3) => {
      const response = makeResponse(input.request, input.target, input.routeIndex);
      response.provenance.effectivePolicyRevision += 1;
      return response;
    });

    const result = await selectMarketWindowV3(makeInput({ read }));

    expect(result).toMatchObject({
      status: 'unavailable',
      primaryFailure: 'provenance_mismatch',
    });
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('rejects stale effective revisions and incomplete catalogs before reading data', async () => {
    const stale = makeInput({
      effective: {
        ...makePolicies().effective,
        sourceDesiredRevision: 6,
      },
    });
    const read = vi.fn(stale.read);
    const result = await selectMarketWindowV3({ ...stale, read });
    expect(result).toMatchObject({ status: 'unavailable', reason: 'policy_mismatch' });
    expect(read).not.toHaveBeenCalled();

    const partialCatalog = makeInput({
      catalog: { ...makePolicies().catalog, integrity: 'partial' },
    });
    const partialRead = vi.fn(partialCatalog.read);
    const partialResult = await selectMarketWindowV3({ ...partialCatalog, read: partialRead });
    expect(partialResult).toMatchObject({ status: 'unavailable', reason: 'catalog_unavailable' });
    expect(partialRead).not.toHaveBeenCalled();
  });

  it('fails closed for minute bars until the window proof can establish intraday completeness', async () => {
    const read = vi.fn(makeInput().read);
    const minuteRoute = {
      ...routeKey,
      capability: 'MINUTE_BAR' as const,
      timeframe: '1m' as const,
    };

    const result = await selectMarketWindowV3(makeInput({ routeKey: minuteRoute, read }));

    expect(result).toMatchObject({ status: 'unavailable', reason: 'unsupported_granularity' });
    expect(read).not.toHaveBeenCalled();
  });
});
