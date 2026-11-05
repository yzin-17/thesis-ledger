import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { aiGenerationHttpRequestDiagnosticSchema } from '@thesis-ledger/schemas';
import {
  AiGenerationHttpRequestDiagnostics,
  generationFetchOptions,
} from '../../src/ai/ai-generation-http-request-diagnostics.js';

const body = () => ({
  model: 'openrouter/free',
  stream: true,
  max_tokens: 20000,
  response_format: {
    type: 'json_schema',
    json_schema: {
      strict: true,
      schema: { type: 'object', description: 'PRIVATE_SCHEMA', properties: {} },
    },
  },
  provider: { require_parameters: true },
  messages: [{ role: 'user', content: 'PRIVATE_PROMPT' }],
  reasoning_effort: 'low',
  reasoning: { effort: 'low', enabled: true, exclude: false, max_tokens: 1000 },
  stream_options: { include_usage: true },
  tools: [{ description: 'PRIVATE_TOOL' }],
  api_key: 'sk-body-secret',
});

describe('HTTP 请求诊断白名单', () => {
  it('只记录实际序列化参数及摘要，不保留秘密、headers、URL 或原文', () => {
    const d = new AiGenerationHttpRequestDiagnostics();
    expect(d.snapshot()).toBeUndefined();
    const text = JSON.stringify(body());
    d.observe('https://user:private@example.test/api/v1/chat/completions?api_key=QUERY_SECRET', {
      method: 'POST',
      headers: { authorization: 'Bearer HEADER_SECRET' },
      body: text,
    });
    const result = d.snapshot();
    expect(result).toMatchObject({
      boundary: 'fetch_dispatch',
      attempts: 1,
      omittedRequests: 0,
      method: 'POST',
      endpoint: 'chat_completions',
      model: 'openrouter/free',
      stream: true,
      responseFormat: 'json_schema',
      schemaStrict: true,
      requireParameters: true,
      tokenLimits: { max_tokens: 20000 },
      reasoningEffort: 'low',
      reasoning: { effort: 'low', enabled: true, exclude: false, maxTokens: 1000 },
      includeUsage: true,
      toolCount: 1,
      bodyBytes: Buffer.byteLength(text),
      bodySha256: createHash('sha256').update(text).digest('hex'),
    });
    const saved = JSON.stringify(result);
    expect(saved).not.toMatch(
      /PRIVATE|SECRET|sk-body-secret|example\.test|user:private|authorization|messages|description/u,
    );
    expect(Buffer.byteLength(saved)).toBeLessThanOrEqual(1024);
    expect(aiGenerationHttpRequestDiagnosticSchema.parse(JSON.parse(saved))).toEqual(result);
    expect(
      aiGenerationHttpRequestDiagnosticSchema.safeParse({ ...result, headers: {} }).success,
    ).toBe(false);
  });

  it('保留首个请求，后续仅计数；未知和超大 body 不进入解析或原文预览', () => {
    const d = new AiGenerationHttpRequestDiagnostics();
    d.observe('https://example.test/responses', { method: 'POST', body: '{}' });
    d.observe('https://example.test/messages', { method: 'POST', body: 'PRIVATE' });
    expect(d.snapshot()).toMatchObject({
      attempts: 2,
      omittedRequests: 1,
      endpoint: 'responses',
      bodyStatus: 'json',
    });
    for (const [text, status] of [
      ['PRIVATE', 'non_json'],
      ['[]', 'non_object'],
      ['x'.repeat(262145), 'oversize'],
    ] as const) {
      const c = new AiGenerationHttpRequestDiagnostics();
      c.observe('https://example.test', { body: text });
      expect(c.snapshot()).toMatchObject({ bodyStatus: status });
      expect(JSON.stringify(c.snapshot())).not.toContain(text);
    }
    const unknown = new AiGenerationHttpRequestDiagnostics();
    unknown.observe('https://example.test', { body: new Uint8Array([1, 2]) });
    expect(unknown.snapshot()).toMatchObject({ bodyStatus: 'unavailable', bodyBytes: null });
  });

  it('未知枚举仅归一化为 other，不将对象或秘密转换成文本', () => {
    const d = new AiGenerationHttpRequestDiagnostics();
    d.observe('https://example.test/chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        ...body(),
        model: 'sk-private-token',
        response_format: { type: { private: 'PRIVATE_FORMAT' } },
        reasoning_effort: { private: 'PRIVATE_EFFORT' },
        reasoning: { effort: ['PRIVATE_REASONING'], enabled: true },
      }),
    });
    expect(d.snapshot()).toMatchObject({
      model: null,
      responseFormat: 'other',
      reasoningEffort: 'other',
      reasoning: { effort: 'other', enabled: true },
    });
    expect(JSON.stringify(d.snapshot())).not.toMatch(/PRIVATE|sk-private-token|\[object Object\]/u);
  });

  it('不修改 API Key 请求参数，保持既有无需认证规则和单次 fetch', async () => {
    const real = globalThis.fetch;
    const fetch = vi.fn(
      async (
        input: Parameters<typeof globalThis.fetch>[0],
        init?: Parameters<typeof globalThis.fetch>[1],
      ) => {
        void input;
        void init;
        return new Response('{}', { status: 200 });
      },
    );
    vi.stubGlobal('fetch', fetch);
    try {
      expect(generationFetchOptions('api_key')).toEqual({ fetch: expect.any(Function) });
      const d = new AiGenerationHttpRequestDiagnostics();
      const init = {
        method: 'POST',
        body: JSON.stringify(body()),
        headers: { authorization: 'Bearer secret', 'content-type': 'application/json' },
      };
      const authenticated = generationFetchOptions('api_key', d).fetch;
      if (!authenticated) throw new Error('应启用观察器');
      await authenticated('https://example.test/chat/completions', init);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch.mock.calls[0]?.[1]).toMatchObject(init);
      expect(init).not.toHaveProperty('dispatcher');
      const anonymous = generationFetchOptions('none', d).fetch;
      if (!anonymous) throw new Error('应保持无需认证入口');
      await anonymous('https://example.test/chat/completions', init);
      const sent = fetch.mock.calls[1]?.[1] as RequestInit;
      expect(new Headers(sent.headers).has('authorization')).toBe(false);
      expect(sent.body).toBe(init.body);
      expect(init.headers.authorization).toBe('Bearer secret');
      expect(d.snapshot()).toMatchObject({ attempts: 2, omittedRequests: 1 });
    } finally {
      vi.stubGlobal('fetch', real);
    }
  });
});
