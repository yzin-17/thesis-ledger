import { z } from 'zod';
import { omitUndefinedDeep } from './exact-optional.js';
import {
  aiCostFactsSchema,
  aiUsageFactsSchema,
  aiGenerationModeSchema,
  aiGenerationContractRefSchema,
} from './ai-execution.js';
const testDetails = z.object({
  kind: z.literal('ai_provider_test').optional(),
  testKind: z.enum(['connection', 'generation']).optional(),
  model: z.string().optional(),
  mode: aiGenerationModeSchema.optional(),
  contract: aiGenerationContractRefSchema.optional(),
  configurationFingerprint: z.string().optional(),
  usage: aiUsageFactsSchema.optional(),
  cost: aiCostFactsSchema.optional(),
  errorCode: z.string().optional(),
  status: z.enum(['healthy', 'degraded', 'down', 'cancelled']).optional(),
});
export const providerHealthRecordSchema = z
  .object({
    provider: z.string(),
    state: z.string(),
    latencyMs: z.number().nullable(),
    checkedAt: z.string(),
    source: z.string().optional(),
    details: testDetails.nullish().transform((value) => value ?? undefined),
  })
  .transform(omitUndefinedDeep);
export const providerHealthPageSchema = z.object({
  items: z.array(providerHealthRecordSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive().max(100),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});
export const providerIssueRecordSchema = z
  .object({
    id: z.string(),
    provider: z.string(),
    symbol: z.string().nullable(),
    severity: z.string(),
    code: z.string(),
    status: z.string(),
    capability: z.string().optional(),
    details: z.record(z.string(), z.unknown()).nullable(),
  })
  .transform(omitUndefinedDeep);
export const notificationFailureRecordSchema = z
  .object({
    id: z.string(),
    provider: z.string(),
    status: z.string(),
    lastError: z.string().nullable(),
  })
  .transform(omitUndefinedDeep);
