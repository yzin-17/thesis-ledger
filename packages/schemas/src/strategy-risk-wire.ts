import { z } from 'zod';
import {
  monitoringPlanSchema,
  monitoringRuleDefinitionSchema,
  riskApplicationCycleModeSchema,
  riskApplicationNotificationSchema,
  type riskApplicationCreateSchema,
} from './strategy-optimization.js';

export const strategyRiskDiffSchema = z.object({
  sourceKey: z.string(),
  before: monitoringRuleDefinitionSchema.nullable(),
  after: monitoringRuleDefinitionSchema.nullable(),
  change: z.enum(['added', 'removed', 'changed', 'unchanged']),
});
export const strategyRiskPreviewReadSchema = z
  .object({
    previewHash: z.string().min(1),
    plan: monitoringPlanSchema,
    evaluations: z.array(
      z.object({
        sourceKey: z.string(),
        state: z.enum(['triggered', 'not_triggered', 'unavailable', 'not_applicable']),
        value: z.string().optional(),
        threshold: z.string(),
        reason: z.string().optional(),
      }),
    ),
    cycleMode: riskApplicationCycleModeSchema,
    context: z.record(z.string(), z.unknown()),
  })
  .passthrough();
export const strategyRiskApplicationReadSchema = z
  .object({
    id: z.uuid(),
    strategyVersionId: z.uuid(),
    accountId: z.uuid(),
    symbol: z.string(),
    revision: z.number().int().positive(),
    planHash: z.string().min(1),
    plan: monitoringPlanSchema,
    cycleMode: riskApplicationCycleModeSchema,
    enabled: z.boolean(),
    notification: riskApplicationNotificationSchema,
    coverage: monitoringPlanSchema.shape.coverage,
    createdAt: z.string(),
    updatedAt: z.string(),
    archivedAt: z.string().nullable().optional(),
    applicationResolution: z
      .object({
        kind: z.enum(['reused', 'upgrade_target_exists', 'already_bound']),
        reason: z.literal('same_identity').optional(),
        sourceApplicationId: z.uuid().optional(),
        management: z.object({
          applicationId: z.uuid(),
          actions: z.array(z.enum(['view', 'edit'])),
        }),
      })
      .optional(),
  })
  .passthrough()
  .refine(
    (v) =>
      v.plan.planHash === v.planHash &&
      (!v.plan.strategyVersionId || v.plan.strategyVersionId === v.strategyVersionId),
    { message: '风险应用的计划身份不匹配' },
  );
export const strategyRiskApplicationListSchema = z.array(strategyRiskApplicationReadSchema);
export const strategyRiskUpgradeInputSchema = z
  .object({ targetStrategyVersionId: z.uuid() })
  .strict();
export const strategyRiskUpgradePreviewReadSchema = strategyRiskPreviewReadSchema.extend({
  currentRevision: z.number().int().positive(),
  diff: z.array(strategyRiskDiffSchema),
  targetApplication: z
    .object({
      id: z.uuid(),
      strategyVersionId: z.uuid(),
      accountId: z.uuid(),
      symbol: z.string(),
      cycleMode: riskApplicationCycleModeSchema,
      revision: z.number().int().positive(),
      enabled: z.boolean(),
      archivedAt: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
});
export const strategyRiskListInputSchema = z
  .object({
    accountId: z.uuid().optional(),
    symbol: z.string().optional(),
    includeArchived: z.boolean().optional(),
  })
  .strict();
export type StrategyRiskApplicationRead = z.infer<typeof strategyRiskApplicationReadSchema>;
export type StrategyRiskPreviewRead = z.infer<typeof strategyRiskPreviewReadSchema>;
export type StrategyRiskUpgradePreviewRead = z.infer<typeof strategyRiskUpgradePreviewReadSchema>;
export type StrategyRiskCreateInput = z.input<typeof riskApplicationCreateSchema>;
export type StrategyRiskNotificationInput = z.infer<typeof riskApplicationNotificationSchema>;
