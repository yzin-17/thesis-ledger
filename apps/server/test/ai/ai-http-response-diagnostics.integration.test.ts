import { once } from 'node:events';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { aiGenerationErrorSchema, researchGenerationV2Contract } from '@thesis-ledger/schemas';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  AiSdkGenerationAdapter,
  AiSdkGenerationError,
} from '../../src/ai/ai-sdk-generation.adapter.js';

const providerError = JSON.stringify({
  error: {
    code: 502,
    message: 'Provider returned error',
    metadata: { raw: '{"error":{"message":"Overloaded PRIVATE_UPSTREAM"}}' },
  },
});
const scenarios = [
  {
    name: 'A HTTP502 JSON Provider 错误',
    status: 502,
    mime: 'application/json',
    wire: providerError,
    frames: 0,
    code: 'provider_stream_error',
    summary: /^Provider returned error$/u,
    layer: { name: 'AI_APICallError', statusCode: 502, code: null },
    expected: {
      status: 502,
      contentType: 'json',
      error: { origin: 'http_body', code: 502, category: 'provider_error' },
    },
  },
  {
    name: 'HTTP 拒绝',
    status: 401,
    mime: 'application/json',
    wire: '{"error":{"code":401,"message":"Invalid API key sk-response-secret"}}',
    frames: 0,
    code: 'authentication_failed',
    summary: /^Invalid API key \[REDACTED\]$/u,
    layer: { name: 'AI_APICallError', statusCode: 401, code: null },
    expected: { status: 401, error: { origin: 'http_body', category: 'authentication' } },
  },
  {
    name: 'B HTTP200 标准 SSE error 和 DONE',
    status: 200,
    mime: 'text/event-stream',
    wire: `data: ${providerError}\n\ndata: [DONE]\n\n`,
    frames: 1,
    code: 'provider_stream_error',
    summary: /^Provider returned error$/u,
    layer: { name: 'AI_StreamProviderError', statusCode: 502, code: 502 },
    expected: {
      status: 200,
      sse: { events: 2, invalidJsonEvents: 0, done: true, incompleteEvent: false },
      error: { origin: 'sse_error', code: 502, upstream: { category: 'overloaded' } },
    },
  },
  {
    name: 'C HTTP200 SSE JSON 语法无效',
    status: 200,
    mime: 'text/event-stream',
    wire: 'data: {\n\ndata: [DONE]\n\n',
    frames: 0,
    code: 'transport_unknown',
    summary: /^JSON parsing failed:/u,
    layer: { name: 'AI_JSONParseError', statusCode: null, code: null },
    expected: {
      status: 200,
      sse: { events: 2, invalidJsonEvents: 1, done: true, incompleteEvent: false },
      error: null,
    },
  },
  {
    name: 'D HTTP200 SSE JSON 有效但事件合同无效',
    status: 200,
    mime: 'text/event-stream',
    wire: 'data: {"choices":"invalid-shape"}\n\ndata: [DONE]\n\n',
    frames: 0,
    code: 'transport_unknown',
    summary: /^Type validation failed:/u,
    layer: { name: 'AI_TypeValidationError', statusCode: null, code: null },
    expected: {
      status: 200,
      sse: { events: 2, invalidJsonEvents: 0, done: true, incompleteEvent: false },
      error: null,
    },
  },
  {
    name: 'F2 HTTP200 在 SSE 事件中途正常 EOF',
    status: 200,
    mime: 'text/event-stream',
    wire: 'data: {"choices":',
    frames: 0,
    code: 'transport_unknown',
    summary: /^Response stream ended without a finish reason\.$/u,
    layer: { name: 'AI_InvalidResponseDataError', statusCode: null, code: null },
    expected: {
      status: 200,
      bodyComplete: true,
      sse: { events: 0, done: false, incompleteEvent: true },
    },
  },
];

const generate = (origin: string, version: 'research-generation-v1' | 'research-generation-v2') =>
  new AiSdkGenerationAdapter().generate({
    requestId: randomUUID(),
    adapter: 'openai-compatible-chat',
    compatibilityExtensionProfile: 'openrouter-v1',
    providerId: 'local-fixture',
    apiKey: 'sk-request-secret',
    baseURL: `${origin}/v1`,
    model: 'openrouter/free',
    messages: [{ role: 'user', content: 'PRIVATE_PROMPT' }],
    contract: { id: 'research', version },
    schema: z.strictObject({ answer: z.string() }),
    mode: 'native_schema',
    transport: 'stream',
    maxOutputTokens: 20000,
    timeout: { totalMs: 3000, firstChunkMs: 2000, chunkMs: 2000 },
    signal: new AbortController().signal,
  });

const failureOf = async (origin: string, version: Parameters<typeof generate>[1]) => {
  try {
    await generate(origin, version);
  } catch (error) {
    if (!(error instanceof AiSdkGenerationError)) throw error;
    return error;
  }
  throw new Error('本地错误样本不应生成报告');
};

const errorLayers = (error: unknown) => {
  const layers = [];
  let current = error;
  const numeric = (value: unknown) => (typeof value === 'number' ? value : null);
  for (let depth = 0; depth < 5 && current && typeof current === 'object'; depth += 1) {
    const layer = current as Record<string, unknown>;
    layers.push({
      name: typeof layer.name === 'string' ? layer.name : null,
      status: numeric(layer.status),
      statusCode: numeric(layer.statusCode),
      code: numeric(layer.code),
    });
    current = layer.cause;
  }
  return layers;
};

const observe = (name: string, failure: AiSdkGenerationError, fetches: number) => {
  const diagnostic = failure.fact.diagnostic;
  const runtime = diagnostic?.runtime;
  if (!runtime?.stream?.provider) throw new Error('研究 V2 应包含兼容层运行诊断');
  const provider = runtime.stream.provider;
  const sdk = runtime.stream.sdk;
  const metric = (value: { chunks: number; characters: number }) => ({
    chunks: value.chunks,
    characters: value.characters,
  });
  const observation = {
    name,
    error: {
      code: failure.fact.code,
      phase: failure.fact.phase,
      summary: failure.fact.summary,
      externalResult: failure.fact.externalResult,
    },
    provider: {
      frames: provider.frames,
      text: metric(provider.text),
      reasoning: metric(provider.reasoning),
    },
    sdk: {
      text: metric(sdk.text),
      reasoning: metric(sdk.reasoning),
    },
    httpResponse: runtime.httpResponse ?? null,
    errorLayers: errorLayers(failure),
    usage: failure.usage,
    fetches,
    attempts: diagnostic?.httpRequest?.attempts,
    packages: runtime.packages,
  };
  if (process.env.G3_FAULT_MATRIX === '1') console.info('G3_MATRIX', JSON.stringify(observation));
  expect(fetches).toBe(1);
  expect(observation.attempts).toBe(1);
  expect(observation.provider.text).toEqual({ chunks: 0, characters: 0 });
  expect(observation.provider.reasoning).toEqual({ chunks: 0, characters: 0 });
  expect(observation.sdk).toEqual({
    text: { chunks: 0, characters: 0 },
    reasoning: { chunks: 0, characters: 0 },
  });
  expect(observation.usage).toEqual({ status: 'unknown', inputTokens: null, outputTokens: null });
  expect(aiGenerationErrorSchema.parse(JSON.parse(JSON.stringify(failure.fact)))).toEqual(
    failure.fact,
  );
  expect(JSON.stringify(failure.fact.diagnostic)).not.toMatch(
    /PRIVATE|sk-request-secret|sk-response-secret/u,
  );
  expect(Buffer.byteLength(JSON.stringify(failure.fact.diagnostic))).toBeLessThanOrEqual(12288);
  expect(Buffer.byteLength(JSON.stringify(runtime))).toBeLessThanOrEqual(8192);
  if (runtime.httpResponse)
    expect(Buffer.byteLength(JSON.stringify(runtime.httpResponse))).toBeLessThanOrEqual(2048);
  return observation;
};

const compareEnrichment = (baseline: AiSdkGenerationError, observed: AiSdkGenerationError) => {
  expect(baseline.fact.diagnostic).toBeUndefined();
  expect(observed.fact.code).toBe(baseline.fact.code);
  expect(observed.fact.phase).toBe(baseline.fact.phase);
  expect(observed.fact.summary).toBe(baseline.fact.summary);
  expect(observed.fact.externalResult).toBe(baseline.fact.externalResult);
  expect(observed.usage).toEqual(baseline.usage);
};

describe('原始响应进入当前真实 SDK 的本地对照', () => {
  it.each(scenarios)('$name：区分传输事实且保持错误、请求和零重试', async (scenario) => {
    let calls = 0;
    const bodies: string[] = [];
    const server = createServer(async (request, response) => {
      calls += 1;
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      bodies.push(Buffer.concat(chunks).toString('utf8'));
      response.writeHead(scenario.status, { 'content-type': scenario.mime });
      response.end(scenario.wire);
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('本地响应 fixture 未启动');
    const origin = `http://127.0.0.1:${address.port}`;
    const actualFetch = globalThis.fetch;
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = input instanceof Request ? input.url : input;
      if (new URL(url).href !== `${origin}/v1/chat/completions`)
        throw new Error('禁止本地验证访问未匹配地址');
      return actualFetch(input, init);
    });
    try {
      const failures: AiSdkGenerationError[] = [];
      const fetchCounts: number[] = [];
      for (const version of [
        'research-generation-v1',
        researchGenerationV2Contract.ref.version,
      ] as const) {
        const before = spy.mock.calls.length;
        failures.push(await failureOf(origin, version));
        fetchCounts.push(spy.mock.calls.length - before);
      }
      expect(fetchCounts).toEqual([1, 1]);
      expect(calls).toBe(2);
      expect(spy).toHaveBeenCalledTimes(2);
      expect(bodies[1]).toBe(bodies[0]);
      const [baseline, observed] = failures;
      if (!baseline || !observed) throw new Error('应取得两次本地对照结果');
      compareEnrichment(baseline, observed);
      expect(observed.fact.diagnostic?.runtime?.httpResponse).toMatchObject(scenario.expected);
      expect(observed.fact.diagnostic?.httpRequest).toMatchObject({
        attempts: 1,
        model: 'openrouter/free',
      });
      const observation = observe(scenario.name, observed, fetchCounts[1] ?? 0);
      expect(observation.error).toMatchObject({
        code: scenario.code,
        phase: 'stream',
        summary: scenario.summary,
        externalResult:
          scenario.code === 'authentication_failed' ? 'rejected_before_generation' : 'unknown',
      });
      expect(observation.provider.frames).toBe(scenario.frames);
      expect(observation.errorLayers).toEqual(
        expect.arrayContaining([expect.objectContaining(scenario.layer)]),
      );
      expect(observation.httpResponse).toMatchObject({
        bodyBytes: Buffer.byteLength(scenario.wire),
        bodyComplete: true,
        bodyTruncated: false,
      });
    } finally {
      spy.mockRestore();
      server.close();
      server.closeAllConnections();
      await once(server, 'close');
    }
  });

  it.each(['E fetch 拒绝', 'E2 同文案 fetch 拒绝', 'F1 响应体读取失败'])(
    '%s：仅替换 HTTP 边界，未匹配请求立即失败',
    async (name) => {
      const origin = 'http://127.0.0.1:1';
      const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        const url = input instanceof Request ? input.url : input;
        if (new URL(url).href !== `${origin}/v1/chat/completions`)
          throw new Error('禁止本地验证访问未匹配地址');
        if (name === 'E fetch 拒绝') throw new TypeError('fetch failed');
        if (name === 'E2 同文案 fetch 拒绝')
          throw Object.assign(new Error('Provider returned error'), { code: 401 });
        let pulls = 0;
        const body = new ReadableStream<Uint8Array>({
          pull(controller) {
            if (pulls++ === 0) controller.enqueue(Buffer.from('data: {"choices":'));
            else controller.error(new Error('local body read failure'));
          },
        });
        return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
      });
      try {
        const baseline = await failureOf(origin, 'research-generation-v1');
        expect(spy).toHaveBeenCalledTimes(1);
        const failure = await failureOf(origin, researchGenerationV2Contract.ref.version);
        expect(spy).toHaveBeenCalledTimes(2);
        compareEnrichment(baseline, failure);
        const observation = observe(name, failure, spy.mock.calls.length - 1);
        expect(observation.provider.frames).toBe(0);
        if (name === 'F1 响应体读取失败') {
          expect(observation.error).toEqual({
            code: 'transport_unknown',
            phase: 'request',
            summary: 'Failed to process successful response',
            externalResult: 'unknown',
          });
          expect(observation.httpResponse).toMatchObject({
            status: 200,
            bodyBytes: 17,
            bodyComplete: false,
            bodyTruncated: false,
            sse: { events: 0, invalidJsonEvents: 0, done: false, incompleteEvent: true },
            error: null,
          });
        } else {
          expect(observation.error).toEqual({
            code: 'transport_unknown',
            phase: 'stream',
            summary: name === 'E fetch 拒绝' ? 'fetch failed' : 'Provider returned error',
            externalResult: 'unknown',
          });
          expect(observation.httpResponse).toBeNull();
        }
      } finally {
        spy.mockRestore();
      }
    },
  );
});
