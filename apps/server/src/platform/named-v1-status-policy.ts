import { isDeepStrictEqual } from 'node:util';
import {
  desiredProviderPolicyV3Schema,
  effectiveProviderPolicyV3Schema,
  marketRouteKeyIdV3,
  type DesiredProviderPolicyV3,
  type MarketRouteKeyV3,
} from '@thesis-ledger/schemas';
import { marketPolicyResponse } from '../market/market-policy-storage.js';

const retiredCapability = 'HISTORICAL_TRADING_STATUS';
const expectedHandoverTargets = {
  HK: [{ providerId: 'local-materials', upstreamSource: 'local-materials' }],
  US: [{ providerId: 'local-materials', upstreamSource: 'local-materials' }],
};
const isRetired = (key: MarketRouteKeyV3) => key.capability === retiredCapability;
const policyFormat = 'named-v1-status-policy-stage-v1';

export function stageNamedV1StatusPolicy(current: Record<string, unknown>) {
  const projection = marketPolicyResponse(current);
  const previous = desiredProviderPolicyV3Schema.parse({
    contractVersion: 1, consumer: projection.consumer, requestId: projection.requestId,
    enabled: projection.enabled, revision: projection.revision, routes: projection.routes,
  });
  const oldEffective = effectiveProviderPolicyV3Schema.parse(projection.effectiveProjection);
  if (projection.effectiveStale || current.dsaRevision !== previous.revision)
    throw new Error('活动策略与 DSA 生效修订不同步');
  const stored = current.routes as Record<string, unknown>;
  if (stored.routingConfig && JSON.stringify(stored.routingConfig).includes(retiredCapability))
    throw new Error('目录编辑配置仍引用旧状态能力');

  const findIndex = (key: MarketRouteKeyV3) => previous.routes.findIndex((route) =>
    marketRouteKeyIdV3(route.key) === marketRouteKeyIdV3(key));
  const routes: DesiredProviderPolicyV3['routes'] = [];
  const effectiveRoutes: typeof oldEffective.routes = [];
  const retiredMarkets: string[] = [];
  for (const [index, route] of previous.routes.entries()) {
    const effective = oldEffective.routes[index]!;
    if (!isRetired(route.key)) {
      routes.push(route);
      effectiveRoutes.push(effective);
      continue;
    }
    if (route.key.kind !== 'data' || route.key.assetType !== 'STOCK' || route.enabled === undefined)
      throw new Error('旧状态能力出现未经演练的维度');
    retiredMarkets.push(route.key.market);
    const key = { ...route.key, capability: 'DAILY_TRADING_STATUS' };
    const existingIndex = findIndex(key);
    if (existingIndex >= 0) {
      if (!isDeepStrictEqual(previous.routes[existingIndex], { ...route, key }) ||
          !isDeepStrictEqual(oldEffective.routes[existingIndex], { ...effective, key }))
        throw new Error('现行日级状态选择与旧目标的启停、顺序或可用性不一致');
      continue;
    }
    if (route.key.market === 'CN' || !isDeepStrictEqual(route.targets, expectedHandoverTargets[route.key.market]) ||
        !effective.targets.every((target) => target.eligible === route.enabled))
      throw new Error('缺少对应市场和精确来源的替代验证');
    routes.push({ ...route, key });
    effectiveRoutes.push({ ...effective, key });
  }
  if (retiredMarkets.length !== 3 || retiredMarkets.sort().join(',') !== 'CN,HK,US')
    throw new Error('活动旧路由与审阅的 CN、HK、US 清单不同');
  const revision = previous.revision + 1;
  const requestId = `named-v1-status-policy-${revision}`;
  const next = desiredProviderPolicyV3Schema.parse({ ...previous, revision, requestId, routes });
  const effective = effectiveProviderPolicyV3Schema.parse({
    ...oldEffective, revision, sourceDesiredRevision: revision, requestId, routes: effectiveRoutes,
  });
  return { format: policyFormat, previous, next, effective };
}

type StatusPolicyPlan = ReturnType<typeof stageNamedV1StatusPolicy>;

const jsonLiteral = (value: unknown) => "'" + JSON.stringify(value).replaceAll("'", "''") + "'::jsonb";

export function namedV1StatusPolicySql(plan: StatusPolicyPlan, effectivePayload: unknown) {
  const effective = effectiveProviderPolicyV3Schema.parse(effectivePayload);
  if (!isDeepStrictEqual(effective, { ...plan.effective, appliedAt: effective.appliedAt }))
    throw new Error('DSA 暂存投影与来源切换清单不一致');
  const previous = jsonLiteral(plan.previous);
  const next = jsonLiteral(plan.next);
  return `SET LOCAL standard_conforming_strings = on;
WITH updated AS (
  UPDATE "DesiredProviderPolicy"
    SET revision = (${next}->>'revision')::int,
        routes = (routes-'applyAttempt'-'catalogAudit') || jsonb_build_object('routes', ${next}->'routes'),
        "dsaRevision" = (${next}->>'revision')::int,
        "syncedAt" = ((${jsonLiteral(effective)})->>'appliedAt')::timestamptz,
        "updatedAt" = CURRENT_TIMESTAMP,
        "effectiveProjection" = ${jsonLiteral(effective)}
  WHERE consumer = ${previous}->>'consumer'
    AND revision = (${previous}->>'revision')::int
    AND "dsaRevision" = revision AND "syncState" = 'applied'
    AND enabled = (${previous}->>'enabled')::boolean
    AND routes->>'storageVersion' = 'market-routing-policy-v1'
    AND routes->'routes' = ${previous}->'routes'
  RETURNING *
), history AS (
  INSERT INTO "DesiredProviderPolicyRevision" (id, consumer, revision, enabled, routes,
    "syncState", "dsaRevision", "syncedAt", "lastError", "effectiveProjection")
  SELECT gen_random_uuid(), consumer, revision, enabled, routes,
    "syncState", "dsaRevision", "syncedAt", "lastError", "effectiveProjection" FROM updated
  RETURNING 1
)
SELECT 1 / count(*) AS "verified_status_policy" FROM history;
`;
}
