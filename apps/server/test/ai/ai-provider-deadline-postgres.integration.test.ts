import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { writeFileSync } from 'node:fs';
import { createServer, request as httpRequest, type ServerResponse } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { AiSdkGenerationAdapter } from '../../src/ai/ai-sdk-generation.adapter.js';
import { aiProviderInputSchema } from '../../src/ai/ai-provider.contracts.js';
import { researchConnectionProbe } from '../../src/ai/research-connection-probe.js';
import {
  createStack,
  databaseUrl,
  deferred,
  providerInput,
  reset,
  type ProviderStack,
} from './ai-provider-postgres.fixture.js';

const isolated =
  databaseUrl && process.env.AI_PROVIDER_WALL_CLOCK_TEST === '1' ? describe : describe.skip;

function frame(response: ServerResponse, text: string, finish: string | null = null) {
  response.write(
    `data: ${JSON.stringify({
      id: 'isolated-deadline',
      object: 'chat.completion.chunk',
      created: 1,
      model: 'model',
      choices: [{ index: 0, delta: { content: text }, finish_reason: finish }],
    })}\n\n`,
  );
}

isolated('用途完整期限：不加速时间的公开 HTTP/SDK/PostgreSQL 验收', () => {
  let stack: ProviderStack | undefined;
  afterAll(async () => {
    await stack?.close();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('两用途共享真实 600 秒预算，持续输出在收尾预留前终止且不保存', async () => {
    expect(vi.isFakeTimers()).toBe(false);
    const research = { id: 'research', version: 'research-generation-v2' } as const;
    const requests: Array<{ at: string; path: string; stream: boolean; format: string }> = [];
    const closed = deferred();
    const responses = new Set<ServerResponse>();
    const upstream = createServer(async (request, response) => {
      let raw = '';
      for await (const chunk of request) raw += chunk.toString();
      const body = JSON.parse(raw);
      requests.push({
        at: new Date().toISOString(),
        path: request.url ?? '',
        stream: body.stream,
        format: body.response_format?.type,
      });
      responses.add(response);
      response.on('close', () => responses.delete(response));
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.flushHeaders();
      if (requests.length === 1) {
        await delay(1000);
        frame(response, JSON.stringify(researchConnectionProbe(research)), 'stop');
        response.write(
          `data: ${JSON.stringify({
            id: 'isolated-deadline',
            object: 'chat.completion.chunk',
            created: 1,
            model: 'model',
            choices: [],
            usage: { prompt_tokens: 12, completion_tokens: 9, total_tokens: 21 },
          })}\n\n`,
        );
        response.end('data: [DONE]\n\n');
        return;
      }
      const timer = setInterval(() => frame(response, 'x'), 250);
      frame(response, 'x');
      response.on('close', () => {
        clearInterval(timer);
        closed.resolve();
      });
    });
    upstream.listen(0, '127.0.0.1');
    await once(upstream, 'listening');
    const address = upstream.address();
    if (!address || typeof address === 'string') throw new Error('隔离上游地址缺失');
    const origin = `http://127.0.0.1:${address.port}`;
    const allowed = new Set([origin]);
    const blocked: string[] = [];
    const fetchOriginal = globalThis.fetch;
    vi.stubGlobal('fetch', (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (!allowed.has(url.origin)) {
        blocked.push(url.origin);
        throw new Error('禁止隔离期限验收访问非所属地址');
      }
      return fetchOriginal(input, { ...init, redirect: 'error' });
    });
    try {
      const sdk = new AiSdkGenerationAdapter();
      const generate = vi.spyOn(sdk, 'generate');
      stack = await createStack(sdk);
      allowed.add(stack.origin);
      await reset(stack);
      const input = aiProviderInputSchema.parse({
        ...providerInput(`isolated-deadline-${randomUUID()}`),
        baseUrl: `${origin}/v1`,
        authMode: 'api_key',
        upstreamFormat: 'chat-completions',
        chatImplementation: 'compatible',
        timeoutMs: 120000,
        executionRoutes: [
          { model: 'model', mode: 'native_schema', outputPolicy: 'auto', contract: research },
          {
            model: 'model',
            mode: 'native_schema',
            outputPolicy: 'auto',
            contract: { id: 'strategy_authoring_analysis', version: 'authoring-analysis-v1' },
          },
        ],
      });
      await stack.configs.saveAi({
        name: input.name,
        enabled: true,
        priority: 100,
        capabilities: ['chat'],
        credentialsRef: 'isolated-fixture-key',
        settings: { ...input, modelDefaults: {}, modelReasoning: {}, generationValidation: [] },
      });
      await stack.prisma.aiRoutingSettings.create({
        data: { researchDefaultProvider: input.name, researchDefaultModel: 'model', revision: 7 },
      });
      const before = await stack.configs.findStored(input.name);
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
        maxDurationSeconds: 600,
        pending: [expect.anything(), expect.anything()],
      });
      const operationId = randomUUID();
      const save = vi.spyOn(stack.providers, 'save');
      const startedAt = new Date().toISOString(),
        startedMono = performance.now();
      // node:fetch 的默认 300 秒响应头等待不能用来验收 600 秒应用预算。
      // 只有隔离 API 客户端使用更长等待；SDK、Server 和业务期限保持现行策略。
      const operation = {
        provider: candidate,
        authorization: {
          operationId,
          authorized: true,
          planFingerprint: plan.body.planFingerprint,
          maxCalls: 2,
          allowTextFallback: false,
          stopOnFirstFailure: true,
        },
      };
      expect(new URL(stack.origin).hostname).toBe('127.0.0.1');
      const result = await new Promise<{ status: number; body: unknown }>((resolve, reject) => {
        const client = httpRequest(
          `${stack!.origin}/api/v1/ai/providers/test-and-save`,
          { method: 'POST', headers: { 'content-type': 'application/json' } },
          (response) => {
            let text = '';
            response.setEncoding('utf8');
            response.on('data', (chunk: string) => {
              text += chunk;
            });
            response.on('end', () => {
              try {
                resolve({ status: response.statusCode ?? 0, body: JSON.parse(text) });
              } catch (error) {
                reject(error);
              }
            });
            response.on('error', reject);
          },
        );
        client.setTimeout(650000, () => client.destroy(new Error('隔离 API 等待超过 650 秒')));
        client.on('error', reject);
        client.end(JSON.stringify(operation));
      });
      const elapsedMs = performance.now() - startedMono;
      expect(result.status).toBe(400);
      expect(result.body).toMatchObject({ message: expect.stringContaining('预算') });
      await Promise.race([
        closed.promise,
        delay(5000).then(() => {
          throw new Error('期限到达后上游未断开');
        }),
      ]);
      expect(elapsedMs).toBeGreaterThanOrEqual(594000);
      expect(elapsedMs).toBeLessThan(610000);
      expect(requests).toHaveLength(2);
      expect(
        requests.every(
          (r) => r.path === '/v1/chat/completions' && r.stream && r.format === 'json_schema',
        ),
      ).toBe(true);
      expect(generate).toHaveBeenCalledTimes(2);
      const decisions = generate.mock.calls.map(([request]) => request.timeoutDecision!);
      const [first, second] = decisions;
      if (!first || !second) throw new Error('必须观察到两个用途的 SDK 截止决策');
      expect(first.taskDeadlineAt).toBe(second.taskDeadlineAt);
      expect(first.policy).toMatchObject({ taskBudgetMs: 600000, cleanupReserveMs: 5000 });
      expect(second.resolvedAt - first.resolvedAt).toBeGreaterThanOrEqual(900);
      expect(second.executionDeadlineAt).toBe(first.taskDeadlineAt - 5000);
      expect(save).not.toHaveBeenCalled();
      expect(blocked).toEqual([]);
      expect(await stack.configs.findStored(input.name)).toEqual(before);
      expect(await stack.prisma.aiRoutingSettings.findUnique({ where: { id: 'global' } })).toEqual(
        beforeDefault,
      );
      expect(await stack.prisma.aiRun.count()).toBe(0);
      expect(await stack.prisma.aiToolCall.count()).toBe(0);
      const audits = await stack.prisma.providerHealthCheck.findMany({
        where: { details: { path: ['operationId'], equals: operationId } },
        orderBy: { checkedAt: 'asc' },
      });
      expect(audits).toHaveLength(4);
      expect(audits[1]).toMatchObject({
        errorCode: null,
        details: {
          status: 'passed',
          usage: { status: 'reported', inputTokens: 12, outputTokens: 9 },
        },
      });
      expect(audits[3]).toMatchObject({
        errorCode: 'task_budget_exhausted',
        details: {
          status: 'failed',
          usage: { status: 'unknown', inputTokens: null, outputTokens: null },
        },
      });
      const evidence = process.env.T6_DEADLINE_EVIDENCE_PATH;
      if (evidence)
        writeFileSync(
          evidence,
          JSON.stringify(
            {
              startedAt,
              completedAt: new Date().toISOString(),
              elapsedMs,
              operationId,
              plan: plan.body,
              result,
              requests,
              decisions,
              audits,
              blocked,
              realModelCalls: 0,
              cost: { amount: '0', currency: 'USD', source: '本机假上游' },
              checks: {
                sharedDeadline: true,
                realTimers: true,
                fullExecutionBudgetElapsed: true,
                originalConfigurationAndDefaultPreserved: true,
                noSave: true,
                completedUsagePreserved: true,
                interruptedUsageUnknown: true,
                timeoutNotCancellation: true,
                upstreamDisconnected: true,
              },
            },
            null,
            2,
          ) + '\n',
        );
    } finally {
      for (const response of responses) response.destroy();
      upstream.closeAllConnections();
      upstream.close();
      await once(upstream, 'close');
    }
  }, 650000);
});
