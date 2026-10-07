import { z } from 'zod';
import { backtestRunPreparationIntentV3Schema } from './backtest-run-preparation-v3.js';
import { optimizationDiscoveryScopeSchema } from './strategy-optimization.js';
import { runConfigSchemaV3 } from './backtest-contract.js';
import { backtestSnapshotActualSourceV3Schema } from './backtest-data.js';
import { backtestPreflightDiagnosticV3Schema } from './backtest-preflight-v3.js';

export const optimizationPreparationTargetSchema = z.discriminatedUnion('sourceMode', [
  z.strictObject({ sourceMode: z.literal('existing'), strategyVersionId: z.uuid() }),
  z.strictObject({
    sourceMode: z.literal('discovery'),
    discoveryScope: optimizationDiscoveryScopeSchema,
  }),
]);
export type OptimizationPreparationTarget = z.infer<typeof optimizationPreparationTargetSchema>;

export const optimizationRunPreparationRequestSchema = z
  .strictObject({
    target: optimizationPreparationTargetSchema,
    intent: backtestRunPreparationIntentV3Schema,
  })
  .superRefine((value, context) => {
    if (value.intent.warmupBudgetSessions === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['intent', 'warmupBudgetSessions'],
        message: '实验准备必须明确候选预热交易日预算',
      });
    }
  });
export type OptimizationRunPreparationRequest = z.infer<
  typeof optimizationRunPreparationRequestSchema
>;

export const optimizationPreparationRouteRevisionsSchema = z.strictObject({
  desiredRevision: z.number().int().positive(),
  effectiveRevision: z.number().int().positive(),
  catalogRevision: z.number().int().nonnegative(),
});

const responseFields = {
  contractVersion: z.literal(3),
  requestId: z.string().min(1),
  checkedAt: z.iso.datetime({ offset: true }),
  scope: z.literal('baseline-window'),
};
export const optimizationRunPreparationResultSchema = z.discriminatedUnion('status', [
  z
    .strictObject({
      ...responseFields,
      status: z.literal('prepared'),
      runConfig: runConfigSchemaV3,
      strategyContentHash: z.string().regex(/^[a-f0-9]{64}$/),
      actualSource: backtestSnapshotActualSourceV3Schema,
      routeRevisions: optimizationPreparationRouteRevisionsSchema,
    })
    .superRefine((value, context) => {
      if (
        !value.runConfig.executionModel ||
        !value.runConfig.priceInputBindings ||
        value.actualSource.purpose !== 'execution'
      )
        context.addIssue({
          code: 'custom',
          message: '实验配置准备缺少显式模型、输入绑定或执行来源',
        });
    }),
  z
    .strictObject({
      ...responseFields,
      status: z.literal('blocked'),
      diagnostics: z.array(backtestPreflightDiagnosticV3Schema).min(1),
    })
    .superRefine((value, context) => {
      if (!value.diagnostics.some((diagnostic) => diagnostic.severity === 'error'))
        context.addIssue({ code: 'custom', message: '阻断结果必须包含错误诊断' });
    }),
]);
export type OptimizationRunPreparationResult = z.infer<
  typeof optimizationRunPreparationResultSchema
>;
