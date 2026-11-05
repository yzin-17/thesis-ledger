import { randomUUID } from 'node:crypto';
import { setTimeout as wait } from 'node:timers/promises';
import { PrismaClient, type Prisma } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  aiGenerationContracts,
  DEFAULT_AI_RESEARCH_POLICY_V1,
  type AiExecutionSummary,
} from '@thesis-ledger/schemas';
import { AiRunService } from '../../src/ai/ai-run.service.js';
import { AiExecutionStateStore } from '../../src/ai/ai-execution-state.store.js';
import { queuedResearchClock } from '../../src/ai/timeout/ai-execution-clock.js';
import {
  createAiTimeoutPolicy,
  resolveAiExecutionTimeout,
} from '../../src/ai/timeout/ai-timeout-policy.js';
import { aiExecutionReadModel } from '../../src/ai/ai-execution-read-model.js';

const url = process.env.AI_EXECUTION_DATABASE_URL;
const suite = url ? describe : describe.skip;
suite('超时治理真实PostgreSQL状态', () => {
  const prisma = new PrismaClient({ datasourceUrl: url ?? '' });
  const runs = new AiRunService(prisma as never),
    store = new AiExecutionStateStore(prisma as never),
    ids: string[] = [];
  beforeAll(async () => {
    const value = new URL(url!);
    if (
      value.hostname !== '127.0.0.1' ||
      value.pathname !== '/ai_provider_concurrency_fixture' ||
      value.username !== 'fixture_owner'
    )
      throw new Error('只允许隔离超时数据库');
    expect(
      await prisma.$queryRaw`SELECT current_database() AS name, current_user AS owner`,
    ).toEqual([{ name: 'ai_provider_concurrency_fixture', owner: 'fixture_owner' }]);
  });
  afterAll(async () => {
    await prisma.aiRun.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });
  const create = async (running = false, duration = 600000) => {
    const deadlineAt = running ? new Date(Date.now() + duration).toISOString() : null;
    const execution: AiExecutionSummary = {
      version: 'sdk-execution-v1',
      contract: aiGenerationContracts.research.ref,
      frozenPolicy: DEFAULT_AI_RESEARCH_POLICY_V1,
      deadlineAt,
      generationStatus: 'pending',
      usageCompleteness: 'unknown',
      requests: [],
      continuationBlockedReason: null,
      timing: running
        ? {
            ...queuedResearchClock(DEFAULT_AI_RESEARCH_POLICY_V1, {}),
            origin: 'legacy_deadline',
            taskDeadlineAt: deadlineAt,
            policy: { ...createAiTimeoutPolicy('research'), cleanupReserveMs: 0 },
          }
        : queuedResearchClock(DEFAULT_AI_RESEARCH_POLICY_V1, {}),
    };
    const row = await prisma.aiRun.create({
      data: {
        provider: 'fixture',
        model: 'same-model',
        promptVersion: 'research-v1',
        status: running ? 'running' : 'queued',
        executionAttempt: running ? 1 : 0,
        ...(running ? { startedAt: new Date(), leaseUntil: new Date(Date.now() + 60000) } : {}),
        modelMetadata: { sdkExecution: execution } as Prisma.InputJsonValue,
      },
    });
    ids.push(row.id);
    return { row, execution };
  };
  it('并发首次领取只产生一个时钟，恢复不改变首次开始或截止', async () => {
    const { row } = await create();
    const result = await Promise.all([runs.claim(row.id), runs.claim(row.id)]);
    expect(result.filter(Boolean)).toHaveLength(1);
    const first = await prisma.aiRun.findUniqueOrThrow({ where: { id: row.id } });
    const clock = aiExecutionReadModel(first.modelMetadata)!.timing!;
    expect(Date.parse(clock.taskDeadlineAt!) - Date.parse(clock.firstStartedAt!)).toBe(600000);
    await prisma.aiRun.update({
      where: { id: row.id },
      data: { status: 'queued', leaseUntil: null, claimedAt: null },
    });
    const resumed = await runs.claim(row.id);
    expect(resumed?.startedAt).toEqual(first.startedAt);
    expect(aiExecutionReadModel(resumed?.modelMetadata)?.timing).toEqual(clock);
  });
  const reserve = async (id: string) => {
    const ownership = { runId: id, executionAttempt: 1 },
      requestId = randomUUID();
    await store.prepareRequest({
      ...ownership,
      requestId,
      reservation: {
        aiCalls: 1,
        inputTokens: 10,
        outputTokens: 10,
        cost: {
          status: 'estimated',
          amount: '0',
          currency: 'USD',
          source: 'fixture',
          pricingVersion: 'v1',
        },
      },
    });
    expect(await store.authorizeDispatch(ownership, requestId)).toBe(true);
    return { ownership, requestId };
  };
  it('安全策略快照原子保存并从正式读取投影返回，取消后拒绝补写', async () => {
    const { row, execution } = await create(true);
    const { ownership, requestId } = await reserve(row.id);
    const decision = resolveAiExecutionTimeout({
      policy: execution.timing!.policy,
      taskDeadlineAt: Date.parse(execution.deadlineAt!),
      transport: 'stream',
      firstOutput: { value: 240000, source: 'route' },
    });
    expect(await store.recordTimeoutDecision(ownership, requestId, decision)).toBe(true);
    const persisted = await prisma.aiRun.findUniqueOrThrow({ where: { id: row.id } });
    expect(aiExecutionReadModel(persisted.modelMetadata)?.requests[0]?.timeoutDecision).toEqual(
      decision,
    );
    await prisma.aiRun.update({ where: { id: row.id }, data: { status: 'cancelled' } });
    expect(await store.recordTimeoutDecision(ownership, requestId, decision)).toBe(false);
  });
  it('已收结果超过发布deadline不能成功，但已知完成与用量照实结算', async () => {
    const { row, execution } = await create(true, 500);
    const { ownership, requestId } = await reserve(row.id);
    await wait(550);
    await store.completeAndSettle({
      ...ownership,
      requestId,
      revision: {
        revision: 1,
        usage: { status: 'reported', inputTokens: 3, outputTokens: 4 },
        cost: {
          status: 'estimated',
          amount: '0',
          currency: 'USD',
          source: 'fixture',
          pricingVersion: 'v1',
        },
        recordedAt: new Date().toISOString(),
      },
      outcome: {
        status: 'complete',
        finishReason: 'stop',
        contract: aiGenerationContracts.research.ref,
        schemaAccepted: true,
      },
      result: { mustNotPublish: true },
      finalization: {
        provider: 'fixture',
        model: 'same-model',
        receivedAt: new Date(Date.parse(execution.deadlineAt!) - 10),
      },
    });
    const persisted = await prisma.aiRun.findUniqueOrThrow({ where: { id: row.id } });
    expect(persisted).toMatchObject({
      status: 'failed',
      errorCode: 'research_task_budget_exhausted',
      inputTokens: 3,
      outputTokens: 4,
      result: null,
    });
    expect(aiExecutionReadModel(persisted.modelMetadata)?.requests[0]?.outcome?.status).toBe(
      'complete',
    );
  });
});
