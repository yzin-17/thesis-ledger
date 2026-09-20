import { randomUUID } from 'node:crypto';
import { PrismaClient, type Prisma } from '@prisma/client';
import { aiGenerationContracts, type AiExecutionSummary } from '@thesis-ledger/schemas';
import { afterAll, describe, expect, it } from 'vitest';
import { AiExecutionStateStore } from '../../src/ai/ai-execution-state.store.js';
import { AiRunService } from '../../src/ai/ai-run.service.js';

const databaseUrl = process.env.AI_EXECUTION_DATABASE_URL;
const postgresDescribe = databaseUrl ? describe : describe.skip;

const execution = (): AiExecutionSummary => ({
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
});

const reservation = {
  aiCalls: 1 as const,
  inputTokens: 10,
  outputTokens: 10,
  cost: {
    status: 'unknown' as const,
    amount: null,
    currency: null,
    source: 'free_evidence:postgres-fixture',
    pricingVersion: null,
  },
  provider: 'fixture',
  model: 'fixture-model',
  configurationFingerprint: 'fixture-fingerprint',
};

postgresDescribe('Research recovery isolated PostgreSQL', () => {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl ?? '' });
  const store = new AiExecutionStateStore(prisma as never);
  const runs = new AiRunService(prisma as never);
  const runIds: string[] = [];

  const createRunning = async (withExecution = true) => {
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
        ...(withExecution
          ? { modelMetadata: { sdkExecution: execution() } as Prisma.InputJsonValue }
          : {}),
      },
    });
    runIds.push(run.id);
    return run.id;
  };

  afterAll(async () => {
    await prisma.aiRun.deleteMany({ where: { id: { in: runIds } } });
    await prisma.$disconnect();
  });

  it('只恢复未发送的 prepared 请求，并用新领取代次阻断旧 Worker', async () => {
    const runId = await createRunning();
    const requestId = randomUUID();
    await store.prepareRequest({ runId, executionAttempt: 1, requestId, reservation });
    await prisma.aiRun.update({
      where: { id: runId },
      data: { leaseUntil: new Date(Date.now() - 1_000) },
    });

    await runs.recoverStaleRuns();
    expect(await prisma.aiRun.findUniqueOrThrow({ where: { id: runId } })).toMatchObject({
      status: 'queued',
      errorCode: 'research_lease_recovered',
    });
    const claimed = await runs.claim(runId);
    expect(claimed).toMatchObject({ executionAttempt: 2, status: 'running' });
    await expect(
      store.authorizeDispatch({ runId, executionAttempt: 1 }, requestId),
    ).resolves.toBe(false);
    await expect(
      store.authorizeDispatch({ runId, executionAttempt: 2 }, requestId),
    ).resolves.toBe(true);
  });

  it('发送授权后的失租收敛为 unknown，禁止自动重排和旧 Worker 晚到提交', async () => {
    const runId = await createRunning();
    const requestId = randomUUID();
    await store.prepareRequest({ runId, executionAttempt: 1, requestId, reservation });
    await store.authorizeDispatch({ runId, executionAttempt: 1 }, requestId);
    await prisma.aiRun.update({
      where: { id: runId },
      data: { leaseUntil: new Date(Date.now() - 1_000) },
    });

    await runs.recoverStaleRuns();
    expect(await prisma.aiRun.findUniqueOrThrow({ where: { id: runId } })).toMatchObject({
      status: 'failed',
      errorCode: 'research_unknown_outcome',
    });
    await expect(
      store.completeAndSettle({
        runId,
        executionAttempt: 1,
        requestId,
        revision: {
          revision: 1,
          usage: { status: 'reported', inputTokens: 1, outputTokens: 1 },
          cost: {
            status: 'unknown',
            amount: null,
            currency: null,
            source: 'free_evidence:postgres-fixture',
            pricingVersion: null,
          },
          recordedAt: new Date().toISOString(),
        },
        outcome: {
          status: 'complete',
          finishReason: 'stop',
          contract: aiGenerationContracts.research.ref,
          schemaAccepted: true,
        },
        result: { late: true },
      }),
    ).resolves.toBeNull();
  });

  it('仅允许已确认生成前拒绝在剩余额度内恢复一次 fallback', async () => {
    const runId = await createRunning();
    const requestId = randomUUID();
    await store.prepareRequest({ runId, executionAttempt: 1, requestId, reservation });
    await store.authorizeDispatch({ runId, executionAttempt: 1 }, requestId);
    await store.completeAndSettle({
      runId,
      executionAttempt: 1,
      requestId,
      revision: {
        revision: 1,
        usage: { status: 'unknown', inputTokens: null, outputTokens: null },
        cost: reservation.cost,
        recordedAt: new Date().toISOString(),
      },
      outcome: {
        status: 'incomplete',
        finishReason: 'provider_rejected',
        contract: aiGenerationContracts.research.ref,
        schemaAccepted: false,
      },
      error: {
        code: 'provider_rejected',
        phase: 'request',
        summary: '生成前容量拒绝',
        externalResult: 'rejected_before_generation',
        requestId,
        retryAfterMs: 0,
      },
    });
    await prisma.aiRun.update({
      where: { id: runId },
      data: { leaseUntil: new Date(Date.now() - 1_000) },
    });

    await runs.recoverStaleRuns();
    expect(await prisma.aiRun.findUniqueOrThrow({ where: { id: runId } })).toMatchObject({
      status: 'queued',
      errorCode: 'research_lease_recovered',
    });
  });

  it('历史 Research running 缺少发送证据时保守收敛，不沿用旧三次重试', async () => {
    const runId = await createRunning(false);
    await prisma.aiRun.update({
      where: { id: runId },
      data: { leaseUntil: new Date(Date.now() - 1_000) },
    });
    await runs.recoverStaleRuns();
    expect(await prisma.aiRun.findUniqueOrThrow({ where: { id: runId } })).toMatchObject({
      status: 'failed',
      errorCode: 'research_unknown_outcome',
      executionAttempt: 1,
    });
  });
});
