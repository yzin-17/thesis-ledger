import { z } from 'zod';

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const errorFacts = z.strictObject({
  code: count.nullable(),
  category: z.enum([
    'authentication',
    'quota',
    'rate_limit',
    'overloaded',
    'context_limit',
    'unsupported_parameter',
    'mandatory_reasoning',
    'provider_error',
    'other',
  ]),
  messageCharacters: count.nullable(),
  messageSha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/u)
    .nullable(),
});

export const aiGenerationHttpResponseDiagnosticSchema = z
  .strictObject({
    version: z.literal('ai-http-response-diagnostic-v1'),
    boundary: z.literal('fetch_response'),
    responses: count.min(1),
    omittedResponses: count,
    status: z.number().int().min(100).max(599),
    contentType: z.enum(['sse', 'json', 'html', 'text', 'other', 'missing']),
    bodyBytes: count,
    bodyComplete: z.boolean(),
    bodyTruncated: z.boolean(),
    bodyJson: z.enum(['valid', 'invalid', 'oversize']).nullable(),
    sse: z
      .strictObject({
        events: count,
        invalidJsonEvents: count,
        oversizeEvents: count,
        done: z.boolean(),
        incompleteEvent: z.boolean(),
      })
      .nullable(),
    error: errorFacts
      .extend({
        origin: z.enum(['http_body', 'sse_error']),
        structuralPreview: z.string().max(192),
        truncated: z.boolean(),
        upstream: errorFacts.nullable(),
      })
      .nullable(),
  })
  .superRefine((value, context) => {
    if (value.omittedResponses !== value.responses - 1)
      context.addIssue({ code: 'custom', message: '仅保留首个 HTTP 响应，其余次数必须保留' });
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 2048)
      context.addIssue({ code: 'custom', message: 'HTTP 响应诊断不得超过 2 KiB' });
  });
