import {
  effectiveProviderPolicyV3Schema,
  marketEventExchangeV3Schema,
  marketEventRequestV3Schema,
  marketRouteCatalogV3Schema,
  marketRouteKeyIdV3,
  type MarketEventRequestV3,
  type MarketEventResponseV3,
} from '@thesis-ledger/schemas';
import { verifySplitMappingV3 } from './market-split-mapping-v3.js';
import { verifyRqdataFundIdentityV3 } from './market-rqdata-identity-v3.js';
import { verifyTushareFundIdentityV3 } from './market-tushare-identity-v3.js';
import { verifyHithinkFundIdentityV3 } from './market-hithink-identity-v3.js';

export type MarketEventSelectionInputV3 = {
  scope: Omit<MarketEventRequestV3, 'routeTarget'>;
  effective: unknown;
  catalog: unknown;
  read: (request: MarketEventRequestV3) => Promise<unknown>;
};

export type MarketEventSelectionV3 =
  | {
      status: 'observed';
      request: MarketEventRequestV3;
      response: MarketEventResponseV3;
    }
  | {
      status: 'unavailable';
      request?: MarketEventRequestV3;
      reason:
        | 'invalid_input'
        | 'policy_mismatch'
        | 'catalog_unavailable'
        | 'not_admitted'
        | 'upstream_failure'
        | 'invalid_response';
    };

/** 固定版本后只读取一个精确来源；观测成功不授予冻结所需的完整覆盖。 */
export async function selectMarketEventV3(
  input: MarketEventSelectionInputV3,
): Promise<MarketEventSelectionV3> {
  const scope = marketEventRequestV3Schema.safeParse({
    ...input.scope,
    routeTarget: { providerId: 'scope-check', upstreamSource: 'scope-check', routeIndex: 0 },
  });
  if (!scope.success) return { status: 'unavailable', reason: 'invalid_input' };
  const effective = effectiveProviderPolicyV3Schema.safeParse(input.effective);
  if (
    !effective.success ||
    !effective.data.enabled ||
    effective.data.revision !== scope.data.effectivePolicyRevision ||
    effective.data.sourceDesiredRevision !== scope.data.desiredRevision
  )
    return { status: 'unavailable', reason: 'policy_mismatch' };
  const catalog = marketRouteCatalogV3Schema.safeParse(input.catalog);
  if (
    !catalog.success ||
    catalog.data.integrity !== 'complete' ||
    catalog.data.catalogRevision !== scope.data.catalogRevision
  )
    return { status: 'unavailable', reason: 'catalog_unavailable' };

  const key = marketRouteKeyIdV3(scope.data.routeKey);
  const route = effective.data.routes.find((entry) => marketRouteKeyIdV3(entry.key) === key);
  if (!route || route.reason !== null) return { status: 'unavailable', reason: 'not_admitted' };
  const target = route.targets.find(
    (candidate) =>
      candidate.eligible &&
      candidate.reason === null &&
      catalog.data.entries.some(
        (entry) =>
          marketRouteKeyIdV3(entry.key) === key &&
          entry.target.providerId === candidate.providerId &&
          entry.target.upstreamSource === candidate.upstreamSource &&
          entry.state === 'ready',
      ),
  );
  if (!target) return { status: 'unavailable', reason: 'not_admitted' };
  const request = marketEventRequestV3Schema.parse({
    ...input.scope,
    routeTarget: {
      providerId: target.providerId,
      upstreamSource: target.upstreamSource,
      routeIndex: target.routeIndex,
    },
  });
  let response: unknown;
  try {
    response = await input.read(request);
  } catch {
    return { status: 'unavailable', reason: 'upstream_failure', request };
  }
  const exchange = marketEventExchangeV3Schema.safeParse({ request, response });
  if (!exchange.success) return { status: 'unavailable', reason: 'invalid_response', request };
  try {
    verifySplitMappingV3(exchange.data.response);
    verifyRqdataFundIdentityV3(exchange.data.response);
    verifyTushareFundIdentityV3(exchange.data.response);
    verifyHithinkFundIdentityV3(exchange.data.response);
  } catch {
    return { status: 'unavailable', reason: 'invalid_response', request };
  }
  return { status: 'observed', ...exchange.data };
}
