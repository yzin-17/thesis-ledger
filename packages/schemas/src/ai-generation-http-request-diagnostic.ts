import { z } from 'zod';

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const digest = z
  .string()
  .regex(/^[a-f0-9]{64}$/u)
  .nullable();
const effort = z
  .enum(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'other'])
  .nullable();

export const aiGenerationHttpRequestDiagnosticSchema = z
  .strictObject({
    version: z.literal('ai-http-request-diagnostic-v1'),
    boundary: z.literal('fetch_dispatch'),
    attempts: count.min(1),
    omittedRequests: count,
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'other']),
    endpoint: z.enum(['chat_completions', 'responses', 'messages', 'other']),
    bodyStatus: z.enum(['json', 'non_json', 'non_object', 'oversize', 'unavailable']),
    bodyBytes: count.nullable(),
    bodySha256: digest,
    model: z
      .string()
      .regex(/^[A-Za-z0-9_.:/-]{1,200}$/u)
      .nullable(),
    stream: z.boolean().nullable(),
    responseFormat: z.enum(['json_schema', 'json_object', 'text', 'other']).nullable(),
    schemaStrict: z.boolean().nullable(),
    schemaSha256: digest,
    requireParameters: z.boolean().nullable(),
    tokenLimits: z.strictObject({
      max_tokens: count.nullable(),
      max_completion_tokens: count.nullable(),
      max_output_tokens: count.nullable(),
    }),
    reasoningEffort: effort,
    reasoning: z
      .strictObject({
        effort,
        enabled: z.boolean().nullable(),
        exclude: z.boolean().nullable(),
        maxTokens: count.nullable(),
      })
      .nullable(),
    includeUsage: z.boolean().nullable(),
    toolCount: count.nullable(),
    truncated: z.boolean(),
  })
  .superRefine((value, context) => {
    if (value.omittedRequests !== value.attempts - 1)
      context.addIssue({
        code: 'custom',
        path: ['omittedRequests'],
        message: '仅记录首个发送请求，其余次数必须保留',
      });
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 1024)
      context.addIssue({ code: 'custom', message: 'HTTP 请求诊断不得超过 1 KiB' });
  });

export type AiGenerationHttpRequestDiagnostic = z.infer<
  typeof aiGenerationHttpRequestDiagnosticSchema
>;
