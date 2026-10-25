import { describe, expect, it } from 'vitest';
import { aiGenerationHttpRequestDiagnosticSchema } from '../src/ai-generation-http-request-diagnostic.js';
import { aiGenerationErrorSchema } from '../src/ai-generation-error.js';

const value = {
  version: 'ai-http-request-diagnostic-v1',
  boundary: 'fetch_dispatch',
  attempts: 1,
  omittedRequests: 0,
  method: 'POST',
  endpoint: 'chat_completions',
  bodyStatus: 'json',
  bodyBytes: 1000,
  bodySha256: 'a'.repeat(64),
  model: 'openrouter/free',
  stream: true,
  responseFormat: 'json_schema',
  schemaStrict: true,
  schemaSha256: 'b'.repeat(64),
  requireParameters: true,
  tokenLimits: { max_tokens: 20000, max_completion_tokens: null, max_output_tokens: null },
  reasoningEffort: null,
  reasoning: null,
  includeUsage: true,
  toolCount: null,
  truncated: false,
};

describe('实际 HTTP 请求诊断合同', () => {
  it('严格白名单、计数与 1 KiB 边界', () => {
    expect(aiGenerationHttpRequestDiagnosticSchema.parse(value)).toEqual(value);
    expect(Buffer.byteLength(JSON.stringify(value))).toBeLessThanOrEqual(1024);
    for (const change of [
      { headers: {} },
      { messages: [] },
      { url: 'secret' },
      { body: 'secret' },
      { omittedRequests: 1 },
      { model: 'private\nmodel' },
      { tokenLimits: { ...value.tokenLimits, private: 1 } },
    ]) {
      expect(
        aiGenerationHttpRequestDiagnosticSchema.safeParse({ ...value, ...change }).success,
      ).toBe(false);
    }
    const extra = {
      ...value,
      model: 'x'.repeat(200),
      reasoning: {
        effort: 'minimal',
        enabled: true,
        exclude: false,
        maxTokens: Number.MAX_SAFE_INTEGER,
      },
      tokenLimits: {
        max_tokens: Number.MAX_SAFE_INTEGER,
        max_completion_tokens: Number.MAX_SAFE_INTEGER,
        max_output_tokens: Number.MAX_SAFE_INTEGER,
      },
    };
    const largest = {
      ...extra,
      attempts: Number.MAX_SAFE_INTEGER,
      omittedRequests: Number.MAX_SAFE_INTEGER - 1,
      bodyBytes: Number.MAX_SAFE_INTEGER,
      toolCount: Number.MAX_SAFE_INTEGER,
      bodyStatus: 'unavailable',
      reasoningEffort: 'minimal',
      method: 'DELETE',
      stream: false,
      schemaStrict: false,
      requireParameters: false,
      includeUsage: false,
    };
    expect(Buffer.byteLength(JSON.stringify(largest))).toBeLessThanOrEqual(1024);
    expect(aiGenerationHttpRequestDiagnosticSchema.safeParse(largest).success).toBe(true);
    expect(
      aiGenerationHttpRequestDiagnosticSchema.safeParse({ ...largest, model: 'x'.repeat(1000) })
        .success,
    ).toBe(false);
  });
  it('旧错误和旧请求可继续缺省 HTTP 诊断', () => {
    expect(
      aiGenerationErrorSchema.parse({
        code: 'schema_invalid',
        phase: 'validation',
        summary: '旧记录',
        externalResult: 'complete',
      }),
    ).not.toHaveProperty('diagnostic');
  });
});
