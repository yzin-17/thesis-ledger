import { effectiveProviderPolicyV3Schema } from '@thesis-ledger/schemas';
import {
  routeAvailabilityLabelV3,
  routeKeyIdV3,
  type MarketPolicyRouteRowV3,
} from './market-data-routes-v3.js';
import {
  dataSourceDisplay,
  type MarketPolicyResponse,
  type ProviderManifest,
  type RouteTarget,
} from './market-data.types.js';

export const targetLabelV3 = (target: RouteTarget, providers: readonly ProviderManifest[]) =>
  dataSourceDisplay(target.providerId, target.upstreamSource, providers);

export const policySyncLabelV3 = (policy: MarketPolicyResponse | null, dirty: boolean) => {
  if (dirty) return '有未保存修改';
  if (!policy) return '等待策略数据';
  if (policy.syncState === 'applied' && !policy.effectiveStale) return '已应用';
  if (policy.syncState === 'pending') return '等待应用';
  if (policy.syncState === 'rejected') return '尚未应用';
  return '状态待检查';
};

export const routePolicySummaryV3 = (policy: MarketPolicyResponse | undefined) => {
  if (!policy) return '等待策略数据';
  if (policy.syncState === 'applied' && !policy.effectiveStale) return '已同步';
  if (policy.syncState === 'pending') return '等待应用';
  if (policy.syncState === 'rejected') return '尚未应用';
  return '状态待检查';
};

export const effectivePolicyV3 = (policy: MarketPolicyResponse | null) => {
  if (!policy?.effectiveProjection) return null;
  const parsed = effectiveProviderPolicyV3Schema.safeParse(policy.effectiveProjection);
  return parsed.success ? parsed.data : null;
};

const policyIssueForRouteV3 = (policy: MarketPolicyResponse | null, routeId: string) => {
  if (!policy?.lastError?.issues) return null;
  const routeIndex = policy.routes.findIndex((route) => routeKeyIdV3(route.key) === routeId);
  if (routeIndex < 0) return null;
  const issue = policy.lastError.issues.find(
    (item) => item.path[0] === 'routes' && item.path[1] === routeIndex,
  );
  return issue?.reason ?? null;
};

export const effectiveRouteLabelV3 = (
  policy: MarketPolicyResponse | null,
  route: MarketPolicyRouteRowV3,
  dirty: boolean,
) => {
  if (dirty) return '待保存';
  if (!policy) return '尚未配置';
  const desired = policy.routes.find((item) => routeKeyIdV3(item.key) === route.id);
  if (!desired) return '未配置';
  const issue = policyIssueForRouteV3(policy, route.id);
  if (issue) return routeAvailabilityLabelV3(issue);

  const effective = effectivePolicyV3(policy);
  const effectiveRoute = effective?.routes.find((item) => routeKeyIdV3(item.key) === route.id);
  const isCurrent =
    policy.syncState === 'applied' &&
    effective?.sourceDesiredRevision === policy.revision &&
    effectiveRoute !== undefined;
  if (isCurrent && effectiveRoute.targets.some((target) => target.eligible)) return '已生效';
  if (effectiveRoute) {
    const reason =
      effectiveRoute.reason ??
      effectiveRoute.targets.find((target) => !target.eligible)?.reason ??
      'policy_not_applied';
    return routeAvailabilityLabelV3(reason);
  }
  if (policy.syncState === 'pending' || policy.syncState === 'rejected') {
    return routeAvailabilityLabelV3(policy.lastError?.code ?? 'policy_not_applied');
  }
  return '尚未生效';
};
