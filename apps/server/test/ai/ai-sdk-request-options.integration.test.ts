import { randomUUID, createHash } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  aiGenerationContracts,
  type AiAdapter,
  type AiModelRequestOptions,
} from '@thesis-ledger/schemas';
import {
  AiSdkGenerationAdapter,
  type AiSdkGenerationRequest,
} from '../../src/ai/ai-sdk-generation.adapter.js';
import { traceFixture } from './ai-trace.fixture.js';

const schema = z.object({ answer: z.literal('ok') }).strict();
const options: AiModelRequestOptions = {
  headers: { 'x-observation': 'fixture' },
  body: { custom: { enabled: false, labels: ['one', 'two'], nullable: null } },
  outputTokenLimit: 'upstream',
};
const content = '{"answer":"ok"}';

describe('通用参数的真实SDK与本地HTTP出站', () => {
  let origin = '';
  let calls = 0;
  let sent = '';
  let observation: string | string[] | undefined;
  const server = createServer(async (req, res) => {
    calls++;
    observation = req.headers['x-observation'];
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(Buffer.from(c));
    sent = Buffer.concat(chunks).toString('utf8');
    const body = JSON.parse(sent) as Record<string, unknown>;
    if (body.stream === true) {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      for (const frame of [
        { choices: [{ index: 0, delta: { content }, finish_reason: null }] },
        { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
        { choices: [], usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 } },
      ])
        res.write(
          'data: ' +
            JSON.stringify({ id: 'local', model: 'fixture-model', created: 1, ...frame }) +
            '\n\n',
        );
      res.end('data: [DONE]\n\n');
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    if (req.url?.endsWith('/responses')) {
      res.end(
        JSON.stringify({
          id: 'response-fixture',
          created_at: 1,
          model: 'fixture-model',
          incomplete_details: null,
          output: [
            {
              type: 'message',
              role: 'assistant',
              id: 'message-fixture',
              content: [{ type: 'output_text', text: content, annotations: [] }],
            },
          ],
          usage: {
            input_tokens: 5,
            output_tokens: 2,
            total_tokens: 7,
            input_tokens_details: { cached_tokens: 0 },
            output_tokens_details: { reasoning_tokens: 0 },
          },
        }),
      );
    } else if (req.url?.endsWith('/messages')) {
      res.end(
        JSON.stringify({
          type: 'message',
          id: 'message-fixture',
          model: 'fixture-model',
          role: 'assistant',
          content: [{ type: 'text', text: content }],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: 5, output_tokens: 2 },
        }),
      );
    } else {
      res.end(
        JSON.stringify({
          id: 'local',
          object: 'chat.completion',
          model: 'fixture-model',
          created: 1,
          choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
        }),
      );
    }
  });
  beforeAll(async () => {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('本地HTTP服务启动失败');
    origin = `http://127.0.0.1:${address.port}/v1`;
  });
  afterAll(async () => {
    server.closeAllConnections();
    server.close();
    await once(server, 'close');
  });

  const request = (
    adapter: AiAdapter,
    transport: 'single' | 'stream' = 'single',
  ): AiSdkGenerationRequest<{ answer: 'ok' }> => ({
    requestId: randomUUID(),
    adapter,
    providerId: 'local',
    baseURL: origin,
    apiKey: 'fixture-key',
    model: 'fixture-model',
    contract: aiGenerationContracts.research.ref,
    schema,
    messages: [{ role: 'user', content: 'Return JSON with answer ok' }],
    mode: adapter === 'anthropic-messages' ? 'json_validated' : 'json_mode',
    transport,
    maxOutputTokens: 20000,
    requestOptions:
      adapter === 'anthropic-messages' ? { ...options, outputTokenLimit: 'budget' } : options,
    timeout: { totalMs: 5000, firstChunkMs: 2000, chunkMs: 2000 },
    signal: new AbortController().signal,
  });

  it.each([
    ['openai-compatible-chat', 'single'],
    ['openai-chat', 'single'],
    ['openai-responses', 'single'],
    ['anthropic-messages', 'single'],
    ['openai-compatible-chat', 'stream'],
  ] as const)('%s / %s：参数在派发前生效，trace摘要等于实际请求', async (adapter, transport) => {
    calls = 0;
    const root = await mkdtemp(join(tmpdir(), 'request-options-'));
    try {
      const fixture = traceFixture(root);
      await fixture.capture.runClaimed(fixture.run as never, async () => {
        const result = await new AiSdkGenerationAdapter().generate(request(adapter, transport));
        expect(result.output).toEqual({ answer: 'ok' });
        fixture.run.status = 'succeeded';
        fixture.run.completedAt = new Date();
      });
      expect(calls).toBe(1);
      expect(observation).toBe('fixture');
      const body = JSON.parse(sent) as Record<string, unknown>;
      expect(body.custom).toEqual(options.body?.custom);
      expect(body.model).toBe('fixture-model');
      if (adapter === 'anthropic-messages') expect(body.max_tokens).toBe(20000);
      else
        for (const field of ['max_tokens', 'max_completion_tokens', 'max_output_tokens'])
          expect(body).not.toHaveProperty(field);
      const found = await fixture.read();
      expect(found.manifest.captureStatus).toBe('complete');
      const node = found.manifest.nodes.find((n) => n.stage === 'http.request');
      if (!node?.output) throw new Error('缺少HTTP派发trace');
      expect(found.artifacts[node.output.file]?.value).toMatchObject({
        serializedBody: {
          bytes: Buffer.byteLength(sent),
          sha256: createHash('sha256').update(sent).digest('hex'),
        },
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('受保护字段及必填上限协议在派发前拒绝', async () => {
    calls = 0;
    const sdk = new AiSdkGenerationAdapter();
    await expect(
      sdk.generate({ ...request('anthropic-messages'), requestOptions: options }),
    ).rejects.toMatchObject({
      fact: { code: 'capability_unsupported', externalResult: 'not_sent' },
    });
    await expect(
      sdk.generate({
        ...request('openai-compatible-chat'),
        requestOptions: { body: { messages: [] } },
      }),
    ).rejects.toBeDefined();
    expect(calls).toBe(0);
  });
});
