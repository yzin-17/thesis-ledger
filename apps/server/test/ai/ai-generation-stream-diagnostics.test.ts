import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { AiGenerationStreamDiagnostics } from '../../src/ai/ai-generation-stream-diagnostics.js';

const require = createRequire(import.meta.url);
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

describe('G3 两层流诊断', () => {
  it('记录实际解析包版本，版本不来自声明或旧验证记录', () => {
    const diagnostic = new AiGenerationStreamDiagnostics('openai-compatible-chat', 'stream');
    expect(diagnostic.snapshot().packages).toEqual({
      ai: (require('ai/package.json') as { version: string }).version,
      providerPackage: '@ai-sdk/openai-compatible',
      providerVersion: (require('@ai-sdk/openai-compatible/package.json') as { version: string })
        .version,
      zod: (require('zod/package.json') as { version: string }).version,
    });
    expect(new AiGenerationStreamDiagnostics('openai-chat', 'single').snapshot()).toMatchObject({
      packages: { providerPackage: '@ai-sdk/openai' },
      stream: null,
    });
  });

  it('对比转换前后正文摘要，reasoning 独立统计，未知字段只计数', () => {
    const diagnostic = new AiGenerationStreamDiagnostics('openai-compatible-chat', 'stream');
    diagnostic.observeProviderChunk({
      choices: [{ delta: { content: '{', reasoning_content: 'PRIVATE_REASONING' } }],
    });
    diagnostic.observeProviderChunk({
      choices: [{ delta: { content: '"', PRIVATE_FIELD: 'Bearer secret' }, finish_reason: 'stop' }],
      usage: {
        prompt_tokens: 7,
        completion_tokens: 9,
        completion_tokens_details: { reasoning_tokens: 8 },
      },
    });
    diagnostic.observeSdkPart({ type: 'text-delta', text: '{"' });
    diagnostic.observeSdkPart({ type: 'reasoning-delta', text: 'PRIVATE_REASONING' });
    const { stream } = diagnostic.snapshot();
    expect(stream?.provider?.text).toEqual({ chunks: 2, characters: 2, sha256: digest('{"') });
    expect(stream?.sdk.text).toEqual({ chunks: 1, characters: 2, sha256: digest('{"') });
    expect(stream?.provider?.reasoning.sha256).toBe(stream?.sdk.reasoning.sha256);
    expect(stream?.provider?.unrecognizedDeltaFrames).toBe(1);
    expect(stream?.provider?.reportedUsage).toEqual({
      inputTokens: 7,
      outputTokens: 9,
      reasoningTokens: 8,
    });
    expect(JSON.stringify(stream)).not.toMatch(/PRIVATE|Bearer|secret/u);
  });

  it('长流只保留前后有限样本，完整摘要不受省略影响，快照不会消费哈希状态', () => {
    const diagnostic = new AiGenerationStreamDiagnostics('openai-compatible-chat', 'stream');
    const text = JSON.stringify({ privateField: 'PRIVATE_BODY sk-private-token' });
    for (let index = 0; index < 80; index += 1) {
      diagnostic.observeProviderChunk({
        choices: [{ delta: { content: text, reasoning: 'PRIVATE_REASONING' } }],
      });
      diagnostic.observeSdkPart({ type: 'text-delta', text });
    }
    diagnostic.observeProviderChunk({ choices: [{ delta: {}, finish_reason: 'stop' }] });
    const first = diagnostic.snapshot();
    expect(diagnostic.snapshot()).toEqual(first);
    const provider = first.stream?.provider;
    expect(provider?.frames).toBe(81);
    expect(provider?.text.sha256).toBe(digest(text.repeat(80)));
    expect(provider?.samples.length).toBeLessThanOrEqual(24);
    expect(provider?.samples[0]?.frame).toBe(1);
    expect(provider?.samples.at(-1)?.frame).toBe(81);
    expect(provider?.omittedFrames).toBe(81 - (provider?.samples.length ?? 0));
    expect(Buffer.byteLength(JSON.stringify(first))).toBeLessThanOrEqual(8192);
    expect(JSON.stringify(first)).not.toMatch(/PRIVATE|privateField|private-token/u);
  });

  it('UTF-16 代理对跨分片时，摘要仍等于拼接后正文的 UTF-8 摘要', () => {
    const diagnostic = new AiGenerationStreamDiagnostics('openai-compatible-chat', 'stream');
    for (const text of ['{"answer":"', '\ud83d', '\ude00', '"}']) {
      diagnostic.observeProviderChunk({ choices: [{ delta: { content: text } }] });
      diagnostic.observeSdkPart({ type: 'text-delta', text });
      diagnostic.snapshot();
    }
    const expected = digest('{"answer":"😀"}');
    expect(diagnostic.snapshot().stream?.provider?.text.sha256).toBe(expected);
    expect(diagnostic.snapshot().stream?.sdk.text.sha256).toBe(expected);
  });
});
