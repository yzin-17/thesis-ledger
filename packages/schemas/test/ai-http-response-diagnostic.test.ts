import { describe, expect, it } from 'vitest';
import { aiGenerationRuntimeDiagnosticSchema } from '../src/ai-generation-runtime-diagnostic.js';

const runtime = () => ({
  version: 'ai-runtime-diagnostic-v1',
  packages: {
    ai: '7.0.107',
    providerPackage: '@ai-sdk/openai-compatible',
    providerVersion: '3.0.53',
    zod: '4.4.3',
  },
  stream: null,
});
const response = () => ({
  version: 'ai-http-response-diagnostic-v1',
  boundary: 'fetch_response',
  responses: 1,
  omittedResponses: 0,
  status: 200,
  contentType: 'sse',
  bodyBytes: 123,
  bodyComplete: true,
  bodyTruncated: false,
  bodyJson: null,
  sse: { events: 1, invalidJsonEvents: 0, oversizeEvents: 0, done: false, incompleteEvent: false },
  error: null,
});

describe('HTTP 响应诊断的可选安全合同', () => {
  it('旧记录无需响应字段，新记录可通过 JSON 往返', () => {
    expect(aiGenerationRuntimeDiagnosticSchema.parse(runtime())).toEqual(runtime());
    const value = { ...runtime(), httpResponse: response() };
    expect(aiGenerationRuntimeDiagnosticSchema.parse(JSON.parse(JSON.stringify(value)))).toEqual(
      value,
    );
  });

  it.each([
    { headers: { authorization: 'PRIVATE' } },
    { body: 'PRIVATE' },
    { status: 0 },
    { omittedResponses: 1 },
  ])('拒绝未授权自由文本及不一致事实：%j', (extra) => {
    expect(
      aiGenerationRuntimeDiagnosticSchema.safeParse({
        ...runtime(),
        httpResponse: { ...response(), ...extra },
      }).success,
    ).toBe(false);
  });
});
