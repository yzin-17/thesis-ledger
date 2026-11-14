import { z } from 'zod';
import {
  aiAdapterSchema,
  aiCostFactsSchema,
  aiUsageFactsSchema,
  aiGenerationModeSchema,
  aiGenerationContractRefSchema,
} from './ai-execution.js';

export const providerProbeDetailsSchema = z
  .object({
    kind: z.literal('ai_provider_probe'),
    testKind: z.enum(['connection', 'generation']),
    status: z.enum(['passed', 'failed', 'cancelled']),
    model: z.string().min(1),
    actualModel: z.string().nullable().optional(),
    adapter: aiAdapterSchema,
    mode: aiGenerationModeSchema,
    purpose: z.string().min(1).optional(),
    contract: aiGenerationContractRefSchema.optional(),
    configurationFingerprint: z.string().min(1),
    usage: aiUsageFactsSchema,
    cost: aiCostFactsSchema,
    errorCode: z.string().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.testKind === 'connection' &&
      (value.purpose !== undefined || value.contract !== undefined)
    ) {
      context.addIssue({ code: 'custom', message: '连接探测不能归因于业务用途或合同' });
    }
    if (
      value.purpose !== undefined &&
      value.contract !== undefined &&
      value.purpose !== value.contract.id
    ) {
      context.addIssue({ code: 'custom', message: '用途与合同不一致' });
    }
  });

export const providerHealthDetailsSchema = z.union([
  providerProbeDetailsSchema,
  z
    .object({
      kind: z.literal('ai_provider_validation'),
      operationId: z.uuid(),
      requestId: z.uuid(),
      model: z.string().min(1),
      purpose: z.string().min(1),
      mode: aiGenerationModeSchema,
      fingerprint: z.string().min(1),
      status: z.enum(['pending', 'passed', 'failed']),
      usage: aiUsageFactsSchema,
      cost: aiCostFactsSchema.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('ai_provider_validation_operation'),
      planFingerprint: z.string().min(1),
      status: z.literal('running'),
    })
    .strict(),
]);
