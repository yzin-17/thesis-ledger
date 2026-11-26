import { z } from 'zod';
import {
  strategySchema,
  strategyBaseSchema,
  booleanExpressionSchema,
  executionConfigSchema,
} from './backtest-strategy.js';
import { AUTHORING_LIMITS } from './strategy-authoring-definition.js';
import { generatedTradePlanSchema } from './backtest-trade-plan-generation.js';
import { signalSourceSchema } from './backtest-values.js';
import {
  authoringQuestionSchema,
  authoringRequirementSchema,
} from './strategy-authoring-content.js';

export const authoringAnalysisOutputSchema = z
  .object({
    requirements: z.array(authoringRequirementSchema).max(AUTHORING_LIMITS.collectionItems),
    questions: z.array(authoringQuestionSchema).max(AUTHORING_LIMITS.collectionItems),
    runtimeIntents: z.array(z.string().max(2_000)).max(AUTHORING_LIMITS.collectionItems),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.questions.some(
        (question) => question.answer !== null || question.answerState !== 'unanswered',
      )
    )
      ctx.addIssue({ code: 'custom', message: '模型不能代替用户确认答案' });
    if (value.requirements.some((requirement) => requirement.state === 'removed'))
      ctx.addIssue({ code: 'custom', message: '模型不能代替用户移除需求' });
    for (const collection of [value.questions, value.requirements])
      if (new Set(collection.map((item) => item.id)).size !== collection.length)
        ctx.addIssue({ code: 'custom', message: '模型问题及需求标识不能重复' });
  });
const mapping = z
  .array(
    z
      .object({
        requirementId: z.string().min(1).max(120),
        definitionPaths: z
          .array(z.string().min(1).max(240))
          .min(1)
          .max(64)
          .describe(
            '实际对象路径，如 sizing.percent、tradePlan.initialStop.percent；不能在路径中插入 type 值或 definition 前缀',
          ),
      })
      .strict(),
  )
  .max(64);
// 在模型输出合同中直接表达 AST 与执行配置，保留 Canonical 交叉校验。
const definitionSchema = <T extends z.ZodType>(tradePlan: T) =>
  strategyBaseSchema
    .omit({ benchmark: true, entryTrigger: true })
    .extend({
      entry: booleanExpressionSchema,
      exit: booleanExpressionSchema,
      execution: executionConfigSchema,
      tradePlan,
      signalSources: z.array(signalSourceSchema).min(1),
    })
    .superRefine((value, ctx) => {
      if (!value.signalSources.some((source) => source.timeframe === value.primaryTimeframe &&
        source.asset.symbol === value.executionInstrument.symbol && source.asset.market === value.executionInstrument.market &&
        source.asset.assetType === value.executionInstrument.assetType))
        ctx.addIssue({ code: 'custom', path: ['signalSources'], message: '旧生成合同需要同标的主周期来源' });
      const parsed = strategySchema.safeParse(value);
      if (!parsed.success)
        for (const issue of parsed.error.issues)
          ctx.addIssue({ code: 'custom', message: issue.message, path: issue.path });
    });
const generatedDefinition = definitionSchema(generatedTradePlanSchema.optional());
export const authoringGenerationOutputSchema = z
  .object({
    definition: generatedDefinition.safeExtend({
      schemaVersion: z.literal('strategy-definition-v1'),
      signalSources: generatedDefinition.shape.signalSources.element
        .safeExtend({
          priceCoordinate:
            generatedDefinition.shape.signalSources.element.shape.priceCoordinate.unwrap(),
        })
        .array()
        .min(1),
    }),
    coverage: mapping,
  })
  .strict();
export const authoringModificationOutputSchema = z
  .object({ definition: definitionSchema(strategyBaseSchema.shape.tradePlan), coverage: mapping })
  .strict();
