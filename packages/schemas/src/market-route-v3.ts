import { z } from 'zod';
import { barSeriesIdentitySchema } from './market-bar-series.js';
import { priceAdjustmentSchema } from './market-price-protocol.js';
import { marketRouteTargetSchema } from './market-route-target.js';

const text = z.string().trim().min(1);
const market = z.enum(['CN', 'HK', 'US']);
const assetType = barSeriesIdentitySchema.shape.assetType;

export const marketRouteKeyV3Schema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('bar'),
    market,
    assetType,
    capability: z.enum(['DAILY_BAR', 'MINUTE_BAR']),
    timeframe: z.enum(['1d', '1m']),
    adjustment: priceAdjustmentSchema,
  }),
  z.strictObject({
    kind: z.literal('data'),
    market,
    assetType,
    capability: text,
  }),
]).superRefine((value, context) => {
  if (value.kind === 'bar') {
    if (value.capability === 'DAILY_BAR' && value.timeframe !== '1d') {
      context.addIssue({ code: 'custom', path: ['timeframe'], message: '日线能力只能匹配日线周期' });
    }
    if (value.capability === 'MINUTE_BAR' && value.timeframe !== '1m') {
      context.addIssue({ code: 'custom', path: ['timeframe'], message: '分钟线能力只能匹配分钟周期' });
    }
  } else if (value.capability === 'DAILY_BAR' || value.capability === 'MINUTE_BAR') {
    context.addIssue({ code: 'custom', path: ['capability'], message: '行情能力必须携带周期与价格口径' });
  }
});
export type MarketRouteKeyV3 = z.infer<typeof marketRouteKeyV3Schema>;

export const marketRouteKeyIdV3 = (key: MarketRouteKeyV3): string => key.kind === 'bar'
  ? JSON.stringify([key.kind, key.market, key.assetType, key.capability, key.timeframe, key.adjustment])
  : JSON.stringify([key.kind, key.market, key.assetType, key.capability]);

const routeTargets = z.array(marketRouteTargetSchema).min(1).max(2).superRefine((targets, context) => {
  const seen = new Set<string>();
  targets.forEach((target, index) => {
    const id = JSON.stringify([target.providerId, target.upstreamSource]);
    if (seen.has(id)) {
      context.addIssue({ code: 'custom', path: [index], message: 'RouteTarget 不能重复' });
    }
    seen.add(id);
  });
});

const route = z.strictObject({ key: marketRouteKeyV3Schema, targets: routeTargets });
const routes = z.array(route).superRefine((entries, context) => {
  const seen = new Set<string>();
  entries.forEach((entry, index) => {
    const id = marketRouteKeyIdV3(entry.key);
    if (seen.has(id)) {
      context.addIssue({ code: 'custom', path: [index, 'key'], message: '路由维度不能重复' });
    }
    seen.add(id);
  });
});

const envelope = {
  contractVersion: z.literal(3),
  consumer: z.literal('thesis-ledger'),
  requestId: text,
};

export const desiredProviderPolicyV3Schema = z.strictObject({
  ...envelope,
  revision: z.number().int().positive(),
  enabled: z.boolean(),
  routes,
});
export type DesiredProviderPolicyV3 = z.infer<typeof desiredProviderPolicyV3Schema>;

export const routeAvailabilityReasonV3Schema = z.enum([
  'not_adapted',
  'unsupported_adjustment',
  'credential_missing',
  'not_admitted',
  'admission_invalid',
  'admission_not_yet_valid',
  'admission_expired',
  'quota_unavailable',
  'insufficient_coverage',
  'upstream_failure',
  'basis_incompatible',
  'policy_not_applied',
  'disabled',
]);
export type RouteAvailabilityReasonV3 = z.infer<typeof routeAvailabilityReasonV3Schema>;

const targetStatus = marketRouteTargetSchema.extend({
  routeIndex: z.number().int().min(0).max(1),
  eligible: z.boolean(),
  reason: routeAvailabilityReasonV3Schema.nullable(),
}).superRefine((value, context) => {
  if (value.eligible === (value.reason !== null)) {
    context.addIssue({ code: 'custom', path: ['reason'], message: '可用目标不得有失败原因，不可用目标必须有原因' });
  }
});

export const effectiveProviderPolicyV3Schema = z.strictObject({
  ...envelope,
  revision: z.number().int().nonnegative(),
  sourceDesiredRevision: z.number().int().nonnegative(),
  enabled: z.boolean(),
  routes: z.array(z.strictObject({
    key: marketRouteKeyV3Schema,
    targets: z.array(targetStatus).max(2),
    reason: routeAvailabilityReasonV3Schema.nullable(),
  })),
  appliedAt: z.iso.datetime({ offset: true }),
}).superRefine((policy, context) => {
  const seen = new Set<string>();
  policy.routes.forEach((route, routeIndex) => {
    const key = marketRouteKeyIdV3(route.key);
    if (seen.has(key)) {
      context.addIssue({ code: 'custom', path: ['routes', routeIndex, 'key'], message: '生效路由维度不能重复' });
    }
    seen.add(key);
    const targets = new Set<string>();
    route.targets.forEach((target, targetIndex) => {
      if (target.routeIndex !== targetIndex) {
        context.addIssue({ code: 'custom', path: ['routes', routeIndex, 'targets', targetIndex, 'routeIndex'], message: '生效目标顺序必须对应主备顺序' });
      }
      const id = JSON.stringify([target.providerId, target.upstreamSource]);
      if (targets.has(id)) {
        context.addIssue({ code: 'custom', path: ['routes', routeIndex, 'targets', targetIndex], message: '生效目标不能重复' });
      }
      targets.add(id);
      if (!policy.enabled && target.eligible) {
        context.addIssue({ code: 'custom', path: ['routes', routeIndex, 'targets', targetIndex, 'eligible'], message: '禁用的策略不能存在可用目标' });
      }
    });
    if (route.targets.some((target) => target.eligible) && route.reason !== null) {
      context.addIssue({ code: 'custom', path: ['routes', routeIndex, 'reason'], message: '有可用目标的路由不能标记失败' });
    }
  });
});
export type EffectiveProviderPolicyV3 = z.infer<typeof effectiveProviderPolicyV3Schema>;

/** Catalog entries describe exact adapter/account readiness for a single route target. */
export const marketRouteCapabilityV3Schema = z.strictObject({
  key: marketRouteKeyV3Schema,
  target: marketRouteTargetSchema,
  state: z.enum(['ready', 'credential_missing', 'not_admitted', 'quota_unavailable']),
});
export type MarketRouteCapabilityV3 = z.infer<typeof marketRouteCapabilityV3Schema>;

export type MarketRoutePolicyIssueV3 = {
  path: (string | number)[];
  reason: RouteAvailabilityReasonV3;
};

export const validateDesiredProviderPolicyV3 = (
  policy: DesiredProviderPolicyV3,
  capabilities: readonly MarketRouteCapabilityV3[],
): MarketRoutePolicyIssueV3[] => {
  const issues: MarketRoutePolicyIssueV3[] = [];
  policy.routes.forEach((entry, routeIndex) => {
    const requestedKey = entry.key;
    entry.targets.forEach((target, targetIndex) => {
      const sameTarget = capabilities.filter((item) =>
        item.target.providerId === target.providerId && item.target.upstreamSource === target.upstreamSource);
      const exact = sameTarget.find((item) => marketRouteKeyIdV3(item.key) === marketRouteKeyIdV3(requestedKey));
      let reason: RouteAvailabilityReasonV3 | null = null;
      if (exact) {
        if (exact.state !== 'ready') reason = exact.state;
      } else if (requestedKey.kind === 'bar' && sameTarget.some((item) =>
        item.key.kind === 'bar' && item.key.market === requestedKey.market &&
        item.key.assetType === requestedKey.assetType && item.key.capability === requestedKey.capability &&
        item.key.timeframe === requestedKey.timeframe)) {
        reason = 'unsupported_adjustment';
      } else {
        reason = 'not_adapted';
      }
      if (reason) issues.push({ path: ['routes', routeIndex, 'targets', targetIndex], reason });
    });
  });
  return issues;
};
