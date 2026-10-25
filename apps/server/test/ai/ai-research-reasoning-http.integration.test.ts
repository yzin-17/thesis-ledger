import { createServer } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { aiGenerationContracts, researchGenerationV2Contract } from '@thesis-ledger/schemas';
import {
  AiSdkGenerationAdapter,
  type AiSdkGenerationRequest,
} from '../../src/ai/ai-sdk-generation.adapter.js';

describe('研究推理开关的真实本地 HTTP', () => {
  const bodies: Record<string, unknown>[] = [];
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    bodies.push(JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>);
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    const base = {
      id: 'local',
      object: 'chat.completion.chunk',
      created: 1,
      model: 'local/model:free',
    };
    for (const item of [
      {
        ...base,
        choices: [{ index: 0, delta: { content: '{"answer":"ok"}' }, finish_reason: null }],
      },
      { ...base, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
      {
        ...base,
        choices: [],
        usage: {
          prompt_tokens: 8,
          completion_tokens: 4,
          total_tokens: 12,
          completion_tokens_details: { reasoning_tokens: 0 },
          cost: 0,
        },
      },
    ])
      response.write(`data: ${JSON.stringify(item)}\n\n`);
    response.end('data: [DONE]\n\n');
  });
  let baseURL = '';
  beforeAll(async () => {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('本地启动失败');
    baseURL = `http://127.0.0.1:${address.port}/v1`;
  });
  afterAll(async () => {
    server.close();
    server.closeAllConnections();
    await once(server, 'close');
  });
  const request = (
    overrides: Partial<AiSdkGenerationRequest<{ answer: string }>> = {},
  ): AiSdkGenerationRequest<{ answer: string }> => ({
    requestId: randomUUID(),
    adapter: 'openai-compatible-chat',
    compatibilityExtensionProfile: 'openrouter-v1',
    reasoningEnabled: false,
    providerId: 'explicit',
    baseURL,
    apiKey: 'local-secret',
    model: 'local/model:free',
    messages: [{ role: 'user', content: 'Return JSON.' }],
    contract: researchGenerationV2Contract.ref,
    schema: z.strictObject({ answer: z.string() }),
    mode: 'native_schema',
    transport: 'stream',
    maxOutputTokens: 20000,
    timeout: { firstChunkMs: 2000, chunkMs: 2000 },
    signal: new AbortController().signal,
    ...overrides,
  });

  it('研究最终请求明确关闭推理，成功审计保留真实 HTTP 事实', async () => {
    const before = bodies.length,
      result = await new AiSdkGenerationAdapter().generate(request());
    expect(bodies).toHaveLength(before + 1);
    expect(result.output).toEqual({ answer: 'ok' });
    expect(bodies.at(-1)).toMatchObject({
      reasoning: { enabled: false },
      stream: true,
      max_tokens: 20000,
      provider: { require_parameters: true },
      response_format: { type: 'json_schema', json_schema: { strict: true } },
    });
    expect(bodies.at(-1)).not.toHaveProperty('reasoning_effort');
    expect(result.httpRequest).toMatchObject({
      attempts: 1,
      reasoning: { enabled: false },
      requireParameters: true,
      responseFormat: 'json_schema',
    });
    expect(result.providerCost).toBe('0');
  });

  it('未配置开关的分析请求仍沿用原行为', async () => {
    const { reasoningEnabled, ...input } = request({
      contract: aiGenerationContracts.authoringAnalysis.ref,
    });
    void reasoningEnabled;
    await new AiSdkGenerationAdapter().generate(input);
    expect(bodies.at(-1)).not.toHaveProperty('reasoning');
  });

  it('错误用途／接口／兼容配置或与强度并用时发送前拒绝', async () => {
    const before = bodies.length,
      sdk = new AiSdkGenerationAdapter();
    for (const overrides of [
      { contract: aiGenerationContracts.research.ref },
      { contract: aiGenerationContracts.authoringAnalysis.ref },
      { adapter: 'openai-chat' as const },
      { compatibilityExtensionProfile: undefined },
      { reasoningEffort: 'low' as const },
    ]) {
      const input = request();
      Object.assign(input, overrides);
      await expect(sdk.generate(input)).rejects.toMatchObject({
        fact: { code: 'capability_unsupported', phase: 'preflight', externalResult: 'not_sent' },
      });
    }
    expect(bodies).toHaveLength(before);
  });
});
