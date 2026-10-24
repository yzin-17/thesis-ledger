import { z } from 'zod';
import { aiContextSchema, aiRunCursorSchema, aiRunStatusSchema, aiToolCallSchema } from './ai.js';
import {
  aiExecutionReadModelSchema,
  aiRoutingSettingsSchema,
  aiUsageCompletenessSchema,
} from './ai-execution.js';
import {
  aiResearchDisplayProjectionSchema,
  aiResearchListSourceFilterSchema,
} from './research-display.js';
import { researchResultSchema } from './research.js';

/** 执行审计只读；报告正文仍由带可信范围的 research/reports 接口负责。 */
export const researchRunRecordSchema = z.object({
  id: z.uuid(),
  provider: z.string(),
  model: z.string(),
  promptVersion: z.string(),
  status: z.string().min(1).max(80),
  question: z.string().nullable().optional(),
  context: aiContextSchema.nullable().default(null),
  result: researchResultSchema.nullable().optional(),
  errorCode: z.string().nullable().optional(),
  errorSummary: z.string().nullable().optional(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }).optional(),
  startedAt: z.iso.datetime({ offset: true }).nullable().optional(),
  completedAt: z.iso.datetime({ offset: true }).nullable().optional(),
  durationMs: z.number().nullable().optional(),
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  cost: z.union([z.string(), z.number()]).optional(),
  retryOfRunId: z.uuid().nullable().optional(),
  fallbackSummary: z.string().nullable().optional(),
  checkpoint: z.record(z.string(), z.unknown()).nullable().optional(),
  execution: aiExecutionReadModelSchema.nullable().optional(),
  usageCompleteness: aiUsageCompletenessSchema.optional(),
  display: aiResearchDisplayProjectionSchema.optional(),
  toolCalls: z.array(aiToolCallSchema.extend({ durationMs: z.number().optional() })).optional(),
});
export const researchRunPageSchema = z
  .object({
    items: z.array(researchRunRecordSchema),
    nextCursor: aiRunCursorSchema.nullable(),
    hasMore: z.boolean(),
  })
  .refine((v) => v.hasMore === (v.nextCursor !== null), '运行分页状态不一致');
export const researchRunListInputSchema = z
  .object({
    view: z.literal('research').optional(),
    status: aiRunStatusSchema.optional(),
    search: z.string().trim().min(1).max(200).optional(),
    source: aiResearchListSourceFilterSchema.optional(),
    includeInternal: z.boolean().optional(),
    sort: z.literal('updated_desc').optional(),
    limit: z.number().int().min(1).max(100).default(50),
    cursor: aiRunCursorSchema.optional(),
  })
  .strict();
export const researchRoutingReadSchema = aiRoutingSettingsSchema.extend({
  candidates: z.array(
    z.object({
      providerId: z.string(),
      providerName: z.string(),
      model: z.string(),
      enabled: z.boolean(),
      health: z.string(),
      authMode: z.enum(['api_key', 'none']),
      priceConfigured: z.boolean(),
    }),
  ),
});
export type ResearchRunRecord = z.infer<typeof researchRunRecordSchema>;
export type ResearchRunListInput = z.input<typeof researchRunListInputSchema>;
export const researchRunReceiptSchema = researchRunRecordSchema
  .pick({
    id: true,
    provider: true,
    model: true,
    promptVersion: true,
    status: true,
    question: true,
    context: true,
  })
  .partial({ status: true })
  .extend({ context: aiContextSchema.nullable().optional() });
export const researchStrategyOptionsSchema = z.array(
  z.object({
    id: z.uuid(),
    name: z.string(),
    versions: z.array(z.object({ id: z.uuid(), version: z.number().int() })),
  }),
);
