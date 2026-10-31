import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { writeFileSync } from 'node:fs';
import { createServer, type ServerResponse } from 'node:http';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { AiSdkGenerationAdapter } from '../../src/ai/ai-sdk-generation.adapter.js';
import { aiProviderInputSchema } from '../../src/ai/ai-provider.contracts.js';
import {
  createStack,
  databaseUrl,
  providerInput,
  reset,
  type ProviderStack,
} from './ai-provider-postgres.fixture.js';

const isolated =
  databaseUrl && process.env.AI_PROVIDER_WALL_CLOCK_TEST === '1' ? describe : describe.skip;
const scenarios = ['headers', 'heartbeat', 'chunk'] as const;
isolated('默认停顿时限：真实墙钟、HTTP、SDK 和 PostgreSQL', () => {
  let stack: ProviderStack | undefined;
  afterAll(async () => {
    await stack?.close();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('首输出与心跳约 120 秒终止，已有有效输出后的停顿约 60 秒终止', async () => {
    expect(vi.isFakeTimers()).toBe(false);
    const requests: Array<{ scenario: string; stream: boolean; format: string; at: string }> = [];
    const closed = new Set<string>();
    const responses = new Set<ServerResponse>();
    const upstream = createServer(async (request, response) => {
      let raw = '';
      for await (const chunk of request) raw += chunk.toString();
      const body = JSON.parse(raw);
      const scenario = request.url!.split('/')[1]!;
      requests.push({
        scenario,
        stream: body.stream,
        format: body.response_format?.type,
        at: new Date().toISOString(),
      });
      responses.add(response);
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.flushHeaders();
      let timer: ReturnType<typeof setInterval> | undefined;
      if (scenario === 'heartbeat')
        timer = setInterval(() => response.write(': heartbeat\n\n'), 1000);
      if (scenario === 'chunk')
        response.write(
          `data: ${JSON.stringify({
            id: 'isolated-stall',
            object: 'chat.completion.chunk',
            created: 1,
            model: 'model',
            choices: [{ index: 0, delta: { content: '{' }, finish_reason: null }],
          })}\n\n`,
        );
      response.on('close', () => {
        if (timer) clearInterval(timer);
        responses.delete(response);
        closed.add(scenario);
      });
    });
    upstream.listen(0, '127.0.0.1');
    await once(upstream, 'listening');
    const address = upstream.address();
    if (!address || typeof address === 'string') throw new Error('本机上游地址缺失');
    const origin = `http://127.0.0.1:${address.port}`;
    const allowed = new Set([origin]);
    const blocked: string[] = [];
    const fetchOriginal = globalThis.fetch;
    vi.stubGlobal('fetch', (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (!allowed.has(url.origin)) {
        blocked.push(url.origin);
        throw new Error('禁止停顿隔离验收访问非所属地址');
      }
      return fetchOriginal(input, { ...init, redirect: 'error' });
    });
    try {
      const sdk = new AiSdkGenerationAdapter();
      const generate = vi.spyOn(sdk, 'generate');
      stack = await createStack(sdk);
      allowed.add(stack.origin);
      await reset(stack);
      const save = vi.spyOn(stack.providers, 'save');
      const prepared = [];
      for (const scenario of scenarios) {
        const input = aiProviderInputSchema.parse({
          ...providerInput(`isolated-stall-${scenario}-${randomUUID()}`),
          baseUrl: `${origin}/${scenario}/v1`,
          timeoutMs: 3000,
          executionRoutes: [
            {
              model: 'model',
              mode: 'json_mode',
              outputPolicy: 'manual',
              contract: { id: 'research', version: 'research-generation-v2' },
            },
            {
              model: 'model',
              mode: 'json_mode',
              outputPolicy: 'manual',
              contract: { id: 'strategy_authoring_analysis', version: 'authoring-analysis-v1' },
            },
          ],
        });
        await stack.configs.saveAi({
          name: input.name,
          enabled: true,
          priority: 100,
          capabilities: ['chat'],
          settings: { ...input, modelDefaults: {}, modelReasoning: {}, generationValidation: [] },
        });
        const before = await stack.configs.findStored(input.name);
        const candidate = {
          ...input,
          priority: 101,
          expectedRevision: before!.updatedAt.toISOString(),
        };
        const plan = await stack.request('/ai/providers/validation-plan', candidate);
        expect(plan.status).toBe(201);
        expect(plan.body).toMatchObject({ maxCalls: 2, maxDurationSeconds: 600 });
        prepared.push({
          scenario,
          input,
          before,
          candidate,
          plan: plan.body,
          operationId: randomUUID(),
        });
      }
      await stack.prisma.aiRoutingSettings.create({
        data: {
          researchDefaultProvider: prepared[0]!.input.name,
          researchDefaultModel: 'model',
          revision: 7,
        },
      });
      const beforeDefault = await stack.prisma.aiRoutingSettings.findUnique({
        where: { id: 'global' },
      });
      const results = await Promise.all(
        prepared.map(async (row) => {
          const start = performance.now();
          const result = await stack!.request('/ai/providers/test-and-save', {
            provider: row.candidate,
            authorization: {
              operationId: row.operationId,
              authorized: true,
              allowTextFallback: false,
              stopOnFirstFailure: true,
              maxCalls: 2,
              planFingerprint: row.plan.planFingerprint,
            },
          });
          const elapsedMs = performance.now() - start;
          const audits = await stack!.prisma.providerHealthCheck.findMany({
            where: { details: { path: ['operationId'], equals: row.operationId } },
            orderBy: { checkedAt: 'asc' },
          });
          return { scenario: row.scenario, elapsedMs, result, audits };
        }),
      );
      const decisions = generate.mock.calls.map(([request]) => request.timeoutDecision);
      await vi.waitFor(() => expect(closed).toEqual(new Set(scenarios)), { timeout: 5000 });
      if (process.env.T6_STALL_EVIDENCE_PATH)
        writeFileSync(
          process.env.T6_STALL_EVIDENCE_PATH,
          JSON.stringify(
            {
              results,
              requests,
              decisions,
              closed: [...closed],
              blocked,
              realModelCalls: 0,
              cost: 0,
            },
            null,
            2,
          ),
        );
      expect(requests).toHaveLength(3);
      expect(generate).toHaveBeenCalledTimes(3);
      expect(requests.every((row) => row.stream && row.format === 'json_object')).toBe(true);
      expect(new Set(requests.map((row) => row.scenario))).toEqual(new Set(scenarios));
      for (const row of results) {
        expect(row.result.status).toBe(400);
        expect(row.audits).toHaveLength(2);
        expect(row.audits[1]).toMatchObject({
          errorCode:
            row.scenario === 'chunk'
              ? 'provider_output_idle_timeout'
              : 'provider_first_output_timeout',
          details: {
            status: 'failed',
            usage: { status: 'unknown', inputTokens: null, outputTokens: null },
          },
        });
        expect(row.elapsedMs).toBeGreaterThanOrEqual(row.scenario === 'chunk' ? 59000 : 119000);
        expect(row.elapsedMs).toBeLessThan(row.scenario === 'chunk' ? 75000 : 135000);
      }
      for (const decision of decisions)
        expect(decision).toMatchObject({
          policy: {
            taskBudgetMs: 600000,
            firstOutputTimeoutMs: 120000,
            outputIdleTimeoutMs: 60000,
            cleanupReserveMs: 5000,
          },
          sdkTimeout: { firstChunkMs: 120000, chunkMs: 60000 },
        });
      expect(closed).toEqual(new Set(scenarios));
      expect(save).not.toHaveBeenCalled();
      expect(blocked).toEqual([]);
      for (const row of prepared)
        expect(await stack.configs.findStored(row.input.name)).toEqual(row.before);
      expect(await stack.prisma.aiRoutingSettings.findUnique({ where: { id: 'global' } })).toEqual(
        beforeDefault,
      );
      expect(await stack.prisma.aiRun.count()).toBe(0);
      expect(await stack.prisma.aiToolCall.count()).toBe(0);
    } finally {
      for (const response of responses) response.destroy();
      upstream.closeAllConnections();
      await new Promise<void>((resolve) => upstream.close(() => resolve()));
    }
  }, 180000);
});
