import { createServer } from 'node:http';
import { once } from 'node:events';
import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { researchGenerationV2Contract, type AiExecutionSummary } from '@thesis-ledger/schemas';
import { AiSdkGenerationAdapter } from '../../src/ai/ai-sdk-generation.adapter.js';
import { AiExecutionStateStore } from '../../src/ai/ai-execution-state.store.js';

describe('实际 HTTP 请求诊断的本地传输与成功账本', () => {
  let actualBody = '';
  let calls = 0;
  const server = createServer(async (request, response) => {
    calls += 1;
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    actualBody = Buffer.concat(chunks).toString('utf8');
    const input = JSON.parse(actualBody);
    const base = { id: 'local-fixture', created: 1, model: 'fixture/model:free' };
    if (input.stream) {
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      for (const frame of [
        {
          ...base,
          object: 'chat.completion.chunk',
          choices: [{ index: 0, delta: { content: '{"answer":"ok"}' }, finish_reason: null }],
        },
        {
          ...base,
          object: 'chat.completion.chunk',
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        },
        {
          ...base,
          object: 'chat.completion.chunk',
          choices: [],
          usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10, cost: 0 },
        },
      ])
        response.write(`data: ${JSON.stringify(frame)}\n\n`);
      response.end('data: [DONE]\n\n');
    } else {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          ...base,
          object: 'chat.completion',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: '{"answer":"ok"}' },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10, cost: 0 },
        }),
      );
    }
  });
  let baseURL = '';
  beforeAll(async () => {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('本地服务启动失败');
    baseURL = `http://127.0.0.1:${address.port}/v1`;
  });
  afterAll(async () => {
    server.close();
    await once(server, 'close');
  });

  it.each(['stream', 'single'] as const)(
    '$0 转换后的参数与真实接收 body 一致，成功结算后保留',
    async (transport) => {
      const before = calls;
      const requestId = randomUUID();
      const result = await new AiSdkGenerationAdapter().generate({
        requestId,
        adapter: 'openai-compatible-chat',
        compatibilityExtensionProfile: 'openrouter-v1',
        providerId: 'local',
        authMode: 'api_key',
        apiKey: 'sk-http-private',
        baseURL,
        model: 'fixture/model:free',
        messages: [{ role: 'user', content: 'PRIVATE_PROMPT 中文' }],
        contract: researchGenerationV2Contract.ref,
        schema: z.strictObject({ answer: z.string().describe('PRIVATE_SCHEMA') }),
        mode: 'native_schema',
        transport,
        maxOutputTokens: 20000,
        reasoningEffort: 'low',
        timeout: { totalMs: 3000, firstChunkMs: 2000, chunkMs: 2000 },
        signal: new AbortController().signal,
      });
      expect(calls).toBe(before + 1);
      expect(result.httpRequest).toMatchObject({
        boundary: 'fetch_dispatch',
        attempts: 1,
        omittedRequests: 0,
        method: 'POST',
        model: 'fixture/model:free',
        responseFormat: 'json_schema',
        schemaStrict: true,
        requireParameters: true,
        tokenLimits: { max_tokens: 20000 },
        reasoningEffort: 'low',
        bodyBytes: Buffer.byteLength(actualBody),
        bodySha256: createHash('sha256').update(actualBody).digest('hex'),
      });
      const sent = JSON.parse(actualBody);
      expect(sent.provider).toEqual({ require_parameters: true });
      expect(sent.response_format.json_schema.strict).toBe(true);
      const now = new Date();
      const ownership = { runId: randomUUID(), executionAttempt: 1 };
      const run = {
        id: ownership.runId,
        status: 'running',
        executionAttempt: 1,
        leaseUntil: new Date(now.getTime() + 60000),
        modelMetadata: {} as unknown,
      };
      const database = {
        $queryRaw: async () => [run],
        aiRun: {
          update: async ({ data }: { data: { modelMetadata?: unknown } }) => {
            if (data.modelMetadata !== undefined)
              run.modelMetadata = JSON.parse(JSON.stringify(data.modelMetadata));
            return run;
          },
        },
      };
      const prisma = {
        ...database,
        $transaction: (fn: (transaction: typeof database) => Promise<unknown>) => fn(database),
      };
      const store = new AiExecutionStateStore(prisma as never);
      const initial: AiExecutionSummary = {
        version: 'sdk-execution-v1',
        contract: researchGenerationV2Contract.ref,
        frozenPolicy: null,
        deadlineAt: run.leaseUntil.toISOString(),
        generationStatus: 'pending',
        usageCompleteness: 'unknown',
        requests: [],
        continuationBlockedReason: null,
      };
      await store.initialize(ownership, initial, now);
      const cost = {
        status: 'known',
        amount: '0',
        currency: 'USD',
        source: 'local-fixture',
        pricingVersion: null,
      };
      await store.prepareRequest({
        ...ownership,
        requestId,
        reservation: { aiCalls: 1, inputTokens: 100, outputTokens: 20000, cost },
        preparedAt: now,
      });
      await store.authorizeDispatch(ownership, requestId, now);
      const completion = {
        ...ownership,
        requestId,
        completedAt: now,
        httpRequest: result.httpRequest,
        revision: { revision: 1, usage: result.usage, cost, recordedAt: now.toISOString() },
        outcome: {
          status: 'complete',
          finishReason: 'stop',
          contract: researchGenerationV2Contract.ref,
          schemaAccepted: true,
        },
      };
      expect((await store.completeAndSettle(completion))?.applied).toBe(true);
      const read = await new AiExecutionStateStore(prisma as never).initialize(
        ownership,
        initial,
        now,
      );
      expect(read?.requests[0]?.httpRequest).toEqual(result.httpRequest);
      expect(JSON.stringify(run.modelMetadata)).not.toMatch(
        /PRIVATE_PROMPT|PRIVATE_SCHEMA|sk-http-private/u,
      );
      expect(Buffer.byteLength(JSON.stringify(read?.requests[0]?.httpRequest))).toBeLessThanOrEqual(
        1024,
      );
      await expect(
        store.completeAndSettle({
          ...completion,
          httpRequest: { ...result.httpRequest, requireParameters: false },
        }),
      ).rejects.toThrow('HTTP 诊断包含冲突事实');
    },
  );
});
