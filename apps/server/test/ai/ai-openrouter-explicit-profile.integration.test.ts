import { createServer } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { aiGenerationContracts } from '@thesis-ledger/schemas';
import { AiSdkGenerationAdapter } from '../../src/ai/ai-sdk-generation.adapter.js';

describe('显式 OpenRouter 扩展的本地流式请求', () => {
  const bodies: unknown[] = [];
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    bodies.push(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    const frame = {
      id: 'local-only',
      object: 'chat.completion.chunk',
      created: 1,
      model: 'local-fixture',
    };
    for (const data of [
      {
        ...frame,
        choices: [{ index: 0, delta: { content: '{"answer":"ok"}' }, finish_reason: null }],
      },
      { ...frame, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
      {
        ...frame,
        choices: [],
        usage: { prompt_tokens: 4, completion_tokens: 3, total_tokens: 7, cost: 0 },
      },
    ])
      response.write(`data: ${JSON.stringify(data)}\n\n`);
    response.end('data: [DONE]\n\n');
  });
  let baseURL = '';
  beforeAll(async () => {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('本地流式服务启动失败');
    baseURL = `http://127.0.0.1:${address.port}/v1`;
  });
  afterAll(async () => {
    server.close();
    await once(server, 'close');
  });

  it.each([aiGenerationContracts.research.ref, aiGenerationContracts.authoringAnalysis.ref])(
    '兼容扩展与严格 Schema 同时出现在 $id 的最终请求',
    async (contract) => {
      const before = bodies.length;
      const result = await new AiSdkGenerationAdapter().generate({
        requestId: randomUUID(),
        providerId: 'explicit-openrouter',
        adapter: 'openai-compatible-chat',
        compatibilityExtensionProfile: 'openrouter-v1',
        baseURL,
        apiKey: 'local-secret',
        model: 'local-fixture',
        messages: [{ role: 'user', content: 'Return JSON.' }],
        contract,
        schema: z.object({ answer: z.string() }).strict(),
        mode: 'native_schema',
        transport: 'stream',
        maxOutputTokens: 20000,
        timeout: { firstChunkMs: 2000, chunkMs: 2000 },
        signal: new AbortController().signal,
      });
      expect(result.output).toEqual({ answer: 'ok' });
      expect(result.providerCost).toBe('0');
      expect(bodies).toHaveLength(before + 1);
      expect(bodies.at(-1)).toMatchObject({
        model: 'local-fixture',
        stream: true,
        max_tokens: 20000,
        provider: { require_parameters: true },
        response_format: {
          type: 'json_schema',
          json_schema: { strict: true, schema: { type: 'object' } },
        },
      });
    },
  );
});
