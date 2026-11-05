import { z } from 'zod';
import {
  aiInvocationPreparationSchema,
  aiRunStatusSchema,
  type AiCostFacts,
  type AiUsageFacts,
  type AiResearchPolicyV1,
} from '@thesis-ledger/schemas';

const tool = z.object({
  id: z.uuid(),
  aiRunId: z.uuid(),
  tool: z.string().min(1).max(120),
  status: z.enum(['ok', 'unavailable', 'denied']),
  inputSummary: z.string().max(500),
  durationMs: z.number().int().nonnegative().nullable(),
});
const run = z.object({
  kind: z.literal('ai-run'),
  record: z.object({
    id: z.uuid(),
    status: aiRunStatusSchema,
    promptVersion: z.string().min(1).max(128),
    context: z.unknown().optional(),
    relationExperimentId: z.uuid().nullable().optional(),
    executionAttempt: z.number().int().nonnegative(),
    durationMs: z.number().int().nonnegative().nullable(),
    errorCode: z
      .string()
      .max(120)
      .regex(/^[a-zA-Z0-9_:-]+$/u)
      .nullable()
      .optional(),
    modelMetadata: z.unknown(),
    result: z.unknown(),
    researchScopeSnapshot: z.unknown().optional(),
  }),
  toolCalls: z.array(tool).max(10_000),
});
const invocation = z.object({
  kind: z.literal('ai-invocation'),
  record: aiInvocationPreparationSchema,
  facts: z
    .array(
      z.object({
        requestId: z.uuid(),
        eventKey: z.uuid(),
        sequence: z.number().int().positive(),
        kind: z.string(),
        details: z.unknown(),
      }),
    )
    .max(1000),
});
export const researchTraceInputV1Schema = z.strictObject({
  version: z.literal('research-trace-input-v1'),
  datasetVersion: z.string().min(1).max(120),
  records: z
    .array(z.discriminatedUnion('kind', [run, invocation]))
    .min(1)
    .max(1000),
});
export type ResearchTraceRecord = z.infer<typeof researchTraceInputV1Schema>['records'][number];
export type ResearchTraceRequest = {
  requestId: string;
  state: 'success' | 'failed' | 'unknown' | 'not_sent' | 'prepared';
  errorCode: string | null;
  usage: AiUsageFacts | null;
  cost: AiCostFacts | null;
  reservation: AiCostFacts | null;
  settledRevision: number | null;
  dispatchMs: number | null;
  responseMs: number | null;
};
export type ResearchAuditTraceV1 = {
  id: string;
  lineageId: string;
  executionAttempt: number;
  consumer: 'research' | 'strategy_authoring' | 'experiment_internal' | 'unknown';
  status: string | null;
  mode: 'actual' | 'shadow' | null;
  durationMs: number | null;
  terminationReason: string | null;
  budget: Pick<
    AiResearchPolicyV1,
    'maxAiCalls' | 'maxInputTokens' | 'maxOutputTokens' | 'maxCost' | 'costCurrency'
  > | null;
  requests: ResearchTraceRequest[] | null;
  tools: Array<{
    id: string;
    name: string;
    status: 'ok' | 'unavailable' | 'denied';
    inputSummaryFingerprint: string;
    durationMs: number | null;
  }>;
  evidence: Array<{
    id: string;
    required: boolean;
    availability: 'usable' | 'empty' | 'unavailable' | 'unknown';
    bound: boolean;
  }> | null;
  issues: string[];
};
