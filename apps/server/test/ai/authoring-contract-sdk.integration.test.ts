import { createServer } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { aiGenerationContracts } from '@thesis-ledger/schemas';
import { AiSdkGenerationAdapter } from '../../src/ai/ai-sdk-generation.adapter.js';
import { probeMessages } from '../../src/ai/provider-connection-test.js';
import { authoringFailureCode } from '../../src/strategy-authoring/authoring-attempt.js';

describe('策略编写合同与受控真实 HTTP Provider', () => {
  let baseURL: string;
  let output: unknown;
  let onDispatch: (() => void) | null = null;
  const bodies: Array<{ model: string; response_format: { type: string } }> = [];
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    bodies.push(JSON.parse(Buffer.concat(chunks).toString()) as (typeof bodies)[number]);
    if (onDispatch) {
      onDispatch();
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        id: 'controlled-authoring',
        object: 'chat.completion',
        created: 1,
        model: 'selected-authoring-model',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: JSON.stringify(output) },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 12, completion_tokens: 24, total_tokens: 36 },
      }),
    );
  });
  it('实际 HTTP 已发送后的期限中止记录超时及结果未知，只有一个请求', async () => {
    const count = bodies.length;
    const controller = new AbortController();
    onDispatch = () => {
      const deadline = AbortSignal.timeout(1);
      deadline.addEventListener('abort', () => controller.abort(deadline.reason), { once: true });
    };
    const signal = controller.signal;
    const contract = aiGenerationContracts.authoringAnalysis;
    try {
      await new AiSdkGenerationAdapter().generate({
        requestId: randomUUID(),
        adapter: 'openai-compatible-chat',
        providerId: 'controlled-authoring',
        baseURL,
        apiKey: 'isolated-not-a-credential',
        model: 'selected-authoring-model',
        messages: probeMessages(contract.ref.id),
        contract: contract.ref,
        schema: contract.schema,
        mode: 'native_schema',
        transport: 'single',
        maxOutputTokens: 8192,
        timeout: { totalMs: 2000 },
        signal,
      });
      throw new Error('受控期限必须中止');
    } catch (error) {
      expect(error).toMatchObject({ fact: { code: 'cancelled', externalResult: 'unknown' } });
      expect(authoringFailureCode(error, signal.reason)).toBe('AUTHORING_TIMEOUT');
      expect(bodies).toHaveLength(count + 1);
    } finally {
      onDispatch = null;
    }
  });
  beforeAll(async () => {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('受控 HTTP 启动失败');
    baseURL = `http://127.0.0.1:${address.port}/v1`;
  });
  afterAll(async () => {
    server.close();
    await once(server, 'close');
  });
  it('各用途在单次请求中保留明确模型、合同与真实用量，不进入研究路由', async () => {
    const definition: unknown = JSON.parse(
      readFileSync(
        new URL(
          '../../../../packages/schemas/fixtures/strategy-authoring.exchange.json',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    const adapter = new AiSdkGenerationAdapter();
    for (const [contract, fixture] of [
      [
        aiGenerationContracts.authoringAnalysis,
        { requirements: [], questions: [], runtimeIntents: [] },
      ],
      [aiGenerationContracts.authoringGeneration, { definition, coverage: [] }],
      [aiGenerationContracts.authoringModification, { definition, coverage: [] }],
    ] as const) {
      output = fixture;
      const count = bodies.length;
      const result = await adapter.generate<unknown>({
        requestId: randomUUID(),
        adapter: 'openai-compatible-chat',
        providerId: 'controlled-authoring',
        baseURL,
        apiKey: 'isolated-not-a-credential',
        model: 'selected-authoring-model',
        messages: probeMessages(contract.ref.id),
        contract: contract.ref,
        schema: contract.schema,
        mode: 'native_schema',
        transport: 'single',
        maxOutputTokens: 8192,
        timeout: { totalMs: 2000 },
        signal: new AbortController().signal,
      });
      expect(result.actualModel).toBe('selected-authoring-model');
      expect(result.usage).toEqual({ status: 'reported', inputTokens: 12, outputTokens: 24 });
      expect(result.providerCost).toBeNull();
      expect(bodies).toHaveLength(count + 1);
      expect(bodies.at(-1)).toMatchObject({
        model: 'selected-authoring-model',
        response_format: { type: 'json_schema' },
      });
      expect(result.output).toMatchObject(fixture);
    }
  });
});
