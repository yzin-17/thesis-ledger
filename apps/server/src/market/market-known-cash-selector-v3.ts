import {
  effectiveProviderPolicyV3Schema,
  marketRouteCatalogV3Schema,
  marketRouteKeyIdV3,
  marketKnownCashRequestV3Schema,
  marketKnownCashExchangeV3Schema,
  marketKnownCashFailureReasonV3Schema,
  type MarketKnownCashRequestV3,
  type MarketKnownCashResponseV3,
  type MarketKnownCashFailureReasonV3,
  type EffectiveProviderPolicyV3,
  type MarketRouteCatalogV3,
} from '@thesis-ledger/schemas';
import { DsaError } from '../integration/dsa/dsa.client.js';

type Attempt = {
  target: MarketKnownCashRequestV3['routeTarget'];
  reason: MarketKnownCashFailureReasonV3 | null;
  transportCode?: DsaError['code'];
};
export type MarketKnownCashSelectionInputV3 = {
  scope: Omit<MarketKnownCashRequestV3, 'routeTarget'>;
  effective: unknown;
  catalog: unknown;
  read: (request: MarketKnownCashRequestV3) => Promise<unknown>;
};
export type MarketKnownCashSelectionV3 =
  | {
      status: 'observed';
      request: MarketKnownCashRequestV3;
      response: MarketKnownCashResponseV3;
      attempts: Attempt[];
    }
  | {
      status: 'unavailable';
      reason:
        | 'invalid_input'
        | 'policy_mismatch'
        | 'catalog_unavailable'
        | 'route_not_configured'
        | 'research_source_unavailable';
      attempts: Attempt[];
    };

function targetUnavailableReason(
  candidate: EffectiveProviderPolicyV3['routes'][number]['targets'][number],
  entry: MarketRouteCatalogV3['entries'][number] | undefined,
): MarketKnownCashFailureReasonV3 | null {
  if (entry?.state === 'credential_missing' || candidate.reason === 'credential_missing')
    return 'credential_missing';
  if (entry?.state === 'dependency_missing' || candidate.reason === 'dependency_missing')
    return 'dependency_missing';
  if (candidate.reason === 'disabled' || candidate.reason === 'quota_unavailable')
    return 'provider_unavailable';
  const acceptsResearchQuery = [
    null,
    'not_admitted',
    'admission_expired',
    'admission_not_yet_valid',
    'insufficient_coverage',
  ].includes(candidate.reason);
  if (!entry || !['ready', 'not_admitted'].includes(entry.state) || !acceptsResearchQuery)
    return 'research_protocol_not_supported';
  return null;
}

function failedReadAttempt(target: Attempt['target'], error: unknown) {
  const protocol = error instanceof DsaError ? error : null;
  const safe = marketKnownCashFailureReasonV3Schema.safeParse(protocol?.sourceReason);
  const reason: MarketKnownCashFailureReasonV3 = safe.success ? safe.data : 'source_unavailable';
  return {
    attempt: { target, reason, ...(protocol ? { transportCode: protocol.code } : {}) },
    stop: protocol !== null && ['stale-revision', 'unauthorized'].includes(protocol.code),
  };
}

/** 配置顺序属于有效策略，研究读取授权由DSA独立校验；不授予旧完整事件准入。 */
export async function selectMarketKnownCashV3(
  input: MarketKnownCashSelectionInputV3,
): Promise<MarketKnownCashSelectionV3> {
  const attempts: Attempt[] = [];
  const unavailable = (
    reason: Extract<MarketKnownCashSelectionV3, { status: 'unavailable' }>['reason'],
  ): MarketKnownCashSelectionV3 => ({ status: 'unavailable', reason, attempts });
  const scope = marketKnownCashRequestV3Schema.safeParse({
    ...input.scope,
    routeTarget: { providerId: 'scope', upstreamSource: 'scope', routeIndex: 0 },
  });
  if (!scope.success) return unavailable('invalid_input');
  const effective = effectiveProviderPolicyV3Schema.safeParse(input.effective);
  if (
    !effective.success ||
    !effective.data.enabled ||
    effective.data.revision !== scope.data.effectivePolicyRevision ||
    effective.data.sourceDesiredRevision !== scope.data.desiredRevision
  )
    return unavailable('policy_mismatch');
  const catalog = marketRouteCatalogV3Schema.safeParse(input.catalog);
  if (
    !catalog.success ||
    catalog.data.integrity !== 'complete' ||
    catalog.data.catalogRevision !== scope.data.catalogRevision
  )
    return unavailable('catalog_unavailable');
  const key = marketRouteKeyIdV3(scope.data.routeKey);
  const route = effective.data.routes.find((row) => marketRouteKeyIdV3(row.key) === key);
  if (!route || !route.targets.length) return unavailable('route_not_configured');
  for (const candidate of route.targets) {
    const target = {
      providerId: candidate.providerId,
      upstreamSource: candidate.upstreamSource,
      routeIndex: candidate.routeIndex,
    };
    const entry = catalog.data.entries.find(
      (row) =>
        marketRouteKeyIdV3(row.key) === key &&
        row.target.providerId === target.providerId &&
        row.target.upstreamSource === target.upstreamSource,
    );
    const reason = targetUnavailableReason(candidate, entry);
    if (reason) {
      attempts.push({ target, reason });
      continue;
    }
    const request = marketKnownCashRequestV3Schema.parse({ ...scope.data, routeTarget: target });
    let response: unknown;
    try {
      response = await input.read(request);
    } catch (error) {
      const failure = failedReadAttempt(target, error);
      attempts.push(failure.attempt);
      if (failure.stop) return unavailable('research_source_unavailable');
      continue;
    }
    const exchange = marketKnownCashExchangeV3Schema.safeParse({ request, response });
    if (!exchange.success) {
      attempts.push({ target, reason: 'invalid_source_response' });
      continue;
    }
    attempts.push({ target, reason: null });
    return { status: 'observed', ...exchange.data, attempts };
  }
  return unavailable('research_source_unavailable');
}
