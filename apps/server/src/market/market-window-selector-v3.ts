import {
  assessMarketRouteCompatibilityV3,
  effectiveProviderPolicyV3Schema,
  marketCalendarTimezonesV3,
  marketCoverageProofV3Schema,
  marketDataBarSeriesRequestV3Schema,
  marketRouteCatalogV3Schema,
  marketRouteCompatibilityObservationV3Schema,
  marketRouteCompatibilityProofV3Schema,
  marketRouteKeyIdV3,
  desiredProviderPolicyV3Schema,
  type DesiredProviderPolicyV3,
  type EffectiveProviderPolicyV3,
  type MarketDataBarRouteKeyV3,
  type MarketDataBarSeriesRequestV3,
  type MarketDataBarSeriesResponseV3,
  type MarketDataContractCapabilitiesV3,
  type MarketRouteCatalogV3,
  type MarketRouteCompatibilityObservationV3,
  type MarketRouteCompatibilityProofV3,
} from '@thesis-ledger/schemas';
import { readBarSeriesV3 } from '../integration/dsa/dsa-market-bars-v3.js';
import { supportsBasicPriceFallback } from './market-basic-price-fallback.js';

type DateWindow = { start: string; end: string };

export type MarketWindowReadRequestV3 = {
  request: MarketDataBarSeriesRequestV3;
  target: { providerId: string; upstreamSource: string };
  routeIndex: number;
  catalogRevision: number;
  effectivePolicyRevision: number;
};

export type MarketWindowWarmupRequirementV3 = {
  /** The first session evaluated by the consumer; warmup sessions precede this date. */
  analysisStart: string;
  minimumSessions: number;
};

export type MarketWindowSelectionInputV3 = {
  desired: unknown;
  effective: unknown;
  catalog: unknown;
  routeKey: MarketDataBarRouteKeyV3;
  symbol: string;
  window: DateWindow;
  requestId: string;
  now: string;
  tradabilityMode?: 'assume-untradable-no-bar';
  /** 由固定快照、归一化价格研究消费方启用。 */
  priceResearch?: boolean;
  warmup?: MarketWindowWarmupRequirementV3;
  compatibility?: {
    proof: unknown;
    observation: unknown;
  };
  read: (input: MarketWindowReadRequestV3) => Promise<unknown>;
  readCapabilities: () => Promise<MarketDataContractCapabilitiesV3>;
};

export type MarketWindowAttemptFailureV3 =
  | 'target_not_ready'
  | 'fetch_failed'
  | 'pre_listing'
  | 'missing_window'
  | 'window_mismatch'
  | 'insufficient_warmup'
  | 'provenance_mismatch'
  | 'invalid_response'
  | 'incompatible_backup';

export type MarketWindowSelectionV3 =
  | {
      status: 'selected';
      source: 'primary' | 'backup';
      response: MarketDataBarSeriesResponseV3;
      target: { providerId: string; upstreamSource: string };
      routeIndex: number;
      desiredRevision: number;
      effectivePolicyRevision: number;
      catalogRevision: number;
      primaryFailure?: MarketWindowAttemptFailureV3;
    }
  | {
      status: 'unavailable';
      reason:
        | 'invalid_input'
        | 'unsupported_granularity'
        | 'catalog_unavailable'
        | 'policy_mismatch'
        | 'route_not_configured'
        | 'primary_unavailable'
        | 'incompatible_backup';
      primaryFailure?: MarketWindowAttemptFailureV3;
      backupFailure?: MarketWindowAttemptFailureV3;
      compatibilityReason?: string;
    };

type ParsedContext = {
  desired: DesiredProviderPolicyV3;
  effective: EffectiveProviderPolicyV3;
  catalog: MarketRouteCatalogV3;
  desiredRevision: number;
  effectivePolicyRevision: number;
  catalogRevision: number;
  targets: Array<{
    target: { providerId: string; upstreamSource: string };
    routeIndex: number;
    eligible: boolean;
    catalogReady: boolean;
  }>;
};

type ContextResult =
  | { ok: true; context: ParsedContext }
  | {
      ok: false;
      reason: 'catalog_unavailable' | 'policy_mismatch' | 'route_not_configured';
    };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const sameTarget = (
  left: { providerId: string; upstreamSource: string },
  right: { providerId: string; upstreamSource: string },
) => left.providerId === right.providerId && left.upstreamSource === right.upstreamSource;

export const dateInMarket = (timestamp: string, market: MarketDataBarRouteKeyV3['market']) => {
  if (!Number.isFinite(Date.parse(timestamp))) return null;
  const dateParts = new Map(
    new Intl.DateTimeFormat('en-US', {
      timeZone: marketCalendarTimezonesV3[market],
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(new Date(timestamp))
      .map(({ type, value }) => [type, value]),
  );
  return `${dateParts.get('year')}-${dateParts.get('month')}-${dateParts.get('day')}`;
};

export const marketRouteContextV3 = (
  input: Pick<MarketWindowSelectionInputV3, 'desired' | 'effective' | 'catalog' | 'routeKey'>,
): ContextResult => {
  const desiredResult = desiredProviderPolicyV3Schema.safeParse(input.desired);
  const effectiveResult = effectiveProviderPolicyV3Schema.safeParse(input.effective);
  const catalogResult = marketRouteCatalogV3Schema.safeParse(input.catalog);
  if (!desiredResult.success || !effectiveResult.success) {
    return { ok: false, reason: 'policy_mismatch' };
  }
  if (!catalogResult.success || catalogResult.data.integrity !== 'complete') {
    return { ok: false, reason: 'catalog_unavailable' };
  }

  const desired = desiredResult.data;
  const effective = effectiveResult.data;
  const catalog = catalogResult.data;
  if (
    !desired.enabled ||
    !effective.enabled ||
    effective.revision <= 0 ||
    effective.sourceDesiredRevision !== desired.revision
  ) {
    return { ok: false, reason: 'policy_mismatch' };
  }

  const desiredRoute = desired.routes.find(
    (route) => marketRouteKeyIdV3(route.key) === marketRouteKeyIdV3(input.routeKey),
  );
  const effectiveRoute = effective.routes.find(
    (route) => marketRouteKeyIdV3(route.key) === marketRouteKeyIdV3(input.routeKey),
  );
  if (!desiredRoute || !effectiveRoute) return { ok: false, reason: 'route_not_configured' };
  if (
    desiredRoute.targets.length < 1 ||
    desiredRoute.targets.length > 2 ||
    effectiveRoute.targets.length !== desiredRoute.targets.length
  )
    return { ok: false, reason: 'policy_mismatch' };

  const exactCatalogEntries = catalog.entries.filter(
    (entry) => marketRouteKeyIdV3(entry.key) === marketRouteKeyIdV3(input.routeKey),
  );
  const targets = [];
  for (let index = 0; index < desiredRoute.targets.length; index += 1) {
    const desiredTarget = desiredRoute.targets[index]!;
    const effectiveTarget = effectiveRoute.targets[index];
    if (
      !effectiveTarget ||
      effectiveTarget.routeIndex !== index ||
      !sameTarget(desiredTarget, effectiveTarget)
    ) {
      return { ok: false, reason: 'policy_mismatch' };
    }
    const exactCatalogEntry = exactCatalogEntries.find((entry) =>
      sameTarget(entry.target, desiredTarget),
    );
    if (!exactCatalogEntry) return { ok: false, reason: 'catalog_unavailable' };
    targets.push({
      target: desiredTarget,
      routeIndex: index,
      eligible: effectiveTarget.eligible,
      catalogReady: exactCatalogEntry.state === 'ready',
    });
  }

  return {
    ok: true,
    context: {
      desired,
      effective,
      catalog,
      desiredRevision: desired.revision,
      effectivePolicyRevision: effective.revision,
      catalogRevision: catalog.catalogRevision,
      targets,
    },
  };
};

const classifyInvalidResponse = (
  raw: unknown,
  request: MarketDataBarSeriesRequestV3,
): MarketWindowAttemptFailureV3 => {
  if (!isRecord(raw)) return 'invalid_response';
  const coverage = isRecord(raw.coverage) ? raw.coverage : undefined;
  if (
    coverage &&
    (coverage.requestedStart !== request.start || coverage.requestedEnd !== request.end)
  ) {
    return 'window_mismatch';
  }
  if (raw.requestId !== request.requestId || raw.symbol !== request.symbol) {
    return 'invalid_response';
  }

  const proofResult = marketCoverageProofV3Schema.safeParse(raw.coverageProof);
  if (!proofResult.success) return 'invalid_response';
  const proof = proofResult.data;
  if (proof.window.requestedStart !== request.start || proof.window.requestedEnd !== request.end) {
    return 'window_mismatch';
  }
  if (proof.listing.firstTradingDate > request.end) return 'pre_listing';

  if (!Array.isArray(raw.bars)) return 'invalid_response';
  const actualDates: string[] = [];
  for (const point of raw.bars) {
    if (!isRecord(point) || typeof point.timestamp !== 'string') return 'invalid_response';
    const date = dateInMarket(point.timestamp, request.routeKey.market);
    if (!date) return 'invalid_response';
    if (actualDates.at(-1) !== date) actualDates.push(date);
  }
  const expectedDates = proof.calendar.expectedSessionDates.filter(
    (date) => date >= proof.listing.firstTradingDate,
  );
  if (
    actualDates.length !== expectedDates.length ||
    actualDates.some((date, index) => date !== expectedDates[index])
  ) {
    return 'missing_window';
  }
  return 'invalid_response';
};

const warmupFailure = (
  response: MarketDataBarSeriesResponseV3,
  requirement: MarketWindowWarmupRequirementV3 | undefined,
): boolean => {
  if (!requirement) return false;
  const availableSessions = response.bars.filter((bar) => {
    const date = dateInMarket(bar.timestamp, response.routeKey.market);
    return date !== null && date < requirement.analysisStart;
  }).length;
  return availableSessions < requirement.minimumSessions;
};

const parseCompatibility = (
  compatibility: MarketWindowSelectionInputV3['compatibility'],
): {
  proof: MarketRouteCompatibilityProofV3;
  observation: MarketRouteCompatibilityObservationV3;
} | null => {
  if (!compatibility) return null;
  const proof = marketRouteCompatibilityProofV3Schema.safeParse(compatibility.proof);
  const observation = marketRouteCompatibilityObservationV3Schema.safeParse(
    compatibility.observation,
  );
  if (!proof.success || !observation.success) return null;
  return { proof: proof.data, observation: observation.data };
};

const hasExpectedCompatibilityIdentity = (
  input: MarketWindowSelectionInputV3,
  context: ParsedContext,
  compatibility: NonNullable<ReturnType<typeof parseCompatibility>>,
) => {
  const primary = context.targets[0];
  const backup = context.targets[1];
  if (!primary || !backup) return false;
  const proof = compatibility.proof;
  const observation = compatibility.observation;
  return (
    marketRouteKeyIdV3(proof.routeKey) === marketRouteKeyIdV3(input.routeKey) &&
    proof.symbol === input.symbol &&
    proof.window.start === input.window.start &&
    proof.window.end === input.window.end &&
    sameTarget(proof.targets.primary, primary.target) &&
    sameTarget(proof.targets.backup, backup.target) &&
    marketRouteKeyIdV3(observation.routeKey) === marketRouteKeyIdV3(input.routeKey) &&
    observation.symbol === input.symbol &&
    observation.window.start === input.window.start &&
    observation.window.end === input.window.end &&
    sameTarget(observation.targets.primary, primary.target) &&
    sameTarget(observation.targets.backup, backup.target)
  );
};

const actualBackupMatchesObservation = (
  response: MarketDataBarSeriesResponseV3,
  observation: MarketRouteCompatibilityObservationV3,
) =>
  observation.sourceFacts.backup.seriesFingerprint === response.inputFingerprint &&
  canonicalJson(observation.sourceFacts.backup.priceBasis) ===
    canonicalJson(response.sourcePriceBasis);

const canonicalJson = (value: unknown): string => {
  const normalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(normalize);
    if (!isRecord(item)) return item;
    return Object.fromEntries(
      Object.entries(item)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, normalize(child)]),
    );
  };
  return JSON.stringify(normalize(value));
};

const unavailable = (
  reason: Extract<MarketWindowSelectionV3, { status: 'unavailable' }>['reason'],
  details: Pick<
    Extract<MarketWindowSelectionV3, { status: 'unavailable' }>,
    'primaryFailure' | 'backupFailure' | 'compatibilityReason'
  > = {},
): MarketWindowSelectionV3 => ({ status: 'unavailable', reason, ...details });

const validateInput = (input: MarketWindowSelectionInputV3) => {
  const request = marketDataBarSeriesRequestV3Schema.safeParse({
    contractVersion: 3,
    requestId: input.requestId,
    symbol: input.symbol,
    routeKey: input.routeKey,
    start: input.window.start,
    end: input.window.end,
    ...(input.tradabilityMode ? { tradabilityMode: input.tradabilityMode } : {}),
  });
  if (!request.success || !Number.isFinite(Date.parse(input.now))) return null;
  if (
    input.warmup &&
    (!Number.isInteger(input.warmup.minimumSessions) ||
      input.warmup.minimumSessions < 0 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(input.warmup.analysisStart) ||
      input.warmup.analysisStart < input.window.start ||
      input.warmup.analysisStart > input.window.end)
  ) {
    return null;
  }
  return request.data;
};

/**
 * Selects one complete V3 price window. The injected read port is called in Desired order,
 * and each accepted result is the full requested window from a single exact target.
 */
export const selectMarketWindowV3 = async (
  input: MarketWindowSelectionInputV3,
): Promise<MarketWindowSelectionV3> => {
  const baseRequest = validateInput(input);
  if (!baseRequest) return unavailable('invalid_input');
  if (input.routeKey.capability !== 'DAILY_BAR' || input.routeKey.timeframe !== '1d') {
    return unavailable('unsupported_granularity');
  }

  const contextResult = marketRouteContextV3(input);
  if (!contextResult.ok) return unavailable(contextResult.reason);
  const { context } = contextResult;

  const primary = context.targets[0];
  if (!primary) return unavailable('route_not_configured');

  const readTarget = async (
    candidate: ParsedContext['targets'][number],
  ): Promise<
    | { ok: true; response: MarketDataBarSeriesResponseV3 }
    | { ok: false; reason: MarketWindowAttemptFailureV3 }
  > => {
    if (!candidate.eligible || !candidate.catalogReady) {
      return { ok: false, reason: 'target_not_ready' };
    }
    const request = marketDataBarSeriesRequestV3Schema.parse({
      ...baseRequest,
      requestId: `${input.requestId}:route-${candidate.routeIndex}`,
    });
    let raw: unknown;
    try {
      raw = await input.read({
        request,
        target: candidate.target,
        routeIndex: candidate.routeIndex,
        catalogRevision: context.catalogRevision,
        effectivePolicyRevision: context.effectivePolicyRevision,
      });
    } catch {
      return { ok: false, reason: 'fetch_failed' };
    }

    let response: MarketDataBarSeriesResponseV3;
    try {
      response = (await readBarSeriesV3(
        request,
        () => Promise.resolve(raw),
        input.readCapabilities,
      ))();
    } catch {
      return { ok: false, reason: classifyInvalidResponse(raw, request) };
    }
    const provenance = response.provenance;
    if (
      provenance.providerId !== candidate.target.providerId ||
      provenance.upstreamSource !== candidate.target.upstreamSource ||
      provenance.routeIndex !== candidate.routeIndex ||
      provenance.effectivePolicyRevision !== context.effectivePolicyRevision
    ) {
      return { ok: false, reason: 'provenance_mismatch' };
    }
    if (warmupFailure(response, input.warmup)) {
      return { ok: false, reason: 'insufficient_warmup' };
    }
    return { ok: true, response };
  };

  const primaryResult = await readTarget(primary);
  if (primaryResult.ok) {
    return {
      status: 'selected',
      source: 'primary',
      response: primaryResult.response,
      target: primary.target,
      routeIndex: primary.routeIndex,
      desiredRevision: context.desiredRevision,
      effectivePolicyRevision: context.effectivePolicyRevision,
      catalogRevision: context.catalogRevision,
    };
  }
  if (primaryResult.reason === 'pre_listing' || primaryResult.reason === 'insufficient_warmup') {
    return unavailable('primary_unavailable', { primaryFailure: primaryResult.reason });
  }

  const backup = context.targets[1];
  if (!backup) return unavailable('primary_unavailable', { primaryFailure: primaryResult.reason });

  const basicFallback = input.priceResearch &&
    supportsBasicPriceFallback(input.routeKey, [primary.target, backup.target]);
  const compatibility = basicFallback ? null : parseCompatibility(input.compatibility);
  if (!basicFallback && (!compatibility || !hasExpectedCompatibilityIdentity(input, context, compatibility))) {
    return unavailable('incompatible_backup', {
      primaryFailure: primaryResult.reason,
      backupFailure: 'incompatible_backup',
      compatibilityReason: 'invalid_proof',
    });
  }
  const preflight = compatibility ? assessMarketRouteCompatibilityV3({
    proof: compatibility.proof,
    observation: compatibility.observation,
    now: input.now,
  }) : { eligible: true as const };
  if (!preflight.eligible) {
    return unavailable('incompatible_backup', {
      primaryFailure: primaryResult.reason,
      backupFailure: 'incompatible_backup',
      compatibilityReason: preflight.reason,
    });
  }

  const backupResult = await readTarget(backup);
  if (!backupResult.ok) {
    return unavailable('primary_unavailable', {
      primaryFailure: primaryResult.reason,
      backupFailure: backupResult.reason,
    });
  }
  if (compatibility && !actualBackupMatchesObservation(backupResult.response, compatibility.observation)) {
    return unavailable('incompatible_backup', {
      primaryFailure: primaryResult.reason,
      backupFailure: 'incompatible_backup',
      compatibilityReason: 'source_facts_mismatch',
    });
  }
  const finalAssessment = compatibility ? assessMarketRouteCompatibilityV3({
    proof: compatibility.proof,
    observation: compatibility.observation,
    now: input.now,
  }) : { eligible: true as const };
  if (!finalAssessment.eligible) {
    return unavailable('incompatible_backup', {
      primaryFailure: primaryResult.reason,
      backupFailure: 'incompatible_backup',
      compatibilityReason: finalAssessment.reason,
    });
  }

  return {
    status: 'selected',
    source: 'backup',
    response: backupResult.response,
    target: backup.target,
    routeIndex: backup.routeIndex,
    desiredRevision: context.desiredRevision,
    effectivePolicyRevision: context.effectivePolicyRevision,
    catalogRevision: context.catalogRevision,
    primaryFailure: primaryResult.reason,
  };
};
