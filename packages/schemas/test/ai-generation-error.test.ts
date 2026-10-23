import { describe, expect, it } from 'vitest';
import {
  aiGenerationErrorSchema,
  aiGenerationFailureDiagnosticSchema,
} from '../src/ai-execution.js';
import { aiGenerationRuntimeDiagnosticSchema } from '../src/ai-generation-runtime-diagnostic.js';

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

  it('运行版本与分片诊断可选且限长，拒绝任意原始帧与请求字段', () => {
    const metric = { chunks: 0, characters: 0, sha256: 'a'.repeat(64) };
    const sample = {
      frame: 1,
      contentCharacters: 2,
      contentSha256: 'b'.repeat(64),
      contentStructure: '{"[text]',
      reasoningCharacters: null,
      reasoningSha256: null,
      finishReason: null,
      usage: false,
    };
    const runtime = {
      version: 'ai-runtime-diagnostic-v1',
      packages: {
        ai: '7.0.107',
        providerPackage: '@ai-sdk/openai-compatible',
        providerVersion: '3.0.53',
        zod: null,
      },
      stream: {
        provider: {
          frames: 1,
          text: metric,
          reasoning: metric,
          nonTextContentFrames: 0,
          unrecognizedDeltaFrames: 0,
          finishReasons: [],
          reportedUsage: null,
          samples: [sample],
          omittedFrames: 0,
        },
        sdk: { text: metric, reasoning: metric },
      },
    };
    expect(aiGenerationFailureDiagnosticSchema.parse({ ...diagnostic, runtime }).runtime).toEqual(
      runtime,
    );
    expect(aiGenerationFailureDiagnosticSchema.parse(diagnostic)).not.toHaveProperty('runtime');
    for (const changed of [
      { ...runtime, rawFrames: [] },
      { ...runtime, packages: { ...runtime.packages, ai: 'private\nversion' } },
      {
        ...runtime,
        stream: {
          ...runtime.stream,
          provider: { ...runtime.stream.provider, samples: Array(25).fill(sample) },
        },
      },
      {
        ...runtime,
        stream: {
          ...runtime.stream,
          provider: {
            ...runtime.stream.provider,
            samples: [{ ...sample, contentStructure: 'x'.repeat(97) }],
          },
        },
      },
      {
        ...runtime,
        stream: {
          ...runtime.stream,
          provider: { ...runtime.stream.provider, headers: { authorization: 'private' } },
        },
      },
    ])
      expect(aiGenerationRuntimeDiagnosticSchema.safeParse(changed).success).toBe(false);
  });
});
