import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { aiGenerationContracts } from '@thesis-ledger/schemas';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  AiSdkGenerationAdapter,
  AiSdkGenerationError,
  type AiSdkGenerationRequest,
} from '../../src/ai/ai-sdk-generation.adapter.js';

type Handler = (request: IncomingMessage, response: ServerResponse, body: unknown) => void;

const outputSchema = z.object({ answer: z.string().min(1) }).strict();
const completion = (content: string, finishReason = 'stop', usage: unknown = undefined) => ({
  id: 'completion-fixture',
  object: 'chat.completion',
  created: 1,
  model: 'fixture-model',
  choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: finishReason }],
  ...(usage === undefined ? {} : { usage }),
});

const writeJson = (response: ServerResponse, status: number, value: unknown) => {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(value));
};

const writeSse = (response: ServerResponse, frames: unknown[], finish = true) => {
  response.writeHead(200, { 'content-type': 'text/event-stream' });
  response.write(': OPENROUTER PROCESSING\n\n');
  for (const frame of frames) response.write(`data: ${JSON.stringify(frame)}\n\n`);
  if (finish) response.write('data: [DONE]\n\n');
  response.end();
};

describe('AI SDK generation adapter local HTTP/SSE', () => {
  const adapter = new AiSdkGenerationAdapter();
  let handler: Handler = (_request, response) => writeJson(response, 500, {});
  let requestCount = 0;
  let lastBody: unknown;
  let lastUrl: string | undefined;
  let lastHeaders: IncomingMessage['headers'];
  const server = createServer(async (request, response) => {
    requestCount += 1;
    lastUrl = request.url;
    lastHeaders = request.headers;
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const text = Buffer.concat(chunks).toString('utf8');
    lastBody = text ? (JSON.parse(text) as unknown) : null;
    handler(request, response, lastBody);
  });
  let baseURL = '';

  const request = (
    overrides: Partial<AiSdkGenerationRequest<{ answer: string }>> = {},
  ): AiSdkGenerationRequest<{ answer: string }> => ({
    requestId: randomUUID(),
    adapter: 'openai-compatible',
    providerId: 'local-fixture',
    baseURL: `${baseURL}/v1`,
    apiKey: 'local-secret',
    model: 'fixture-model',
    messages: [
      { role: 'system', content: 'Return only the requested JSON.' },
      { role: 'user', content: 'Return JSON.' },
    ],
    contract: aiGenerationContracts.research.ref,
    schema: outputSchema,
    mode: 'native_schema',
    transport: 'single',
    timeout: { totalMs: 1_000, firstChunkMs: 500, chunkMs: 500 },
    signal: new AbortController().signal,
    ...overrides,
  });

  beforeAll(async () => {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('本地 HTTP fixture 启动失败');
    baseURL = `http://127.0.0.1:${address.port}`;
  });

  beforeEach(() => {
    requestCount = 0;
    lastBody = null;
    lastUrl = undefined;
    lastHeaders = {};
  });

  afterAll(async () => {
    server.close();
    await once(server, 'close');
  });

  it('uses native schema mode with one non-streaming request and no implicit retry', async () => {
    handler = (_request, response) =>
      writeJson(
        response,
        200,
        completion('{"answer":"native"}', 'stop', {
          prompt_tokens: 7,
          completion_tokens: 3,
          total_tokens: 10,
        }),
      );
    const result = await adapter.generate(request());
    expect(result).toMatchObject({
      output: { answer: 'native' },
      finishReason: 'stop',
      usage: { status: 'reported', inputTokens: 7, outputTokens: 3 },
    });
    expect(requestCount).toBe(1);
    expect(lastBody).toMatchObject({ model: 'fixture-model' });
    expect(lastBody).toMatchObject({
      messages: [
        { role: 'system', content: 'Return only the requested JSON.' },
        { role: 'user', content: 'Return JSON.' },
      ],
    });
    expect(lastBody).not.toHaveProperty('stream');
    expect(JSON.stringify(lastBody)).toContain('json_schema');
  });

  it('uses the official OpenAI Chat provider and Chat Completions endpoint', async () => {
    handler = (_request, response) =>
      writeJson(
        response,
        200,
        completion('{"answer":"openai-chat"}', 'stop', {
          prompt_tokens: 5,
          completion_tokens: 2,
          total_tokens: 7,
        }),
      );
    const result = await adapter.generate(request({ adapter: 'openai-chat' }));
    expect(result).toMatchObject({
      output: { answer: 'openai-chat' },
      usage: { status: 'reported', inputTokens: 5, outputTokens: 2 },
    });
    expect(lastUrl).toBe('/v1/chat/completions');
    expect(lastHeaders.authorization).toBe('Bearer local-secret');
    expect(lastBody).toMatchObject({ model: 'fixture-model' });
    expect(JSON.stringify(lastBody)).toContain('json_schema');
    expect(requestCount).toBe(1);
  });

  it('explicit none mode strips OpenAI authorization and ignores environment fallback', async () => {
    handler = (_request, response) =>
      writeJson(
        response,
        200,
        completion('{"answer":"no-auth"}', 'stop', {
          prompt_tokens: 5,
          completion_tokens: 2,
          total_tokens: 7,
        }),
      );
    const previous = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'environment-secret-must-not-be-sent';
    try {
      await expect(
        adapter.generate(
          request({ adapter: 'openai-chat', authMode: 'none', apiKey: 'stale-secret' }),
        ),
      ).resolves.toMatchObject({ output: { answer: 'no-auth' } });
      expect(lastHeaders.authorization).toBeUndefined();
      expect(lastHeaders['x-api-key']).toBeUndefined();
      expect(requestCount).toBe(1);
    } finally {
      if (previous === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previous;
    }
  });

  it('uses the official OpenAI Responses provider and Responses endpoint', async () => {
    handler = (_request, response) =>
      writeJson(response, 200, {
        id: 'response-fixture',
        created_at: 1,
        model: 'fixture-model',
        output: [
          {
            type: 'message',
            role: 'assistant',
            id: 'message-fixture',
            content: [
              {
                type: 'output_text',
                text: '{"answer":"responses"}',
                annotations: [],
              },
            ],
          },
        ],
        incomplete_details: null,
        usage: {
          input_tokens: 8,
          output_tokens: 3,
          total_tokens: 11,
          input_tokens_details: { cached_tokens: 0 },
          output_tokens_details: { reasoning_tokens: 0 },
        },
      });
    const result = await adapter.generate(request({ adapter: 'openai-responses' }));
    expect(result).toMatchObject({
      output: { answer: 'responses' },
      usage: { status: 'reported', inputTokens: 8, outputTokens: 3 },
    });
    expect(lastUrl).toBe('/v1/responses');
    expect(lastHeaders.authorization).toBe('Bearer local-secret');
    expect(lastBody).toMatchObject({ model: 'fixture-model' });
    expect(JSON.stringify(lastBody)).toContain('json_schema');
    expect(requestCount).toBe(1);
  });

  it('uses the official Anthropic Messages provider and API-key headers', async () => {
    handler = (_request, response) =>
      writeJson(response, 200, {
        type: 'message',
        id: 'message-fixture',
        model: 'fixture-model',
        content: [
          {
            type: 'tool_use',
            id: 'tool-fixture',
            name: 'json',
            input: { answer: 'anthropic' },
          },
        ],
        stop_reason: 'tool_use',
        stop_sequence: null,
        usage: { input_tokens: 6, output_tokens: 2 },
      });
    const result = await adapter.generate(request({ adapter: 'anthropic-messages' }));
    expect(result).toMatchObject({
      output: { answer: 'anthropic' },
      usage: { status: 'reported', inputTokens: 6, outputTokens: 2 },
    });
    expect(lastUrl).toBe('/v1/messages');
    expect(lastHeaders['x-api-key']).toBe('local-secret');
    expect(lastHeaders['anthropic-version']).toBeTruthy();
    expect(lastBody).toMatchObject({ model: 'fixture-model' });
    expect(lastBody).toMatchObject({
      tools: [expect.objectContaining({ name: 'json' })],
    });
    expect(requestCount).toBe(1);
  });

  it('explicit none mode strips Anthropic API-key headers', async () => {
    handler = (_request, response) =>
      writeJson(response, 200, {
        type: 'message',
        id: 'message-fixture',
        model: 'fixture-model',
        content: [
          {
            type: 'tool_use',
            id: 'tool-fixture',
            name: 'json',
            input: { answer: 'anthropic-no-auth' },
          },
        ],
        stop_reason: 'tool_use',
        stop_sequence: null,
        usage: { input_tokens: 6, output_tokens: 2 },
      });
    const previous = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'environment-secret-must-not-be-sent';
    try {
      await expect(
        adapter.generate(
          request({ adapter: 'anthropic-messages', authMode: 'none', apiKey: 'stale-secret' }),
        ),
      ).resolves.toMatchObject({ output: { answer: 'anthropic-no-auth' } });
      expect(lastHeaders['x-api-key']).toBeUndefined();
      expect(lastHeaders.authorization).toBeUndefined();
      expect(lastHeaders['anthropic-version']).toBeTruthy();
      expect(requestCount).toBe(1);
    } finally {
      if (previous === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = previous;
    }
  });

  it('supports explicit json_validated mode without accepting invalid domain output', async () => {
    handler = (_request, response) =>
      writeJson(
        response,
        200,
        completion('```json\n{"answer":"validated"}\n```', 'stop', {
          prompt_tokens: 4,
          completion_tokens: 2,
          total_tokens: 6,
        }),
      );
    await expect(adapter.generate(request({ mode: 'json_validated' }))).resolves.toMatchObject({
      output: { answer: 'validated' },
    });
    expect(JSON.stringify(lastBody)).not.toContain('json_schema');

    handler = (_request, response) =>
      writeJson(
        response,
        200,
        completion('{"answer":""}', 'stop', {
          prompt_tokens: 4,
          completion_tokens: 2,
          total_tokens: 6,
        }),
      );
    const rejected = await adapter
      .generate(request({ mode: 'json_validated' }))
      .catch((error: unknown) => error);
    expect(rejected).toBeInstanceOf(AiSdkGenerationError);
    expect(rejected).toMatchObject({
      fact: { code: 'schema_invalid', phase: 'validation', externalResult: 'complete' },
      usage: { status: 'reported', inputTokens: 4, outputTokens: 2 },
    });
  });

  it('migrates approved OpenRouter extensions through the compatible provider', async () => {
    handler = (_request, response) =>
      writeJson(
        response,
        200,
        completion('{"answer":"openrouter"}', 'stop', {
          prompt_tokens: 6,
          completion_tokens: 4,
          total_tokens: 10,
          cost: 0.004,
        }),
      );
    const result = await adapter.generate(
      request({
        adapter: 'openai-compatible-chat',
        compatibilityExtensionProfile: 'openrouter-v1',
        baseURL: `${baseURL}/v1`,
        reasoningEffort: 'high',
      }),
    );
    expect(result).toMatchObject({
      output: { answer: 'openrouter' },
      providerCost: '0.004',
      providerCostCurrency: 'USD',
    });
    expect(lastBody).toMatchObject({
      model: 'fixture-model',
      reasoning_effort: 'high',
      provider: { require_parameters: true },
    });
    expect(lastBody).not.toHaveProperty('provider.only');
    expect(requestCount).toBe(1);
  });

  it('does not grant OpenRouter extensions to a new compatible connection', async () => {
    handler = (_request, response) =>
      writeJson(response, 200, completion('{"answer":"plain-compatible"}'));
    await adapter.generate(
      request({
        adapter: 'openai-compatible-chat',
        providerId: 'openrouter-looking-name',
        baseURL: `${baseURL}/v1`,
        mode: 'json_validated',
      }),
    );
    expect(lastBody).not.toHaveProperty('provider');
    expect(requestCount).toBe(1);
  });

  it('blocks an unmapped legacy OpenRouter reasoning effort before sending', async () => {
    const error = await adapter
      .generate(
        request({
          adapter: 'openai-compatible-chat',
          compatibilityExtensionProfile: 'openrouter-v1',
          reasoningEffort: 'max',
        }),
      )
      .catch((reason: unknown) => reason);
    expect(error).toMatchObject({
      fact: {
        code: 'capability_unsupported',
        phase: 'preflight',
        externalResult: 'not_sent',
      },
    });
    expect(requestCount).toBe(0);
  });

  it('consumes the complete SSE stream including a usage-only tail frame', async () => {
    const progress: string[] = [];
    handler = (_request, response) =>
      writeSse(response, [
        {
          id: 'stream-fixture',
          object: 'chat.completion.chunk',
          created: 1,
          model: 'fixture-model',
          choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }],
        },
        {
          id: 'stream-fixture',
          object: 'chat.completion.chunk',
          created: 1,
          model: 'fixture-model',
          choices: [{ index: 0, delta: { reasoning: 'thinking' }, finish_reason: null }],
        },
        {
          id: 'stream-fixture',
          object: 'chat.completion.chunk',
          created: 1,
          model: 'fixture-model',
          choices: [{ index: 0, delta: { content: '{"answer":"stream"}' }, finish_reason: null }],
        },
        {
          id: 'stream-fixture',
          object: 'chat.completion.chunk',
          created: 1,
          model: 'fixture-model',
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        },
        {
          id: 'stream-fixture',
          object: 'chat.completion.chunk',
          created: 1,
          model: 'fixture-model',
          choices: [],
          usage: {
            prompt_tokens: 9,
            completion_tokens: 5,
            total_tokens: 14,
            cost: 0.006,
          },
        },
      ]);
    const result = await adapter.generate(
      request({
        adapter: 'openai-compatible-chat',
        compatibilityExtensionProfile: 'openrouter-v1',
        mode: 'json_validated',
        transport: 'stream',
        onProgress: (event) => progress.push(event.type),
      }),
    );
    expect(result).toMatchObject({
      output: { answer: 'stream' },
      usage: { status: 'reported', inputTokens: 9, outputTokens: 5 },
      providerCost: '0.006',
    });
    expect(result.timeToFirstEventMs).not.toBeNull();
    expect(result.timeToFirstTextMs).not.toBeNull();
    expect(progress).toContain('text');
    expect(progress).toContain('reasoning');
    expect(requestCount).toBe(1);
  });

  it('rejects length even when the partial JSON is valid', async () => {
    handler = (_request, response) =>
      writeJson(
        response,
        200,
        completion('{"answer":"looks-valid"}', 'length', {
          prompt_tokens: 2,
          completion_tokens: 8,
          total_tokens: 10,
        }),
      );
    const error = await adapter
      .generate(request({ mode: 'json_validated' }))
      .catch((reason: unknown) => reason);
    expect(error).toMatchObject({
      fact: { code: 'output_truncated', externalResult: 'complete' },
      usage: { status: 'reported', inputTokens: 2, outputTokens: 8 },
    });
  });

  it('keeps missing usage explicit instead of reporting zero', async () => {
    handler = (_request, response) =>
      writeJson(response, 200, completion('{"answer":"unknown-usage"}'));
    const result = await adapter.generate(request({ mode: 'json_validated' }));
    expect(result.usage).toEqual({ status: 'unknown', inputTokens: null, outputTokens: null });
  });

  it('preserves reported usage when native schema validation fails', async () => {
    handler = (_request, response) =>
      writeJson(
        response,
        200,
        completion('{"answer":""}', 'stop', {
          prompt_tokens: 5,
          completion_tokens: 1,
          total_tokens: 6,
        }),
      );
    const error = await adapter.generate(request()).catch((reason: unknown) => reason);
    expect(error).toMatchObject({
      fact: { code: 'schema_invalid', externalResult: 'complete' },
      usage: { status: 'reported', inputTokens: 5, outputTokens: 1 },
    });
  });

  it('keeps partial usage explicit', async () => {
    handler = (_request, response) =>
      writeJson(
        response,
        200,
        completion('{"answer":"partial"}', 'stop', {
          prompt_tokens: 5,
          total_tokens: 5,
        }),
      );
    const result = await adapter.generate(request({ mode: 'json_validated' }));
    expect(result.usage).toEqual({ status: 'partial', inputTokens: 5, outputTokens: null });
  });

  it('does not accept a refusal as a successful structured result', async () => {
    handler = (_request, response) =>
      writeJson(
        response,
        200,
        completion('{"answer":"filtered"}', 'content_filter', {
          prompt_tokens: 2,
          completion_tokens: 0,
          total_tokens: 2,
        }),
      );
    const error = await adapter
      .generate(request({ mode: 'json_validated' }))
      .catch((reason: unknown) => reason);
    expect(error).toMatchObject({ fact: { code: 'refused', externalResult: 'complete' } });
  });

  it('maps authentication rejection and sends only once', async () => {
    handler = (_request, response) =>
      writeJson(response, 401, { error: { message: 'bad key sk-secret-value' } });
    const error = await adapter.generate(request()).catch((reason: unknown) => reason);
    expect(error).toMatchObject({
      fact: {
        code: 'authentication_failed',
        externalResult: 'rejected_before_generation',
      },
    });
    expect((error as Error).message).not.toContain('sk-secret-value');
    expect(requestCount).toBe(1);
  });

  it('treats an incomplete SSE EOF and HTTP 200 error as failures without retry', async () => {
    handler = (_request, response) =>
      writeSse(
        response,
        [
          {
            id: 'stream-eof',
            object: 'chat.completion.chunk',
            created: 1,
            model: 'fixture-model',
            choices: [{ index: 0, delta: { content: '{"answer":' }, finish_reason: null }],
          },
        ],
        false,
      );
    const eof = await adapter
      .generate(request({ mode: 'json_validated', transport: 'stream' }))
      .catch((reason: unknown) => reason);
    expect(eof).toBeInstanceOf(AiSdkGenerationError);
    expect(requestCount).toBe(1);

    requestCount = 0;
    handler = (_request, response) =>
      writeJson(response, 200, { error: { message: 'provider stream failed' } });
    const embedded = await adapter.generate(request()).catch((reason: unknown) => reason);
    expect(embedded).toBeInstanceOf(AiSdkGenerationError);
    expect(requestCount).toBe(1);
  });

  it('combines caller cancellation with SDK timeouts and releases the request', async () => {
    handler = (_request, response) => {
      setTimeout(() => writeJson(response, 200, completion('{"answer":"late"}')), 200);
    };
    const timeout = await adapter
      .generate(request({ timeout: { totalMs: 20 } }))
      .catch((reason: unknown) => reason);
    expect(timeout).toBeInstanceOf(AiSdkGenerationError);
    expect(requestCount).toBe(1);

    const controller = new AbortController();
    const pending = adapter.generate(request({ signal: controller.signal }));
    controller.abort(new DOMException('user cancelled', 'AbortError'));
    const cancelled = await pending.catch((reason: unknown) => reason);
    expect(cancelled).toBeInstanceOf(AiSdkGenerationError);
    expect((cancelled as AiSdkGenerationError).fact.code).toBe('cancelled');
  });

  it('enforces first-output and inter-output timeouts for streams', async () => {
    handler = (_request, response) => {
      response.on('error', () => undefined);
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.flushHeaders();
      setTimeout(() => {
        response.write(
          `data: ${JSON.stringify({
            id: 'late-first',
            object: 'chat.completion.chunk',
            created: 1,
            model: 'fixture-model',
            choices: [{ index: 0, delta: { content: '{"answer":"late"}' }, finish_reason: 'stop' }],
          })}\n\n`,
        );
        response.end('data: [DONE]\n\n');
      }, 80);
    };
    const firstTimeout = await adapter
      .generate(
        request({
          mode: 'json_validated',
          transport: 'stream',
          timeout: { totalMs: 500, firstChunkMs: 20, chunkMs: 200 },
        }),
      )
      .catch((reason: unknown) => reason);
    expect(firstTimeout).toBeInstanceOf(AiSdkGenerationError);

    handler = (_request, response) => {
      response.on('error', () => undefined);
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.write(
        `data: ${JSON.stringify({
          id: 'idle-stream',
          object: 'chat.completion.chunk',
          created: 1,
          model: 'fixture-model',
          choices: [{ index: 0, delta: { content: '{"answer":' }, finish_reason: null }],
        })}\n\n`,
      );
      setTimeout(() => response.end('data: [DONE]\n\n'), 80);
    };
    const idleTimeout = await adapter
      .generate(
        request({
          mode: 'json_validated',
          transport: 'stream',
          timeout: { totalMs: 500, firstChunkMs: 200, chunkMs: 20 },
        }),
      )
      .catch((reason: unknown) => reason);
    expect(idleTimeout).toBeInstanceOf(AiSdkGenerationError);
  });
});
