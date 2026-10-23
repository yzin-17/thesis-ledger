import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { aiExecutionSummarySchema } from '@thesis-ledger/schemas';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { assertIsolated, databaseUrl } from './ai-provider-postgres.fixture.js';
import {
  controlledAccess,
  createResearchExecutionV2Harness,
  prepareUnsentResearchV2,
} from './research-execution-v2.fixture.js';

describe.skipIf(!databaseUrl)('研究 V2：取消、租约与请求结算', () => {
  let prisma: PrismaClient;
  let harness: Awaited<ReturnType<typeof createResearchExecutionV2Harness>>;
  const owner = randomUUID();
  const stored = async (id: string) => {
    const run = await prisma.aiRun.findUniqueOrThrow({ where: { id } });
    const execution = aiExecutionSummarySchema.parse(
      (run.modelMetadata as Record<string, unknown>).sdkExecution,
    );
    return { run, execution };
  };
  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: databaseUrl ?? '' });
    await assertIsolated(prisma);
    harness = await createResearchExecutionV2Harness(prisma);
  });
  beforeEach(async () => {
    await prisma.aiToolCall.deleteMany();
    await prisma.aiRun.deleteMany();
    await prisma.aiRoutingSettings.deleteMany();
    vi.stubEnv('AI_RESEARCH_V2_WRITES_ENABLED', 'true');
    harness.setMode('valid');
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    if (harness) {
      await harness.close();
      await prisma.aiToolCall.deleteMany();
      await prisma.aiRun.deleteMany();
    }
    await prisma?.$disconnect();
  });

  it('发送后取消与晚到结果竞争，只保留一次取消和未知请求事实', async () => {
    harness.setMode('hold');
    const saved = await harness.seed(owner);
    const running = harness.execute(saved.run.id);
    await harness.received();
    await expect(
      harness.runs.cancelResearchSubmissionV2(randomUUID(), saved.frozen.request, controlledAccess),
    ).rejects.toMatchObject({ status: 404 });
    const cancelled = await harness.runs.cancelResearchSubmissionV2(
      owner,
      saved.frozen.request,
      controlledAccess,
    );
    const repeated = await harness.runs.cancelResearchSubmissionV2(
      owner,
      saved.frozen.request,
      controlledAccess,
    );
    expect(repeated).toEqual(cancelled);
    harness.release();
    await running;
    const { run, execution } = await stored(saved.run.id);
    expect(run).toMatchObject({
      status: 'cancelled',
      result: null,
      inputTokens: 0,
      outputTokens: 0,
    });
    expect(execution).toMatchObject({
      usageCompleteness: 'unknown',
      continuationBlockedReason: 'cancelled',
      requests: [{ state: 'unknown', settledRevision: 0, usageRevisions: [] }],
    });
    expect(harness.requests).toHaveLength(1);
  });

  it('租约丢失后不重放已发送请求，晚到成功不能覆盖未知终态', async () => {
    harness.setMode('hold');
    const saved = await harness.seed(owner);
    const running = harness.execute(saved.run.id);
    await harness.received();
    await prisma.aiRun.update({
      where: { id: saved.run.id },
      data: { leaseUntil: new Date(Date.now() - 1_000) },
    });
    await harness.runs.recoverStaleRuns();
    harness.release();
    await running;
    await harness.execute(saved.run.id);
    const { run, execution } = await stored(saved.run.id);
    expect(run).toMatchObject({
      status: 'failed',
      errorCode: 'research_unknown_outcome',
      result: null,
    });
    expect(execution.requests[0]?.settledRevision).toBe(0);
    expect(harness.requests).toHaveLength(1);
  });

  it('未发送的预留恢复后复用原请求身份，不重复预留或结算', async () => {
    const saved = await harness.seed(owner);
    const { claimed, requestId } = await prepareUnsentResearchV2(prisma, harness, saved.run.id);
    await prisma.aiRun.update({
      where: { id: claimed.id },
      data: { leaseUntil: new Date(Date.now() - 1_000) },
    });
    await harness.runs.recoverStaleRuns();
    await harness.execute(claimed.id);
    const { run, execution } = await stored(claimed.id);
    expect(run).toMatchObject({ status: 'succeeded', executionAttempt: 2 });
    expect(execution.requests).toHaveLength(1);
    expect(execution.requests[0]).toMatchObject({
      requestId,
      dispatchExecutionAttempt: 2,
      settledRevision: 1,
    });
    expect(harness.requests).toHaveLength(1);
    const settled = execution.requests[0]!;
    const replay = await harness.state.completeAndSettle({
      runId: run.id,
      executionAttempt: 2,
      requestId,
      revision: settled.usageRevisions[0],
      outcome: settled.outcome,
      result: run.result,
    });
    expect(replay).toMatchObject({ applied: false, idempotent: true });
    expect((await stored(run.id)).execution).toEqual(execution);
  });

  it.each(['queued', 'prepared'] as const)('取消尚未发送的 %s 不产生模型请求', async (stage) => {
    const saved = await harness.seed(owner);
    if (stage === 'prepared') await prepareUnsentResearchV2(prisma, harness, saved.run.id);
    await harness.runs.cancelResearchSubmissionV2(owner, saved.frozen.request, controlledAccess);
    await harness.execute(saved.run.id);
    const { run, execution } = await stored(saved.run.id);
    expect(run).toMatchObject({ status: 'cancelled', result: null });
    expect(harness.requests).toHaveLength(0);
    expect(execution.requests).toHaveLength(stage === 'prepared' ? 1 : 0);
    if (stage === 'prepared')
      expect(execution.requests[0]).toMatchObject({
        state: 'prepared',
        error: { externalResult: 'not_sent', code: 'cancelled' },
        settledRevision: 0,
        usageRevisions: [],
      });
  });

  it('同进程取消会中止进行中的 SDK 传输并保持已保存终态', async () => {
    harness.setMode('hold');
    const saved = await harness.seed(owner);
    const running = harness.execute(saved.run.id);
    await harness.received();
    await harness.runs.cancelResearchSubmissionV2(owner, saved.frozen.request, controlledAccess);
    harness.cancelActive(saved.run.id);
    await running;
    harness.release();
    const { run, execution } = await stored(saved.run.id);
    expect(run).toMatchObject({ status: 'cancelled', result: null });
    expect(execution.requests[0]).toMatchObject({
      state: 'unknown',
      settledRevision: 0,
      usageRevisions: [],
    });
    expect(harness.requests).toHaveLength(1);
  });
});
