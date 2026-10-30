import { z } from 'zod';
import {
  AI_TIMEOUT_POLICY_VERSION,
  aiExecutionTimeoutPolicySchema,
  aiTimeoutProfileSchema,
} from './ai-execution-timeout.js';

const limit = z.strictObject({
  baselineMs: z.number().nonnegative(),
  overrideMs: z.number().positive().nullable(),
  source: z.enum(['route', 'provider', 'system', 'legacy', 'profile']),
  effectiveMs: z.number().nonnegative(),
  deadlineAt: z.number().finite(),
  clipped: z.boolean(),
});
export const aiTimeoutDecisionSchema = z.strictObject({
  version: z.literal(AI_TIMEOUT_POLICY_VERSION),
  profile: aiTimeoutProfileSchema,
  transport: z.enum(['single', 'stream']),
  policy: aiExecutionTimeoutPolicySchema,
  resolvedAt: z.number().finite(),
  taskDeadlineAt: z.number().finite(),
  executionDeadlineAt: z.number().finite(),
  remainingMs: z.number().nonnegative(),
  canStart: z.boolean(),
  connection: z.strictObject({
    requestedMs: z.number().positive(),
    effectiveMs: z.number().nonnegative().nullable(),
    capability: z.enum(['unavailable', 'independent']),
  }),
  first: limit.nullable(),
  idle: limit.nullable(),
  completion: limit.nullable(),
  sdkTimeout: z.strictObject({
    totalMs: z.number().nonnegative().optional(),
    firstChunkMs: z.number().nonnegative().optional(),
    chunkMs: z.number().nonnegative().optional(),
  }),
});
export type AiTimeoutDecision = z.infer<typeof aiTimeoutDecisionSchema>;
