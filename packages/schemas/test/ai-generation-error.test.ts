import { describe, expect, it } from 'vitest';
import {
  aiGenerationErrorSchema,
  aiGenerationFailureDiagnosticSchema,
} from '../src/ai-execution.js';

const diagnostic = {
  version: 'ai-failure-diagnostic-v1',
  errorClass: 'no_object',
  generationMode: 'native_schema',
  finishReason: 'stop',
  actualModel: 'fixture/model:free',
  outputCharacters: 10,
  outputSha256: 'a'.repeat(64),
  jsonStatus: 'invalid',
  jsonRootType: null,
  structuralPreview: '{"[text]":',
  truncated: false,
};
const legacy = {
  code: 'schema_invalid',
  phase: 'validation',
  summary: '旧记录',
  externalResult: 'complete',
};

describe('失败诊断共享契约', () => {
  it('兼容没有诊断字段的历史错误，保留可选诊断的 JSON 往返', () => {
    expect(aiGenerationErrorSchema.parse(legacy)).not.toHaveProperty('diagnostic');
    const parsed = aiGenerationErrorSchema.parse({ ...legacy, diagnostic });
    expect(aiGenerationErrorSchema.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
  });

  it('限制预览大小、模型标识与摘要格式，拒绝额外原文或请求字段', () => {
    expect(
      aiGenerationFailureDiagnosticSchema.safeParse({
        ...diagnostic,
        structuralPreview: 'x'.repeat(2048),
      }).success,
    ).toBe(true);
    for (const change of [
      { structuralPreview: 'x'.repeat(2049) },
      { actualModel: 'model\nprivate' },
      { outputSha256: 'private response' },
      { responseBody: 'private' },
      { headers: { authorization: 'private' } },
      { prompt: 'private' },
    ])
      expect(
        aiGenerationFailureDiagnosticSchema.safeParse({ ...diagnostic, ...change }).success,
      ).toBe(false);
  });
});
