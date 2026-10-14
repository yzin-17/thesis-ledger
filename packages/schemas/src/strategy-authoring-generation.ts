import { z } from 'zod';
import { strategySchema, expressionSchema, executionConfigSchema } from './backtest-strategy.js';
import { AUTHORING_LIMITS } from './strategy-authoring-definition.js';
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
        definitionPaths: z.array(z.string().min(1).max(240)).min(1).max(64),
      })
      .strict(),
  )
  .max(64);
// 在模型输出合同中直接表达 AST 与执行配置，保留 Canonical 交叉校验。
const generatedDefinition = strategySchema.safeExtend({
  entry: expressionSchema,
  exit: expressionSchema,
  execution: executionConfigSchema,
});
export const authoringGenerationOutputSchema = z
  .object({ definition: generatedDefinition, coverage: mapping })
  .strict();
export const authoringModificationOutputSchema = z
  .object({ definition: generatedDefinition, coverage: mapping })
  .strict();
