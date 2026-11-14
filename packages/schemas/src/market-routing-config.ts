import { z } from 'zod';
import { marketRouteKeyV3Schema, desiredProviderPolicyV3Schema } from './market-route-v3.js';

export const routingScopeSchema = z
  .strictObject({
    category: z.enum(['market', 'fundamentals', 'research', 'macro', 'rules', 'security', 'other']),
    market: z.enum(['CN', 'HK', 'US']).optional(),
    assetType: z.string().min(1).optional(),
    capability: z.string().min(1).optional(),
    timeframe: z.enum(['1m', '5m', '15m', '30m', '60m', '1d']).optional(),
    adjustment: z.enum(['none', 'qfq', 'hfq']).optional(),
  })
  .superRefine((scope, ctx) => {
    if (
      (scope.assetType && !scope.market) ||
      (scope.capability && !scope.assetType) ||
      ((scope.timeframe || scope.adjustment) && !scope.capability) ||
      (scope.adjustment && !scope.timeframe)
    )
      ctx.addIssue({ code: 'custom', message: '请按市场、标的类型、用途、周期口径逐级配置' });
  });
export const routingRuleSchema = z
  .strictObject({
    scope: routingScopeSchema,
    // 空数组明确阻止继承；缺少规则才表示继承。
    providers: z.array(z.string().trim().min(1)).max(2),
    upstreamSources: z.record(z.string(), z.string().min(1)).optional(),
  })
  .refine((rule) => new Set(rule.providers).size === rule.providers.length, '主备来源不能重复')
  .refine(
    (rule) =>
      !rule.upstreamSources ||
      (Boolean(rule.scope.capability) &&
        Object.keys(rule.upstreamSources).every((id) => rule.providers.includes(id))),
    '精确来源必须属于本级用途及已选主备',
  );
export const routingAuthoringSchema = z
  .strictObject({
    version: z.literal(1),
    rules: z.array(routingRuleSchema).max(2000),
    keys: z.array(marketRouteKeyV3Schema).max(2000),
    // 保留无损导入的精确绑定；只有获胜规则未修改时继续使用。
    preserved: z
      .array(
        z.strictObject({
          route: desiredProviderPolicyV3Schema.shape.routes.element,
          rule: routingRuleSchema,
        }),
      )
      .max(2000),
  })
  .superRefine((config, ctx) => {
    const ids = config.rules.map((rule) => routingScopeId(rule.scope));
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({ code: 'custom', message: '同一范围只能配置一次' });
  });
export const routingConfigInputSchema = z.strictObject({
  expectedRevision: z.number().int().positive(),
  catalogRevision: z.number().int().nonnegative(),
  config: routingAuthoringSchema,
  previewToken: z.string().optional(),
});
export type RoutingScope = z.infer<typeof routingScopeSchema>;
export function isExactRoutingScope(scope: RoutingScope): boolean {
  if (!scope.market || !scope.assetType || !scope.capability) return false;
  if (scope.capability === 'DAILY_BAR' || scope.capability === 'MINUTE_BAR')
    return Boolean(scope.timeframe && scope.adjustment);
  return true;
}
export type RoutingRule = z.infer<typeof routingRuleSchema>;
export type RoutingAuthoring = z.infer<typeof routingAuthoringSchema>;
export type RoutingConfigInput = z.infer<typeof routingConfigInputSchema>;
export const routingScopeId = (scope: RoutingScope) =>
  JSON.stringify([
    scope.category,
    scope.market ?? null,
    scope.assetType ?? null,
    scope.capability ?? null,
    scope.timeframe ?? null,
    scope.adjustment ?? null,
  ]);
export type RoutingDiagnostic = {
  key: z.infer<typeof marketRouteKeyV3Schema>;
  state: 'covered' | 'single_source' | 'uncovered' | 'unavailable' | 'ambiguous';
  reasons: string[];
  inheritedFrom: RoutingScope | null;
};
export type RoutingConfigView = {
  legacyRuleCount?: number;
  pendingChanges?: number;
  revision: number;
  catalogRevision: number | null;
  catalogStatus: string;
  config: RoutingAuthoring;
  diagnostics: RoutingDiagnostic[];
  newKeys: z.infer<typeof marketRouteKeyV3Schema>[];
  syncState: string;
};
export type RoutingConfigPreview = {
  legacyRuleCount?: number;
  previewToken: string;
  routes: z.infer<typeof desiredProviderPolicyV3Schema>['routes'];
  diagnostics: RoutingDiagnostic[];
  changes: Array<{
    key: z.infer<typeof marketRouteKeyV3Schema>;
    previous: string[];
    next: string[];
  }>;
  exceptions: number;
};
export const routingDiagnosticSchema = z.object({
  key: marketRouteKeyV3Schema,
  state: z.enum(['covered', 'single_source', 'uncovered', 'unavailable', 'ambiguous']),
  reasons: z.array(z.string()),
  inheritedFrom: routingScopeSchema.nullable(),
});
export const routingConfigViewSchema = z.object({
  legacyRuleCount: z.number().int().nonnegative().default(0),
  pendingChanges: z.number().int().nonnegative().default(0),
  revision: z.number().int().positive(),
  catalogRevision: z.number().int().nonnegative().nullable(),
  catalogStatus: z.string(),
  config: routingAuthoringSchema,
  diagnostics: z.array(routingDiagnosticSchema),
  newKeys: z.array(marketRouteKeyV3Schema),
  syncState: z.string(),
});
export const routingConfigPreviewSchema = z.object({
  legacyRuleCount: z.number().int().nonnegative().default(0),
  previewToken: z.string().min(1),
  routes: desiredProviderPolicyV3Schema.shape.routes,
  diagnostics: z.array(routingDiagnosticSchema),
  exceptions: z.number().int().nonnegative(),
  changes: z.array(
    z.object({
      key: marketRouteKeyV3Schema,
      previous: z.array(z.string()),
      next: z.array(z.string()),
    }),
  ),
});
