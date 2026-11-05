import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { writeFileSync } from 'node:fs';
import { createServer, type ServerResponse } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { PrismaClient } from '@prisma/client';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { AiSdkGenerationAdapter } from '../../src/ai/ai-sdk-generation.adapter.js';
import { aiProviderInputSchema } from '../../src/ai/ai-provider.contracts.js';
import {
  assertIsolated,
  createStack,
  databaseUrl,
  deferred,
  providerInput,
  reset,
  type ProviderStack,
} from './ai-provider-postgres.fixture.js';

const isolated = databaseUrl ? describe : describe.skip;

isolated('用途取消：公开 HTTP、真实 SDK、本机 SSE 与隔离 PostgreSQL', () => {
  let stack: ProviderStack | undefined;
  afterAll(async () => {
    await stack?.close();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('用户取消关闭上游，不发第二用途，保留未知用量及原配置', async () => {
    const started = deferred();
    const disconnected = deferred();
    const requests: Array<{
      path: string;
      model: string;
      format: string;
      stream: boolean;
      promptHash: string;
    }> = [];
    const allowedOrigins = new Set<string>();
    const blocked: string[] = [];
    let streaming: ServerResponse | undefined;
    const upstream = createServer(async (request, response) => {
      let raw = '';
      for await (const chunk of request) raw += chunk.toString();
      const body = JSON.parse(raw);
      requests.push({
        path: request.url ?? '',
        model: body.model,
        format: body.response_format?.type,
        stream: body.stream === true,
        promptHash: createHash('sha256').update(JSON.stringify(body.messages)).digest('hex'),
      });
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.flushHeaders();
      streaming = response;
      const frame = () =>
        response.write(
          `data: ${JSON.stringify({
            id: 'isolated-cancellation',
            object: 'chat.completion.chunk',
            created: 1,
            model: 'model',
            choices: [{ index: 0, delta: { content: ' ' }, finish_reason: null }],
          })}\n\n`,
        );
      frame();
      const timer = setInterval(frame, 20);
      response.on('close', () => {
        clearInterval(timer);
        disconnected.resolve();
      });
      started.resolve();
    });
    upstream.listen(0, '127.0.0.1');
    await once(upstream, 'listening');
    const address = upstream.address();
    if (!address || typeof address === 'string') throw new Error('隔离假上游地址缺失');
    const upstreamOrigin = `http://127.0.0.1:${address.port}`;
    allowedOrigins.add(upstreamOrigin);
    const fetchOriginal = globalThis.fetch;
    vi.stubGlobal('fetch', (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (!allowedOrigins.has(url.origin)) {
        blocked.push(url.origin);
        throw new Error('隔离取消验收禁止访问非所属上游或 API');
      }
      return fetchOriginal(input, { ...init, redirect: 'error' });
    });
    let running: Promise<{ status: number; body: unknown }> | undefined;
    try {
      const sdk = new AiSdkGenerationAdapter();
      const generate = vi.spyOn(sdk, 'generate');
      stack = await createStack(sdk);
      allowedOrigins.add(stack.origin);
      await reset(stack);
      const name = `isolated-cancel-${randomUUID()}`;
      const input = aiProviderInputSchema.parse({
        ...providerInput(name),
        authMode: 'api_key',
        baseUrl: `${upstreamOrigin}/v1`,
        upstreamFormat: 'chat-completions',
        chatImplementation: 'compatible',
        timeoutMs: 120000,
        executionRoutes: [
          {
            model: 'model',
            mode: 'native_schema',
            outputPolicy: 'auto',
            contract: { id: 'strategy_authoring_analysis', version: 'authoring-analysis-v1' },
          },
          {
            model: 'model',
            mode: 'native_schema',
            outputPolicy: 'auto',
            contract: { id: 'research', version: 'research-generation-v2' },
          },
        ],
      });
      await stack.configs.saveAi({
        name,
        enabled: true,
        priority: 100,
        capabilities: ['chat'],
        credentialsRef: 'isolated-fixture-key',
        settings: { ...input, modelDefaults: {}, modelReasoning: {}, generationValidation: [] },
      });
      await stack.prisma.aiRoutingSettings.create({
        data: { researchDefaultProvider: name, researchDefaultModel: 'model', revision: 7 },
      });
      const oldAudit = await stack.prisma.providerHealthCheck.create({
        data: {
          provider: name,
          state: 'healthy',
          source: 'manual',
          checkedAt: new Date('2026-10-01T00:00:00Z'),
          details: { kind: '隔离旧审计' },
        },
      });
      const before = await stack.configs.findStored(name);
      const beforeDefault = await stack.prisma.aiRoutingSettings.findUnique({
        where: { id: 'global' },
      });
      const candidate = {
        ...input,
        priority: 101,
        expectedRevision: before!.updatedAt.toISOString(),
      };
      const plan = await stack.request('/ai/providers/validation-plan', candidate);
      expect(plan.status).toBe(201);
      expect(plan.body).toMatchObject({
        pending: [expect.anything(), expect.anything()],
        maxDurationSeconds: 600,
      });
      expect(generate).not.toHaveBeenCalled();
      const operationId = randomUUID();
      const save = vi.spyOn(stack.providers, 'save');
      running = stack.request('/ai/providers/test-and-save', {
        provider: candidate,
        authorization: {
          operationId,
          planFingerprint: plan.body.planFingerprint,
          authorized: true,
          maxCalls: 2,
          allowTextFallback: false,
          stopOnFirstFailure: true,
        },
      });
      await Promise.race([
        started.promise,
        running.then((result) => {
          throw new Error(`假上游未收到请求：HTTP ${result.status}`);
        }),
        delay(5000).then(() => {
          throw new Error('隔离请求启动超时');
        }),
      ]);
      await delay(50);
      const cancelled = await stack.request(`/ai/providers/${name}/validation/cancel`, {
        operationId,
      });
      expect(cancelled).toEqual({ status: 201, body: { cancelled: true } });
      const result = await running;
      expect(result.status).toBe(400);
      expect(result.body).toMatchObject({ message: expect.stringContaining('取消') });
      await Promise.race([
        disconnected.promise,
        delay(3000).then(() => {
          throw new Error('取消后上游未断开');
        }),
      ]);
      expect(requests).toHaveLength(1);
      expect(requests[0]).toMatchObject({
        path: '/v1/chat/completions',
        model: 'model',
        format: 'json_schema',
        stream: true,
      });
      expect(generate).toHaveBeenCalledOnce();
      expect(stack.sdk.generate).not.toHaveBeenCalled();
      expect(save).not.toHaveBeenCalled();
      expect(blocked).toEqual([]);
      expect(await stack.configs.findStored(name)).toEqual(before);
      expect(await stack.prisma.aiRoutingSettings.findUnique({ where: { id: 'global' } })).toEqual(
        beforeDefault,
      );
      expect(
        await stack.prisma.providerHealthCheck.findUnique({ where: { id: oldAudit.id } }),
      ).toEqual(oldAudit);
      expect(await stack.prisma.aiRun.count()).toBe(0);
      expect(await stack.prisma.aiToolCall.count()).toBe(0);
      const readback = new PrismaClient({ datasourceUrl: databaseUrl ?? '' });
      let audits;
      try {
        await assertIsolated(readback);
        audits = await readback.providerHealthCheck.findMany({
          where: { details: { path: ['operationId'], equals: operationId } },
          orderBy: { checkedAt: 'asc' },
        });
        expect(audits).toHaveLength(2);
        expect(audits[0]).toMatchObject({ errorCode: 'pending', details: { status: 'pending' } });
        expect(audits[1]).toMatchObject({
          errorCode: 'validation_cancelled',
          details: {
            status: 'failed',
            mode: 'native_schema',
            purpose: 'strategy_authoring_analysis',
            usage: { status: 'unknown', inputTokens: null, outputTokens: null },
          },
        });
        expect(
          await readback.providerHealthCheck.findUnique({ where: { id: operationId } }),
        ).toMatchObject({ errorCode: 'operation_authorized' });
      } finally {
        await readback.$disconnect();
      }
      const evidencePath = process.env.T6_CANCEL_EVIDENCE_PATH;
      if (evidencePath)
        writeFileSync(
          evidencePath,
          JSON.stringify(
            {
              operationId,
              plan: plan.body,
              cancellation: cancelled,
              result,
              requests,
              audits,
              blocked,
              realModelCalls: 0,
              actualCost: { amount: '0', currency: 'USD', source: '本机假上游，无计费调用' },
              checks: {
                upstreamDisconnected: true,
                secondPurposeNotSent: true,
                noConfigurationSave: true,
                configurationAndCipherPreserved: true,
                emptyObjectsPreserved: true,
                defaultPreserved: true,
                oldAuditPreserved: true,
                unknownUsagePreserved: true,
                durableAuditReadback: true,
              },
            },
            null,
            2,
          ) + '\n',
        );
    } finally {
      streaming?.destroy();
      if (running) await running.catch(() => undefined);
      upstream.closeAllConnections();
      upstream.close();
      await once(upstream, 'close');
    }
  }, 15000);
});
