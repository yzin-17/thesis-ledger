import { z } from 'zod';

export const aiGenerationErrorCodeSchema = z.enum([
  'configuration_invalid',
  'capability_unsupported',
  'authentication_failed',
  'permission_denied',
  'payment_required',
  'provider_rejected',
  'transport_unknown',
  'provider_stream_error',
  'output_truncated',
  'empty_output',
  'refused',
  'schema_invalid',
  'business_invalid',
  'cancelled',
  'persistence_failed',
]);
export type AiGenerationErrorCode = z.infer<typeof aiGenerationErrorCodeSchema>;

export const aiGenerationPhaseSchema = z.enum([
  'configuration',
  'preflight',
  'request',
  'response_headers',
  'stream',
  'validation',
  'persistence',
  'settlement',
  'cancellation',
]);
export const aiExternalResultCertaintySchema = z.enum([
  'not_sent',
  'rejected_before_generation',
  'unknown',
  'complete',
]);

export const aiGenerationFailureDiagnosticSchema = z.strictObject({
  version: z.literal('ai-failure-diagnostic-v1'),
  errorClass: z.enum(['no_object', 'no_output', 'syntax', 'schema', 'unknown']),
  generationMode: z.enum(['native_schema', 'json_validated', 'json_mode']),
  finishReason: z
    .enum(['stop', 'length', 'content-filter', 'tool-calls', 'error', 'other', 'unknown'])
    .nullable(),
  actualModel: z
    .string()
    .regex(/^[A-Za-z0-9_.:/-]{1,200}$/u)
    .nullable(),
  outputCharacters: z.number().int().nonnegative().nullable(),
  outputSha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/u)
    .nullable(),
  jsonStatus: z.enum(['missing', 'empty', 'valid', 'invalid', 'not_checked_oversize']),
  jsonRootType: z.enum(['object', 'array', 'string', 'number', 'boolean', 'null']).nullable(),
  structuralPreview: z.string().max(2048).nullable(),
  truncated: z.boolean(),
});
export type AiGenerationFailureDiagnostic = z.infer<typeof aiGenerationFailureDiagnosticSchema>;

export const aiGenerationErrorSchema = z.strictObject({
  code: aiGenerationErrorCodeSchema,
  phase: aiGenerationPhaseSchema,
  summary: z.string().trim().min(1).max(500),
  externalResult: aiExternalResultCertaintySchema,
  requestId: z.uuid().nullable().default(null),
  retryAfterMs: z.number().int().nonnegative().max(86_400_000).optional(),
  diagnostic: aiGenerationFailureDiagnosticSchema.optional(),
});
export type AiGenerationError = z.infer<typeof aiGenerationErrorSchema>;
