import { z } from 'zod';
import { providerManifestSchema } from './market.js';
import { omitUndefinedDeep } from './exact-optional.js';
import {
  desiredProviderPolicyV3Schema,
  effectiveProviderPolicyV3Schema,
  marketRouteKeyIdV3,
  marketRouteCapabilityV3Schema,
} from './market-route-v3.js';

export const marketProviderRegistrySchema = z
  .strictObject({
    contractVersion: z.literal(3),
    consumer: z.literal('thesis-ledger'),
    providers: z.array(providerManifestSchema),
  })
  .refine(
    (registry) =>
      new Set(registry.providers.map((provider) => provider.providerId)).size ===
      registry.providers.length,
    'Provider 身份不得重复',
  )
  .transform(omitUndefinedDeep);

/** 原Server目录读取投影；参数资格条目仍复用同一精确能力合同。 */
export const marketRouteCatalogReadClientV3Schema = z.object({
  contractVersion: z.literal(3),
  consumer: z.literal('thesis-ledger'),
  status: z.enum(['complete', 'partial', 'unavailable']),
  catalogRevision: z.number().refine((value) => Number.isInteger(value) && value > 0).nullable(),
  generatedAt: z.string().nullable(),
  entries: z.array(marketRouteCapabilityV3Schema),
  reason: z.enum(['catalog_partial', 'control_timeout', 'control_unauthorized',
    'unsupported_capability', 'invalid_response', 'control_unavailable']).nullable(),
}).superRefine((value, context) => {
  if (value.status === 'complete' && value.reason !== null)
    context.addIssue({ code: 'custom', path: ['reason'], message: '完整目录不应带不可用原因' });
  if (value.status !== 'complete' && value.entries.length > 0)
    context.addIssue({ code: 'custom', path: ['entries'], message: '不完整目录不能发布候选' });
  if (value.status === 'partial' && value.reason !== 'catalog_partial')
    context.addIssue({ code: 'custom', path: ['reason'], message: '部分目录原因不匹配' });
  if (value.status === 'unavailable' && value.reason === null)
    context.addIssue({ code: 'custom', path: ['reason'], message: '不可用目录须有明确原因' });
});
export type MarketRouteCatalogReadClientV3 = z.infer<typeof marketRouteCatalogReadClientV3Schema>;

export const marketPolicyClientResponseSchema = z
  .object({
    ...desiredProviderPolicyV3Schema.shape,
    syncState: z.enum(['pending', 'applied', 'rejected', 'unknown']),
    dsaRevision: z.number().int().nonnegative().nullable().optional(),
    lastError: z
      .object({
        code: z.string().optional(),
        message: z.string().optional(),
        issues: z
          .array(z.object({ path: z.array(z.union([z.string(), z.number()])), reason: z.string() }))
          .optional(),
      })
      .nullable()
      .optional(),
    effectiveProjection: effectiveProviderPolicyV3Schema.nullable(),
    effectiveStale: z.boolean(),
    catalogAudit: z
      .object({
        catalogRevision: z.number().int().positive().nullable().optional(),
        generatedAt: z.iso.datetime({ offset: true }).nullable().optional(),
        integrity: z.enum(['complete', 'partial', 'unavailable']).optional(),
        checkedAt: z.iso.datetime({ offset: true }).optional(),
      })
      .nullable()
      .optional(),
  })
  .superRefine((policy, context) => {
    if (policy.effectiveStale) return;
    const effective = policy.effectiveProjection;
    const current =
      effective &&
      policy.syncState === 'applied' &&
      effective.sourceDesiredRevision === policy.revision &&
      effective.enabled === policy.enabled &&
      effective.routes.length === policy.routes.length &&
      policy.routes.every((route, index) => {
        const projected = effective.routes[index];
        return (
          projected &&
          marketRouteKeyIdV3(projected.key) === marketRouteKeyIdV3(route.key) &&
          projected.targets.length === route.targets.length &&
          route.targets.every((target, targetIndex) => {
            const actual = projected.targets[targetIndex];
            return (
              actual?.providerId === target.providerId &&
              actual.upstreamSource === target.upstreamSource
            );
          })
        );
      });
    if (!current)
      context.addIssue({
        code: 'custom',
        path: ['effectiveStale'],
        message: '当前生效投影必须绑定期望策略',
      });
  })
  .transform(omitUndefinedDeep);

export const marketCatalogStatusSchema = z
  .object({
    generation: z.number().int().nonnegative(),
    checksum: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    cursor: z
      .string()
      .regex(/^generation:[1-9]\d*$/)
      .nullable(),
    syncedAt: z.iso.datetime({ offset: true }).nullable(),
    instrumentCount: z.number().int().nonnegative(),
    readinessState: z.enum(['ready', 'stale', 'unavailable']),
    refreshInProgress: z.boolean(),
    activeJobId: z.string().min(1).nullable(),
    lastAttemptAt: z.iso.datetime({ offset: true }).nullable(),
    lastError: z.string().nullable(),
    retryAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .refine(
    (status) =>
      status.generation > 0
        ? status.checksum !== null && status.cursor === `generation:${status.generation}`
        : status.checksum === null &&
          status.cursor === null &&
          status.readinessState === 'unavailable',
    '目录状态必须绑定当前同步身份',
  );
