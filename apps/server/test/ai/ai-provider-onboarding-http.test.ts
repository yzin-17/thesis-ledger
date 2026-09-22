import { createServer, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { aiGenerationContracts } from '@thesis-ledger/schemas';
import { AiProviderSaveService } from '../../src/ai/ai-provider-save.service.js';
import { AiProviderController } from '../../src/ai/ai-provider.controller.js';
import { AiSdkGenerationAdapter } from '../../src/ai/ai-sdk-generation.adapter.js';
import { aiProviderInputSchema } from '../../src/ai/ai-provider.contracts.js';

const report = {
  conclusion: '受控样例',
  evidence: [],
  risks: [],
  unknowns: [],
  disclaimer: '仅验证格式',
};
const stream = (response: ServerResponse, output: unknown, finishReason = 'stop') => {
  response.writeHead(200, { 'content-type': 'text/event-stream' });
  const chunk = (content: string) => ({
    id: 'test',
    object: 'chat.completion.chunk',
    created: 1,
    model: 'model',
    choices: [{ index: 0, delta: { content }, finish_reason: null }],
  });
  const text = JSON.stringify(output);
  const frames = [
    chunk(text.slice(0, 12)),
    chunk(text.slice(12)),
    { ...chunk(''), choices: [{ index: 0, delta: {}, finish_reason: finishReason }] },
    {
      ...chunk(''),
      choices: [],
      usage: { prompt_tokens: 12, completion_tokens: 9, total_tokens: 21 },
    },
  ];
  for (const frame of frames) response.write(`data: ${JSON.stringify(frame)}\n\n`);
  response.end('data: [DONE]\n\n');
};

describe('provider onboarding with the real locked HTTP/SSE adapter', () => {
  let baseUrl = '';
  let handle: (body: Record<string, unknown>, response: ServerResponse) => void;
  let requests: Record<string, unknown>[] = [];
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
    requests.push(body);
    handle(body, response);
  });
  beforeAll(async () => {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('missing fixture address');
    baseUrl = `http://127.0.0.1:${address.port}/v1`;
  });
  afterAll(async () => {
    server.close();
    await once(server, 'close');
  });
  const fixture = () => {
    requests = [];
    const saved = { save: vi.fn(async () => ({ name: 'local' })) };
    const checks = { recordHistory: vi.fn(async () => null) };
    const service = new AiProviderSaveService(
      saved as never,
      { findStored: async () => null } as never,
      new AiSdkGenerationAdapter(),
      checks as never,
      { begin: async () => undefined, passed: async () => [] } as never,
    );
    const controller = new AiProviderController(saved as never, service);
    const input = aiProviderInputSchema.parse({
      name: 'local',
      baseUrl,
      authMode: 'none',
      models: ['model'],
      executionRoutes: [
        {
          model: 'model',
          mode: 'native_schema',
          outputPolicy: 'auto',
          contract: aiGenerationContracts.research.ref,
        },
      ],
      modelPricing: { model: { costPer1kInput: 0, costPer1kOutput: 0, costCurrency: 'USD' } },
      timeoutMs: 3000,
    });
    const run = async () => {
      const plan = await controller.validationPlan(input);
      return controller.testAndSave({
        provider: input,
        authorization: {
          operationId: randomUUID(),
          authorized: true,
          planFingerprint: plan.planFingerprint,
          maxCalls: plan.maxCalls,
        },
      });
    };
    return { input, saved, checks, controller, run };
  };
  it('blocks the normal HTTP save path and then validates native schema over SSE before saving', async () => {
    const f = fixture();
    handle = (_body, response) => stream(response, report);
    await expect(f.controller.save(f.input)).rejects.toThrow('测试并保存');
    expect(requests).toHaveLength(0);
    await f.run();
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ stream: true, response_format: { type: 'json_schema' } });
    expect(f.saved.save).toHaveBeenCalledWith(
      expect.objectContaining({
        executionRoutes: [expect.objectContaining({ mode: 'native_schema' })],
      }),
      [expect.objectContaining({ mode: 'native_schema' })],
    );
    expect(f.checks.recordHistory).toHaveBeenLastCalledWith(
      'local',
      'healthy',
      expect.any(Number),
      undefined,
      expect.any(Date),
      'manual',
      expect.objectContaining({
        status: 'passed',
        usage: { status: 'reported', inputTokens: 12, outputTokens: 9 },
      }),
    );
  });
  it('recognizes only an explicit unsupported-format response and then sends real JSON Mode', async () => {
    const f = fixture();
    handle = (body, response) => {
      if ((body.response_format as { type: string }).type === 'json_schema') {
        response.writeHead(400, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            error: {
              message: 'format unsupported',
              code: 'unsupported_parameter',
              param: 'response_format',
            },
          }),
        );
      } else stream(response, report);
    };
    await f.run();
    expect(requests.map((body) => body.response_format)).toEqual([
      expect.objectContaining({ type: 'json_schema' }),
      { type: 'json_object' },
    ]);
    expect(f.saved.save).toHaveBeenCalledWith(
      expect.objectContaining({
        executionRoutes: [expect.objectContaining({ mode: 'json_mode', outputPolicy: 'auto' })],
      }),
      [expect.objectContaining({ mode: 'json_mode' })],
    );
  });
  it('does not fallback, save, or erase reported usage after complete invalid output', async () => {
    const f = fixture();
    handle = (_body, response) => stream(response, { ...report, conclusion: '' });
    await expect(f.run()).rejects.toThrow('验证未通过');
    expect(requests).toHaveLength(1);
    expect(f.saved.save).not.toHaveBeenCalled();
    expect(f.checks.recordHistory).toHaveBeenLastCalledWith(
      'local',
      'degraded',
      expect.any(Number),
      'validation_failed',
      expect.any(Date),
      'manual',
      expect.objectContaining({
        status: 'failed',
        usage: { status: 'reported', inputTokens: 12, outputTokens: 9 },
      }),
    );
  });
  it('rejects a truncated response even if the JSON is complete', async () => {
    const f = fixture();
    handle = (_body, response) => stream(response, report, 'length');
    await expect(f.run()).rejects.toThrow('验证未通过');
    expect(requests).toHaveLength(1);
    expect(f.saved.save).not.toHaveBeenCalled();
  });
});
