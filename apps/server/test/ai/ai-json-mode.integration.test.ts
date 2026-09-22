import { createServer, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { aiGenerationContracts, type AiAdapter } from '@thesis-ledger/schemas';
import {
  AiSdkGenerationAdapter,
  type AiSdkGenerationRequest,
} from '../../src/ai/ai-sdk-generation.adapter.js';

const schema = z.object({ answer: z.string().min(1) }).strict();
const usage = { prompt_tokens: 9, completion_tokens: 5, total_tokens: 14 };
const modes = ['native_schema', 'json_mode', 'json_validated'] as const;
const completion = (text: string, finishReason = 'stop') => ({
  id: 'json-mode-fixture',
  object: 'chat.completion',
  created: 1,
  model: 'fixture-model',
  choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: finishReason }],
  usage,
});
const sendJson = (response: ServerResponse, value: unknown, status = 200) => {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(value));
};
const sendStream = (
  response: ServerResponse,
  fragments: string[],
  finishReason = 'stop',
  includeUsage = true,
) => {
  response.writeHead(200, { 'content-type': 'text/event-stream' });
  response.write(': heartbeat\n\n');
  const frame = (choices: unknown[], reportedUsage?: unknown) => {
    response.write(`data: ${JSON.stringify({
      id: 'json-mode-fixture', object: 'chat.completion.chunk', created: 1, model: 'fixture-model',
      choices, ...(reportedUsage ? { usage: reportedUsage } : {}),
    })}\n\n`);
  };
  for (const content of fragments)
    frame([{ index: 0, delta: { content }, finish_reason: null }]);
  frame([{ index: 0, delta: {}, finish_reason: finishReason }]);
  if (includeUsage) frame([], usage);
  response.end('data: [DONE]\n\n');
};

describe('explicit API JSON mode and complete-stream validation', () => {
  const adapter = new AiSdkGenerationAdapter();
  let handler = (response: ServerResponse) => sendJson(response, {}, 500);
  let lastBody: unknown;
  let lastUrl: string | undefined;
  let requestCount = 0;
  let baseURL = '';
  const server = createServer(async (request, response) => {
    requestCount += 1;
    lastUrl = request.url;
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    lastBody = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    handler(response);
  });
  const request = (
    overrides: Partial<AiSdkGenerationRequest<{ answer: string }>> = {},
  ): AiSdkGenerationRequest<{ answer: string }> => ({
    requestId: randomUUID(), adapter: 'openai-compatible-chat', providerId: 'local-fixture',
    baseURL: `${baseURL}/v1`, apiKey: 'test-key', model: 'fixture-model',
    messages: [{ role: 'user', content: 'Return only JSON with an answer string.' }],
    contract: aiGenerationContracts.research.ref, schema, mode: 'json_mode', transport: 'single',
    timeout: { totalMs: 5_000, firstChunkMs: 2_000, chunkMs: 2_000 },
    signal: new AbortController().signal, ...overrides,
  });

  beforeAll(async () => {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('HTTP fixture did not start');
    baseURL = `http://127.0.0.1:${address.port}`;
  });
  beforeEach(() => {
    requestCount = 0;
    lastBody = undefined;
    lastUrl = undefined;
    handler = (response) => sendJson(response, {}, 500);
  });
  afterAll(async () => {
    server.close();
    await once(server, 'close');
  });

  it.each<AiAdapter>(['openai-compatible', 'openai-compatible-chat', 'openai-chat', 'openrouter'])(
    'sends json_object through %s without sending a schema or retrying',
    async (providerAdapter) => {
      handler = (response) => sendJson(response, completion('{"answer":"ok"}'));
      await expect(adapter.generate(request({ adapter: providerAdapter }))).resolves.toMatchObject({
        output: { answer: 'ok' }, usage: { status: 'reported', inputTokens: 9, outputTokens: 5 },
      });
      expect(lastUrl).toBe('/v1/chat/completions');
      expect(lastBody).toMatchObject({ response_format: { type: 'json_object' } });
      expect(JSON.stringify(lastBody)).not.toContain('json_schema');
      expect(lastBody).not.toHaveProperty('provider');
      expect(lastBody).toHaveProperty('messages', [
        { role: 'user', content: 'Return only JSON with an answer string.' },
      ]);
      expect(requestCount).toBe(1);
    },
  );

  it('uses the Responses JSON-mode format without changing the selected protocol', async () => {
    handler = (response) => sendJson(response, {
      id: 'response-fixture', created_at: 1, model: 'fixture-model',
      output: [{ type: 'message', role: 'assistant', id: 'message-fixture',
        content: [{ type: 'output_text', text: '{"answer":"responses"}', annotations: [] }] }],
      incomplete_details: null,
      usage: { input_tokens: 9, output_tokens: 5, total_tokens: 14,
        input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } },
    });
    await expect(adapter.generate(request({ adapter: 'openai-responses' }))).resolves.toMatchObject({
      output: { answer: 'responses' },
    });
    expect(lastUrl).toBe('/v1/responses');
    expect(lastBody).toMatchObject({ text: { format: { type: 'json_object' } } });
    expect(JSON.stringify(lastBody)).not.toContain('json_schema');
    expect(requestCount).toBe(1);
  });

  it.each(modes)('consumes fragmented %s JSON and a usage-only tail frame', async (mode) => {
    handler = (response) => sendStream(response, ['{"answer":', '"完整', '结果"}']);
    await expect(adapter.generate(request({ mode, transport: 'stream' }))).resolves.toMatchObject({
      output: { answer: '完整结果' }, usage: { status: 'reported', inputTokens: 9, outputTokens: 5 },
    });
    expect(lastBody).toHaveProperty('stream', true);
    if (mode === 'json_mode')
      expect(lastBody).toMatchObject({ response_format: { type: 'json_object' } });
    if (mode === 'json_validated') expect(lastBody).not.toHaveProperty('response_format');
    expect(requestCount).toBe(1);
  });

  it.each(modes)('preserves reported usage when streamed %s fails schema validation', async (mode) => {
    handler = (response) => sendStream(response, ['{"answer":""}']);
    await expect(adapter.generate(request({ mode, transport: 'stream' }))).rejects.toMatchObject({
      fact: { code: 'schema_invalid', phase: 'validation', externalResult: 'complete' },
      usage: { status: 'reported', inputTokens: 9, outputTokens: 5 },
    });
    expect(requestCount).toBe(1);
  });

  it.each(modes)('preserves reported usage when streamed %s is malformed JSON', async (mode) => {
    handler = (response) => sendStream(response, ['{"answer":']);
    await expect(adapter.generate(request({ mode, transport: 'stream' }))).rejects.toMatchObject({
      fact: { code: 'schema_invalid', externalResult: 'complete' },
      usage: { status: 'reported', inputTokens: 9, outputTokens: 5 },
    });
    expect(requestCount).toBe(1);
  });

  it.each(modes)('reports truncation before parsing incomplete %s output', async (mode) => {
    handler = (response) => sendStream(response, ['{"answer":'], 'length');
    await expect(adapter.generate(request({ mode, transport: 'stream' }))).rejects.toMatchObject({
      fact: { code: 'output_truncated', externalResult: 'complete' },
      usage: { status: 'reported', inputTokens: 9, outputTokens: 5 },
    });
    expect(requestCount).toBe(1);
  });

  it.each(modes)('never accepts valid %s JSON from a truncated stream', async (mode) => {
    handler = (response) => sendStream(response, ['{"answer":"valid"}'], 'length');
    await expect(adapter.generate(request({ mode, transport: 'stream' }))).rejects.toMatchObject({
      fact: { code: 'output_truncated' }, usage: { inputTokens: 9, outputTokens: 5 },
    });
  });

  it('does not turn missing usage into zero after failed JSON-mode validation', async () => {
    handler = (response) => sendStream(response, ['{"answer":""}'], 'stop', false);
    await expect(adapter.generate(request({ transport: 'stream' }))).rejects.toMatchObject({
      fact: { code: 'schema_invalid' },
      usage: { status: 'unknown', inputTokens: null, outputTokens: null },
    });
  });

  it('validates the complete non-stream JSON-mode result locally', async () => {
    handler = (response) => sendJson(response, completion('{"answer":""}'));
    await expect(adapter.generate(request())).rejects.toMatchObject({
      fact: { code: 'schema_invalid' }, usage: { inputTokens: 9, outputTokens: 5 },
    });
    expect(requestCount).toBe(1);
  });

  it('keeps legacy fenced text JSON working without enabling API JSON mode', async () => {
    handler = (response) => sendJson(response, completion('```json\n{"answer":"legacy"}\n```'));
    await expect(adapter.generate(request({ mode: 'json_validated' }))).resolves.toMatchObject({
      output: { answer: 'legacy' },
    });
    expect(lastBody).not.toHaveProperty('response_format');
  });

  it.each(['single', 'stream'] as const)('rejects Anthropic JSON mode before %s dispatch', async (transport) => {
    await expect(adapter.generate(request({ adapter: 'anthropic-messages', transport }))).rejects.toMatchObject({
      fact: { code: 'capability_unsupported', phase: 'preflight', externalResult: 'not_sent' },
    });
    expect(requestCount).toBe(0);
  });

  it('requires a JSON instruction without appending unreserved prompt tokens', async () => {
    await expect(adapter.generate(request({ messages: [{ role: 'user', content: 'Say hello.' }] })))
      .rejects.toMatchObject({ fact: { code: 'configuration_invalid', externalResult: 'not_sent' } });
    expect(requestCount).toBe(0);
  });

  it('does not retry or silently change modes after a provider rejection', async () => {
    handler = (response) => sendJson(response, { error: { message: 'unsupported response_format' } }, 400);
    await expect(adapter.generate(request())).rejects.toBeInstanceOf(Error);
    expect(lastBody).toMatchObject({ response_format: { type: 'json_object' } });
    expect(requestCount).toBe(1);
  });
});
