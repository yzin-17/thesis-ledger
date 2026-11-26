import { z } from 'zod';
import { strategyBaseSchema, booleanExpressionSchema, executionConfigSchema } from './backtest-strategy.js';
import { signalSourceSchema } from './backtest-values.js';
import { generatedTradePlanSchema, generatedTradePlanSchemaFor } from './backtest-trade-plan-generation.js';
import { generatedBooleanExpressionV6Schema } from './strategy-generation-expressions-v6.js';
import { strategyCapabilityGapSchema } from './strategy-capability-gap.js';
import { authoringGenerationOutputSchema } from './strategy-authoring-generation.js';

export const generatedSourceDeclarationV6Schema = signalSourceSchema.omit({ series: true }).extend({
  priceCoordinate: signalSourceSchema.shape.priceCoordinate.unwrap(),
});
const base = strategyBaseSchema.omit({ benchmark: true }).extend({
  schemaVersion: z.literal('strategy-definition-v1'),
  entryTrigger: z.enum(['rising-edge', 'while-flat']),
  signalSources: z.array(generatedSourceDeclarationV6Schema).max(12),
  entry: booleanExpressionSchema, exit: booleanExpressionSchema, execution: executionConfigSchema,
  tradePlan: generatedTradePlanSchema.optional(),
});

/** 结构边界保留独立语义错误；接收后按同一编译器汇总来源、绑定和能力诊断。 */
export const strategyOutlineV6Schema = base;
export const generatedStrategyDefinitionV6Schema = base.extend({
  entry: generatedBooleanExpressionV6Schema, exit: generatedBooleanExpressionV6Schema,
  tradePlan: generatedTradePlanSchemaFor(generatedBooleanExpressionV6Schema).optional(),
});
export const authoringGenerationOutputV6Schema = z.strictObject({
  definition: generatedStrategyDefinitionV6Schema,
  coverage: authoringGenerationOutputSchema.shape.coverage,
});
export const authoringModificationOutputV6Schema = authoringGenerationOutputV6Schema;

const discoveryOmissions = {
  schemaVersion: true, executionInstrument: true, primaryTimeframe: true, cost: true,
} as const;
export const discoveryStrategyOutlineV6Schema = base.omit(discoveryOmissions).extend({
  signalSources: z.array(generatedSourceDeclarationV6Schema.omit({ asset: true })).max(12),
  execution: executionConfigSchema.optional(),
});
export const discoveryStrategyV6Schema = generatedStrategyDefinitionV6Schema.omit(discoveryOmissions).extend({
  signalSources: z.array(generatedSourceDeclarationV6Schema.omit({ asset: true })).max(12),
  execution: executionConfigSchema.optional(),
});
export const discoveryGenerationOutputV6Schema = z.strictObject({
  strategy: discoveryStrategyV6Schema,
  reason: z.string().trim().min(1).max(2000).describe(
    '按实际strategy逐项回读，比较可写数学符号。gt为高于，consecutive内的gt表示每根分别高于；上穿和下穿只用于cross。不把比较写成突破，不改边界或参数。',
  ),
  evidenceRefs: z.array(z.string().trim().min(1).max(200)).max(20),
});
export const discoveryGenerationResultV6Schema = z.union([discoveryGenerationOutputV6Schema, strategyCapabilityGapSchema]);
export type StrategyOutlineV6 = z.infer<typeof strategyOutlineV6Schema>;
