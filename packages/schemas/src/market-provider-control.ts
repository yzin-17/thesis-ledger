import { z } from 'zod';
import {
  effectiveProviderPolicyV3Schema,
  marketRouteCapabilityV3Schema,
} from './market-route-v3.js';
import { marketPolicyClientResponseSchema } from './market-client-projections.js';
import { omitUndefinedDeep } from './exact-optional.js';
import { marketAccountAccessSchema } from './market-account-access.js';

const identity = {
  contractVersion: z.literal(3),
  consumer: z.literal('thesis-ledger'),
  providerId: z.string().min(1),
  requestId: z.string().min(1),
};
export const marketProviderConfigResponseSchema = z.strictObject({
  ...identity,
  enabled: z.boolean(),
  configured: z.boolean(),
  credentialConfigured: z.boolean(),
  credentialSource: z.enum(['control', 'environment', 'none', 'built_in']),
  credentialFieldsConfigured: z.record(z.string(), z.boolean()),
  credentialMethod: z.string().nullable(),
  configVersion: z.number().int().nonnegative(),
  settings: z.record(z.string(), z.unknown()),
  secretKeyVersion: z.string().nullable(),
  updatedAt: z.iso.datetime({ offset: true }),
  effective: effectiveProviderPolicyV3Schema.nullable(),
});
export const marketProviderProbeRouteSchema = z.strictObject({
  key: marketRouteCapabilityV3Schema.shape.key,
  target: marketRouteCapabilityV3Schema.shape.target,
});
export type MarketProviderProbeRoute = z.infer<typeof marketProviderProbeRouteSchema>;
export const marketProviderAccountAccessReportSchema = z.strictObject({
  scope: z.literal('account_interfaces'),
  credentialContext: z.enum(['draft', 'current']),
  configVersion: z.number().int().nonnegative(),
  checkedAt: z.iso.datetime({ offset: true }),
  validUntil: z.iso.datetime({ offset: true }),
  routes: z.array(marketProviderProbeRouteSchema.extend({ access: marketAccountAccessSchema })).min(1).max(6),
}).superRefine((value, context) => {
  for (const route of value.routes) {
    if (route.access.configVersion !== value.configVersion || route.access.checkedAt !== value.checkedAt || route.access.validUntil !== value.validUntil)
      context.addIssue({ code: 'custom', message: '逐功能访问结论必须绑定同一配置代次和检查时间' });
  }
}).refine((value) => Date.parse(value.checkedAt) < Date.parse(value.validUntil), '账户检查有效时间必须有序');
export type MarketProviderAccountAccessReport = z.infer<typeof marketProviderAccountAccessReportSchema>;
const probeResult = z
  .strictObject({
    status: z.enum(['healthy', 'unavailable', 'unconfigured']),
    readOnly: z.literal(true),
    attempted: z.boolean(),
    errorCode: z.string().optional(),
    latencyMs: z.number().int().nonnegative().optional(),
  })
  .superRefine((result, context) => {
    if (result.status === 'healthy' && (!result.attempted || result.errorCode)) {
      context.addIssue({ code: 'custom', message: '读取成功必须有实际执行且无错误' });
    }
  });
export const marketProviderTestResponseSchema = z
  .strictObject({
    ...identity,
    status: z.enum(['healthy', 'degraded', 'unconfigured']),
    credentialConfigured: z.boolean(),
    capabilityResults: z.record(z.string(), probeResult),
    purpose: z.enum(['capability_read', 'account_access']).optional(),
    accountAccess: marketProviderAccountAccessReportSchema.optional(),
    routeResults: z
      .array(
        marketRouteCapabilityV3Schema.safeExtend({
          result: probeResult,
          sample: z
            .strictObject({
              symbol: z.string().min(1),
              start: z.iso.date().optional(),
              end: z.iso.date().optional(),
            })
            .refine(
              (sample) =>
                (sample.start === undefined) === (sample.end === undefined) &&
                (!sample.start || !sample.end || sample.start <= sample.end),
              '检查区间必须完整且起点不晚于终点',
            )
            .optional(),
        }),
      )
      .optional(),
  })
  .superRefine((value, context) => {
    const accountCheck = value.purpose === 'account_access';
    if (accountCheck !== !!value.accountAccess || (accountCheck &&
      (Object.keys(value.capabilityResults).length !== 0 || value.routeResults !== undefined)))
      context.addIssue({ code: 'custom', message: '账户检查必须使用独立结果，不能冒充业务读取' });
    const results = Object.values(value.capabilityResults);
    if (
      !accountCheck && value.status === 'healthy' &&
      (results.length === 0 || results.some((result) => result.status !== 'healthy'))
    ) {
      context.addIssue({ code: 'custom', message: '检查成功必须包含非空的通过结果' });
    }
    if (accountCheck && value.status === 'healthy' && value.accountAccess?.routes.some((route) => route.access.state !== 'allowed'))
      context.addIssue({ code: 'custom', message: '账户检查通过必须全部接口可访问' });
    const seen = new Set<string>();
    for (const route of [...(value.routeResults ?? []), ...(value.accountAccess?.routes ?? [])]) {
      const id = JSON.stringify([route.key, route.target]);
      if (route.target.providerId !== value.providerId || seen.has(id)) {
        context.addIssue({ code: 'custom', message: '检查结果必须属于当前来源且精确目标不得重复' });
      }
      seen.add(id);
    }
  })
  .transform(omitUndefinedDeep);
export type MarketProviderTestResponse = z.infer<typeof marketProviderTestResponseSchema>;
export const marketProviderRemovalProjectionSchema = z
  .object({
    providerId: z.string().min(1),
    removed: z.boolean(),
    pending: z.boolean().optional(),
    routeDiff: z.array(z.unknown()),
    policy: marketPolicyClientResponseSchema,
  })
  .refine(
    (value) =>
      !value.removed ||
      (!value.pending && value.policy.syncState === 'applied' && !value.policy.effectiveStale),
    '移除成功必须绑定当前生效策略',
  );
