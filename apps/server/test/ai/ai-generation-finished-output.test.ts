import { randomUUID, createHash } from 'node:crypto';
import { aiGenerationContracts, aiGenerationErrorSchema } from '@thesis-ledger/schemas';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  AiSdkGenerationAdapter,
  type AiSdkGenerationRequest,
} from '../../src/ai/ai-sdk-generation.adapter.js';
import { reasoningOutputDiagnostic } from '../../src/ai/ai-generation-finished-output.js';
import { buildGenerationSchemaPrompt } from '../../src/ai/ai-generation-schema-prompt.js';

const schema = z.object({ answer: z.string() }).strict();
const draft =
  'PRIVATE_REASONING Bearer private-token sk-private-token\n' +
  '{"action":"tools","requests":[{"name":"quote","symbol":"588000.SH"}]}';

async function generateFixture(options: {
  content: string;
  reasoning?: string;
  finish?: string;
  reasoningTokens?: number;
  mode?: AiSdkGenerationRequest<unknown>['mode'];
}) {
  let calls = 0;
  let body: Record<string, unknown> = {};
  const input: AiSdkGenerationRequest<{ answer: string }> = {
    requestId: randomUUID(),
    adapter: 'openai-compatible-chat',
    providerId: 'offline-fixture',
    baseURL: 'https://unused.invalid/v1',
    apiKey: 'fixture-key',
    model: 'fixture-model',
    contract: aiGenerationContracts.arenaLiveResearch.ref,
    schema,
    messages: [
      { role: 'system', content: buildGenerationSchemaPrompt(schema) },
      { role: 'user', content: 'Return JSON.' },
    ],
    mode: options.mode ?? 'native_schema',
    transport: 'single',
    timeout: { totalMs: 5000 },
    signal: new AbortController().signal,
    httpClient: async (_url, init) => {
      calls++;
      body = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          id: 'offline-response',
          object: 'chat.completion',
          created: 1,
          model: 'fixture-model',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: options.content,
                ...(options.reasoning === undefined
                  ? {}
                  : { reasoning_content: options.reasoning }),
              },
              finish_reason: options.finish ?? 'length',
            },
          ],
          usage: {
            prompt_tokens: 2859,
            completion_tokens: 99541,
            total_tokens: 102400,
            ...(options.reasoningTokens === undefined
              ? {}
              : {
                  completion_tokens_details: { reasoning_tokens: options.reasoningTokens },
                }),
          },
        }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    },
  };
  try {
    return {
      result: await new AiSdkGenerationAdapter().generate(input),
      error: undefined,
      calls,
      body,
    };
  } catch (error) {
    return { result: undefined, error, calls, body };
  }
}

describe('完成响应的安全拒绝诊断（仅注入 HTTP，无模型网络）', () => {
  it('思考循环与空正文仍以长度失败，保留来源用量与有界重复统计，绝不执行草稿', async () => {
    const reasoning = Array(1207).fill(draft).join('\n\n');
    const { error, calls, body } = await generateFixture({
      content: '',
      reasoning,
      reasoningTokens: 86046,
    });
    expect(calls).toBe(1);
    expect(body).not.toHaveProperty('max_tokens');
    expect(body).not.toHaveProperty('reasoning_effort');
    expect(error).toMatchObject({
      fact: {
        code: 'output_truncated',
        externalResult: 'complete',
        diagnostic: {
          jsonStatus: 'empty',
          outputCharacters: 0,
          outputSha256: createHash('sha256').update('').digest('hex'),
          outputTokenDetails: { textTokens: null, reasoningTokens: 86046 },
          reasoningOutput: {
            characters: reasoning.length,
            sha256: createHash('sha256').update(reasoning).digest('hex'),
            repetition: { sampledCharacters: 65536, truncated: true },
          },
        },
      },
      usage: { status: 'reported', inputTokens: 2859, outputTokens: 99541 },
    });
    const fact = aiGenerationErrorSchema.parse((error as { fact: unknown }).fact);
    const repetition = fact.diagnostic!.reasoningOutput!.repetition!;
    expect(repetition.maxParagraphOccurrences).toBeGreaterThan(100);
    expect(repetition.maxParagraphOccurrences).toBeLessThan(1207);
    expect(JSON.stringify(fact)).not.toMatch(
      /PRIVATE_REASONING|private-token|588000|action|requests/u,
    );
  });

  it.each(['native_schema', 'json_validated', 'json_mode'] as const)(
    '%s 正文为有效 JSON 时仍拒绝 length，保留脱敏形状而非丢失或接受结果',
    async (mode) => {
      const content = '{"answer":"PRIVATE_OUTPUT sk-private-token"}';
      const { error, result, calls } = await generateFixture({ content, mode });
      expect(result).toBeUndefined();
      expect(calls).toBe(1);
      expect(error).toMatchObject({
        fact: {
          code: 'output_truncated',
          diagnostic: {
            jsonStatus: 'valid',
            jsonRootType: 'object',
            outputCharacters: content.length,
            outputSha256: createHash('sha256').update(content).digest('hex'),
            structuralPreview: '{"[text]":"[text]"}',
            outputTokenDetails: { textTokens: null, reasoningTokens: null },
            reasoningOutput: { characters: null, sha256: null, repetition: null },
          },
        },
      });
      expect(JSON.stringify((error as { fact: unknown }).fact)).not.toContain('PRIVATE_OUTPUT');
    },
  );

  it('正常结束保持原成功契约，不附加失败诊断', async () => {
    const { error, result, calls } = await generateFixture({
      content: '{"answer":"ok"}',
      finish: 'stop',
    });
    expect(error).toBeUndefined();
    expect(calls).toBe(1);
    expect(result?.output).toEqual({ answer: 'ok' });
    expect(result).not.toHaveProperty('diagnostic');
  });

  it('上游明确报告零推理用量时保留零，不改写为未知', async () => {
    const { error, calls } = await generateFixture({ content: '', reasoningTokens: 0 });
    expect(calls).toBe(1);
    expect(error).toMatchObject({
      fact: {
        code: 'output_truncated',
        diagnostic: {
          outputTokenDetails: { textTokens: null, reasoningTokens: 0 },
        },
      },
    });
  });

  it('内容过滤仍沿用拒绝错误码及已知用量，不因诊断改变失败类别', async () => {
    const { error, calls } = await generateFixture({ content: '', finish: 'content_filter' });
    expect(calls).toBe(1);
    expect(error).toMatchObject({
      fact: {
        code: 'refused',
        externalResult: 'complete',
        diagnostic: { finishReason: 'content-filter', jsonStatus: 'empty' },
      },
      usage: { inputTokens: 2859, outputTokens: 99541 },
    });
  });

  it('统计窗口明确，空思考与没有取得思考区分，不保存原始段落', () => {
    expect(reasoningOutputDiagnostic(undefined)).toEqual({
      characters: null,
      sha256: null,
      repetition: null,
    });
    expect(reasoningOutputDiagnostic('')).toMatchObject({
      characters: 0,
      repetition: {
        sampledCharacters: 0,
        truncated: false,
        maxLineOccurrences: 0,
        maxParagraphOccurrences: 0,
      },
    });
    const sample = reasoningOutputDiagnostic(Array(3).fill(draft).join('\n\n'));
    expect(sample.repetition).toMatchObject({
      maxLineOccurrences: 3,
      maxParagraphOccurrences: 3,
      truncated: false,
    });
    expect(JSON.stringify(sample)).not.toContain('PRIVATE_REASONING');
  });

  it('模型文本中的对象原型属性名也按普通文本计数', () => {
    const diagnostic = reasoningOutputDiagnostic('__proto__\nconstructor\n__proto__\nconstructor');
    expect(diagnostic.repetition?.maxLineOccurrences).toBe(2);
  });
});
