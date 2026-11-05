import { z } from 'zod';
import { aiGenerationHttpResponseDiagnosticSchema } from './ai-generation-http-response-diagnostic.js';

const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const count = z.number().int().nonnegative();
const packageVersion = z
  .string()
  .regex(/^[0-9][A-Za-z0-9.+-]{0,79}$/u)
  .nullable();
const finishReason = z.enum(['stop', 'length', 'content_filter', 'tool_calls', 'error', 'other']);
const metric = z.strictObject({ chunks: count, characters: count, sha256: digest });
const sample = z.strictObject({
  frame: count,
  contentCharacters: count.nullable(),
  contentSha256: digest.nullable(),
  contentStructure: z.string().max(96).nullable(),
  reasoningCharacters: count.nullable(),
  reasoningSha256: digest.nullable(),
  finishReason: finishReason.nullable(),
  usage: z.boolean(),
});

export const aiGenerationRuntimeDiagnosticSchema = z
  .strictObject({
    version: z.literal('ai-runtime-diagnostic-v1'),
    httpResponse: aiGenerationHttpResponseDiagnosticSchema.optional(),
    packages: z.strictObject({
      ai: packageVersion,
      providerPackage: z.enum(['@ai-sdk/openai-compatible', '@ai-sdk/openai', '@ai-sdk/anthropic']),
      providerVersion: packageVersion,
      zod: packageVersion,
    }),
    stream: z
      .strictObject({
        provider: z
          .strictObject({
            frames: count,
            text: metric,
            reasoning: metric,
            nonTextContentFrames: count,
            unrecognizedDeltaFrames: count,
            finishReasons: finishReason.array().max(6),
            reportedUsage: z
              .strictObject({
                inputTokens: count.nullable(),
                outputTokens: count.nullable(),
                reasoningTokens: count.nullable(),
              })
              .nullable(),
            samples: sample.array().max(24),
            omittedFrames: count,
          })
          .nullable(),
        sdk: z.strictObject({ text: metric, reasoning: metric }),
      })
      .nullable(),
  })
  .refine((value) => new TextEncoder().encode(JSON.stringify(value)).byteLength <= 8192, {
    message: '运行时诊断不得超过 8 KiB',
  });

export type AiGenerationRuntimeDiagnostic = z.infer<typeof aiGenerationRuntimeDiagnosticSchema>;
