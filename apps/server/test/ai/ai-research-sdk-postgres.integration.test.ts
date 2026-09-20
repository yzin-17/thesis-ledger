import { createServer, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import { PrismaClient, type Prisma } from '@prisma/client';
import { aiGenerationContracts, type AiExecutionSummary } from '@thesis-ledger/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AiExecutionStateStore } from '../../src/ai/ai-execution-state.store.js';
import { AiResearchSdkExecution } from '../../src/ai/ai-research-sdk-execution.js';
import { AiSdkGenerationAdapter } from '../../src/ai/ai-sdk-generation.adapter.js';

const databaseUrl = process.env.AI_EXECUTION_DATABASE_URL;
const postgresDescribe = databaseUrl ? describe : describe.skip;

const writeSse = (response: ServerResponse) => {
  const content = JSON.stringify({
    conclusion: 'PostgreSQL 纵向研究结果',
    evidence: [],
    risks: [],
    unknowns: [],
    disclaimer: 'test',
    signals: [],
  });
  const common = {
    id: 'research-postgres-fixture',
    object: 'chat.completion.chunk',
    created: 1,
    model: 'fixture-model',
  };
  response.writeHead(200, { 'content-type': 'text/event-stream' });
  response.write(
    `data: ${JSON.stringify({
      ...common,
      choices: [{ index: 0, delta: { content }, finish_reason: null }],
    })}\n\n`,
  );
  response.write(
    `data: ${JSON.stringify({
      ...common,
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
    })}\n\n`,
  );
  response.write(
    `data: ${JSON.stringify({
      ...common,
      choices: [],
      usage: { prompt_tokens: 8, completion_tokens: 5, total_tokens: 13 },
    })}\n\n`,
  );
  response.end('data: [DONE]\n\n');
};

postgresDescribe('Research SDK isolated PostgreSQL vertical', () => {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl ?? '' });
  const store = new AiExecutionStateStore(prisma as never);
  const runIds: string[] = [];
  let baseURL = '';
  let requestCount = 0;
  const server = createServer((_request, response) => {
    requestCount += 1;
    writeSse(response);
  });

  beforeAll(async () => {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('本地研究 Provider 启动失败');
    baseURL = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await prisma.aiRun.deleteMany({ where: { id: { in: runIds } } });
    await prisma.$disconnect();
    server.close();
    await once(server, 'close');
  });

  it('真实贯通 Registry 结果、SDK、请求事实和 AiRun 原子终态', async () => {
    const execution: AiExecutionSummary = {
      version: 'sdk-execution-v1',
      contract: aiGenerationContracts.research.ref,
      frozenPolicy: {
        version: 'research-policy-v1',
        maxAiCalls: 2,
        maxInputTokens: 100_000,
        maxOutputTokens: 20_000,
        maxDurationSeconds: 300,
        maxCost: '0',
        costCurrency: null,
        paidRoutes: [],
      },
      deadlineAt: new Date(Date.now() + 60_000).toISOString(),
      generationStatus: 'pending',
      usageCompleteness: 'unknown',
      requests: [],
      continuationBlockedReason: null,
    };
    const run = await prisma.aiRun.create({
      data: {
        provider: 'fixture',
        model: 'fixture-model',
        promptVersion: 'research-v1',
        status: 'running',
        executionAttempt: 1,
        startedAt: new Date(),
        claimedAt: new Date(),
        leaseUntil: new Date(Date.now() + 60_000),
        modelMetadata: {
          sdkExecution: execution,
          researchRoutes: [
            {
              provider: 'fixture',
              model: 'fixture-model',
              configurationFingerprint: 'fixture-fingerprint',
            },
          ],
        } as Prisma.InputJsonValue,
      },
    });
    runIds.push(run.id);
    const provider = {
      id: 'fixture',
      models: ['fixture-model'],
      metadata: { health: 'healthy' as const },
      sdkRuntime: () => ({ baseURL: `${baseURL}/v1`, apiKey: 'secret', timeoutMs: 2_000 }),
    };
    const registry = {
      defaultModel: () => 'fixture-model',
      readyContractCandidates: () => [
        {
          provider,
          execution: {
            adapter: 'openai-compatible' as const,
            mode: 'json_validated' as const,
            allowedUpstreams: [],
            freeEvidenceRef: 'postgres-fixture-free',
            readiness: { configurationFingerprint: 'fixture-fingerprint' },
          },
        },
      ],
    };
    const service = new AiResearchSdkExecution(
      registry as never,
      new AiSdkGenerationAdapter(),
      store,
    );

    await service.execute({
      ownership: { runId: run.id, executionAttempt: 1 },
      run,
      messages: [{ role: 'user', content: 'Return research JSON.' }],
      startedAt: Date.now(),
      signal: new AbortController().signal,
      buildResult: (output, selectedProvider) => ({ ...output, provider: selectedProvider }),
    });

    const stored = await prisma.aiRun.findUniqueOrThrow({ where: { id: run.id } });
    const saved = (stored.modelMetadata as Record<string, unknown>).sdkExecution as AiExecutionSummary;
    expect(requestCount).toBe(1);
    expect(stored).toMatchObject({
      status: 'succeeded',
      provider: 'fixture',
      model: 'fixture-model',
      inputTokens: 8,
      outputTokens: 5,
    });
    expect(saved).toMatchObject({ generationStatus: 'complete', usageCompleteness: 'reported' });
    expect(saved.requests).toHaveLength(1);
    expect(saved.requests[0]).toMatchObject({
      state: 'completed',
      settledRevision: 1,
      reservation: { provider: 'fixture', model: 'fixture-model' },
    });
  });
});
