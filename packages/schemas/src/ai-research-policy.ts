import { z } from 'zod';
import { nonNegativeDecimalStringSchema } from './monetary-values.js';
import { AI_TIMEOUT_BASELINES } from './ai-execution-timeout.js';

const researchPaidRouteSchema = z
  .object({
    provider: z.string().trim().min(1).max(120),
    models: z.array(z.string().trim().min(1).max(200)).min(1).max(32),
  })
  .strict();

const decimalIsZero = (value: string) => /^0+(?:\.0+)?$/u.test(value);

export const aiResearchPolicyV1Schema = z
  .object({
    version: z.literal('research-policy-v1').default('research-policy-v1'),
    maxAiCalls: z.number().int().min(1).max(2).default(2),
    maxInputTokens: z.number().int().min(1).max(10_000_000).default(100_000),
    maxOutputTokens: z.number().int().min(1).max(2_000_000).default(20_000),
    maxDurationSeconds: z
      .number()
      .int()
      .min(30)
      .max(86_400)
      .default(AI_TIMEOUT_BASELINES.research.taskBudgetMs / 1000),
    maxCost: nonNegativeDecimalStringSchema.default('0'),
    costCurrency: z
      .string()
      .regex(/^[A-Z]{3}$/u)
      .nullable()
      .default(null),
    paidRoutes: z.array(researchPaidRouteSchema).max(12).default([]),
  })
  .strict()
  .superRefine((value, context) => {
    const paid = !decimalIsZero(value.maxCost);
    if (paid && (!value.costCurrency || value.paidRoutes.length === 0))
      context.addIssue({
        code: 'custom',
        path: ['maxCost'],
        message: '付费研究必须同时配置币种和允许的 Provider/模型范围',
      });
    if (!paid && (value.costCurrency !== null || value.paidRoutes.length > 0))
      context.addIssue({
        code: 'custom',
        path: ['maxCost'],
        message: '零费用策略不得携带付费路由授权',
      });
  });
export type AiResearchPolicyV1 = z.infer<typeof aiResearchPolicyV1Schema>;

export const DEFAULT_AI_RESEARCH_POLICY_V1: AiResearchPolicyV1 = aiResearchPolicyV1Schema.parse({});
