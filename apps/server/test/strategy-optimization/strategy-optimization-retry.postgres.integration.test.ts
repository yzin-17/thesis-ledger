import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../src/platform/prisma.service.js';
import { requestOptimizationRetry } from '../../src/strategy-optimization/strategy-optimization-retry.js';
import { StrategyOptimizationService } from '../../src/strategy-optimization/strategy-optimization.service.js';
import { StrategyOptimizationRunService } from '../../src/strategy-optimization/strategy-optimization-run.service.js';
import { StrategyOptimizationCandidateService } from '../../src/strategy-optimization/strategy-optimization-candidate.service.js';
import type { ExperimentRow } from '../../src/strategy-optimization/strategy-optimization-common.js';
import { createStrategyFixture } from './strategy-optimization-postgres-fixtures.js';

const isolated = process.env.RUN_STRATEGY_CENTER_T06_POSTGRES === '1' ? describe : describe.skip;
isolated('原实验人工重试的 PostgreSQL 状态机', () => {
  const context = optimizationRetryContext();
  registerRetryIdentityAndContinuation(context);
  registerRetryExhaustionAndTerminalStates(context);
});

function optimizationRetryContext() {
  const prisma = new PrismaService();
  const ids: string[] = [];
  const strategyId = randomUUID(),
    versionId = randomUUID();
  const strategy = createStrategyFixture('600519.SH', 'manual-retry')('0.05');
  const budget = {
    maxAiCalls: 10,
    maxBacktestRuns: 30,
    maxInputTokens: 10000,
    maxOutputTokens: 10000,
    maxDurationSeconds: 600,
  };
  const read = async (id: string) =>
    (
      await prisma.$queryRaw<ExperimentRow[]>(Prisma.sql`
    SELECT * FROM "OptimizationExperiment" WHERE "id"=${id}::uuid
  `)
    )[0]!;
  const create = async () => {
    const id = randomUUID(),
      oldId = randomUUID();
    ids.push(id);
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "OptimizationExperiment" ("id", "baselineStrategyVersionId", "status", "stage",
        "objective", "allowedParameterIds", "split", "runConfig", "dataFingerprint", "modelConfig",
        "budget", "maxRounds", "idempotencyKey", "executionAttempt", "stopReason", "aiCallsUsed",
        "backtestRunsUsed", "inputTokensUsed", "outputTokensUsed", "baselineRunRefs", "createdAt", "updatedAt")
      VALUES (${id}::uuid, ${versionId}::uuid, 'failed', 'failed', '{"mode":"balanced","minClosedTrades":0}',
        '[]', '{"test":{"start":"2026-01-01","end":"2026-01-31"}}', '{}', 'controlled',
        '[{"provider":"fixture","model":"model"}]', ${JSON.stringify(budget)}::jsonb, 1, ${id}, 1,
        'model_generation_failed', 1, 2, 100, 20, ${JSON.stringify({ development: randomUUID(), validation: randomUUID() })}::jsonb,
        CURRENT_TIMESTAMP-INTERVAL '2 hours', CURRENT_TIMESTAMP-INTERVAL '115 minutes')
    `);
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "OptimizationAttempt" ("id", "experimentId", "modelKey", "attempt", "status", "error")
      VALUES (${oldId}::uuid, ${id}::uuid, 'fixture:model', 1, 'unknown_outcome', '受控连接超时')
    `);
    return {
      id,
      oldId,
      input: { idempotencyKey: randomUUID(), expectedExecutionAttempt: 1 },
    };
  };
  beforeAll(async () => {
    await prisma.$connect();
    await prisma.strategy.create({
      data: { id: strategyId, name: '原地重试隔离样本', schemaVersion: 2 },
    });
    await prisma.strategyVersion.create({
      data: {
        id: versionId,
        strategyId,
        version: 1,
        schemaVersion: 2,
        schema: strategy,
      },
    });
  });
  afterAll(async () => {
    if (ids.length) {
      await prisma.$executeRaw(
        Prisma.sql`DELETE FROM "OptimizationCandidate" WHERE "experimentId" IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})`,
      );
      await prisma.$executeRaw(
        Prisma.sql`DELETE FROM "OptimizationAttempt" WHERE "experimentId" IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})`,
      );
      await prisma.$executeRaw(
        Prisma.sql`DELETE FROM "OptimizationExperiment" WHERE "id" IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})`,
      );
    }
    await prisma.strategyVersion.deleteMany({ where: { strategyId } });
    await prisma.strategy.deleteMany({ where: { id: strategyId } });
    await prisma.$disconnect();
  });
  return {
    get prisma() {
      return prisma;
    },
    get ids() {
      return ids;
    },
    get strategyId() {
      return strategyId;
    },
    get versionId() {
      return versionId;
    },
    get strategy() {
      return strategy;
    },
    get budget() {
      return budget;
    },
    get read() {
      return read;
    },
    get create() {
      return create;
    },
  };
}

function registerRetryIdentityAndContinuation(
  context: ReturnType<typeof optimizationRetryContext>,
) {
  it('并发和丢失响应幂等受理，原身份、失败审计、未知事实、基线和累计用量保留', async () => {
    const { prisma, read, create } = context;

    const { id, oldId, input } = await create(),
      before = await read(id);
    expect(before.retryState).toEqual({});
    const results = await Promise.all([
      requestOptimizationRetry(prisma, id, input),
      requestOptimizationRetry(prisma, id, input),
    ]);
    expect(results.filter((result) => result.accepted)).toHaveLength(1);
    const after = await read(id);
    expect(after).toMatchObject({
      id,
      status: 'queued',
      stage: 'preparing',
      executionAttempt: 2,
      aiCallsUsed: 1,
      backtestRunsUsed: 2,
      inputTokensUsed: 100,
      outputTokensUsed: 20,
      baselineRunRefs: before.baselineRunRefs,
      budget: before.budget,
    });
    expect(after.pausedDurationMs).toBeGreaterThan(114 * 60000);
    expect(after.retryState).toMatchObject({
      roundOffset: 1,
      allowedUnknownAttemptIds: [oldId],
      history: [
        {
          executionAttempt: 1,
          stopReason: 'model_generation_failed',
          idempotencyKey: input.idempotencyKey,
        },
      ],
    });
    expect(
      await prisma.$queryRaw(
        Prisma.sql`SELECT "status", "error" FROM "OptimizationAttempt" WHERE "id"=${oldId}::uuid`,
      ),
    ).toEqual([{ status: 'unknown_outcome', error: '受控连接超时' }]);
    await expect(
      requestOptimizationRetry(prisma, id, {
        ...input,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toThrow();
    await expect(
      requestOptimizationRetry(prisma, id, {
        ...input,
        expectedExecutionAttempt: 99,
      }),
    ).rejects.toThrow();
    expect((await read(id)).retryState).toEqual(after.retryState);
  });
  it('仅人工明确记录的旧未知请求可继续，新出现的未知结果仍阻断自动请求', async () => {
    const { prisma, read, create } = context;

    const { id, input } = await create();
    const candidates = new StrategyOptimizationCandidateService(prisma, {} as never, {} as never);
    const guard = candidates as unknown as {
      assertNoUnknownOutcome(e: ExperimentRow, key: string): Promise<void>;
    };
    await expect(guard.assertNoUnknownOutcome(await read(id), 'fixture:model')).rejects.toThrow(
      'unknown_outcome',
    );
    await requestOptimizationRetry(prisma, id, input);
    await expect(
      guard.assertNoUnknownOutcome(await read(id), 'fixture:model'),
    ).resolves.toBeUndefined();
    await prisma.$executeRaw(Prisma.sql`INSERT INTO "OptimizationAttempt" ("experimentId","modelKey","attempt","status")
      VALUES (${id}::uuid,'fixture:model',2,'unknown_outcome')`);
    await expect(guard.assertNoUnknownOutcome(await read(id), 'fixture:model')).rejects.toThrow(
      '第 2 轮',
    );
  });
  it('保留原实验从新轮次走完自动封存测试，重复同请求不产生新模型调用', async () => {
    const { prisma, versionId, read, create } = context;

    const { id, input } = await create();
    const accounting = new StrategyOptimizationRunService(prisma, {} as never);
    const baseline = (await read(id)).baselineRunRefs;
    const runs = {
      assertFrozenResearchBudget: vi.fn(),
      recordBaseline: vi.fn(),
      executeRun: vi.fn(async (e: ExperimentRow) => {
        await accounting.reserveBudget(e.id, {
          backtestRuns: 1,
          executionAttempt: e.executionAttempt,
        });
        return { id: randomUUID() };
      }),
      dataArtifactFingerprint: vi.fn(async () => 'frozen'),
      evaluateResult: (run: { id: string }) => ({
        runId: run.id,
        status: 'valid',
        tradeCount: 3,
        score: 1,
      }),
    };
    const candidates = {
      generateProposal: vi.fn(
        async (e: ExperimentRow, _b: unknown, _d: unknown, _r: unknown, round: number) => {
          await accounting.reserveBudget(e.id, {
            aiCalls: 1,
            executionAttempt: e.executionAttempt,
          });
          await prisma.$executeRaw(Prisma.sql`INSERT INTO "OptimizationAttempt" ("experimentId","modelKey","attempt","status")
          VALUES (${id}::uuid,'fixture:model',${round},'succeeded')`);
          return { proposal: {} };
        },
      ),
      createAndEvaluateCandidate: vi.fn(async () => {
        await prisma.$executeRaw(Prisma.sql`INSERT INTO "OptimizationCandidate" ("experimentId","candidateNumber","modelKey",
          "candidateStrategyVersionId","executionHash","proposal","diff","validationStatus","metrics")
          VALUES (${id}::uuid,1,'fixture:model',${versionId}::uuid,${id},'{}','[]','valid','{"validation":{"score":1}}')`);
      }),
      recordAttempt: vi.fn(),
    };
    const reads = {
      experiment: read,
      compare: async () => ({ experiment: await read(id) }),
    };
    const service = new StrategyOptimizationService(
      prisma,
      {} as never,
      candidates as never,
      reads as never,
      runs as never,
      {} as never,
    );
    await service.retry(id, input);
    await vi.waitFor(async () => expect((await read(id)).status).toBe('succeeded'), {
      timeout: 5000,
    });
    const finished = await read(id);
    expect(finished).toMatchObject({
      id,
      stage: 'completed',
      aiCallsUsed: 2,
      backtestRunsUsed: 4,
      selectedCandidateId: null,
    });
    expect(finished.baselineRunRefs).toMatchObject(baseline as object);
    expect(finished.exposure).toMatchObject({ testRevealed: true });
    expect(candidates.generateProposal.mock.calls[0]?.[4]).toBe(2);
    expect(runs.recordBaseline).not.toHaveBeenCalled();
    await service.retry(id, input);
    expect(candidates.generateProposal).toHaveBeenCalledOnce();
  });
}

function registerRetryExhaustionAndTerminalStates(
  context: ReturnType<typeof optimizationRetryContext>,
) {
  it('预算、总时长耗尽或模型仍在执行时拒绝，保持失败记录不变', async () => {
    const { prisma, read, create } = context;

    for (const update of [
      Prisma.sql`"aiCallsUsed"=10`,
      Prisma.sql`"backtestRunsUsed"=30`,
      Prisma.sql`"inputTokensUsed"=10000`,
      Prisma.sql`"outputTokensUsed"=10000`,
      Prisma.sql`"costUsed"=1, "budget"="budget"||'{"maxCost":"1"}'::jsonb`,
      Prisma.sql`"updatedAt"="createdAt"+INTERVAL '11 minutes'`,
    ]) {
      const { id, input } = await create();
      await prisma.$executeRaw(
        Prisma.sql`UPDATE "OptimizationExperiment" SET ${update} WHERE "id"=${id}::uuid`,
      );
      await expect(requestOptimizationRetry(prisma, id, input)).rejects.toThrow(/耗尽/);
      expect((await read(id)).retryState).toEqual({});
    }
    const { id, input } = await create();
    await prisma.$executeRaw(
      Prisma.sql`UPDATE "OptimizationAttempt" SET "status"='running' WHERE "experimentId"=${id}::uuid`,
    );
    await expect(requestOptimizationRetry(prisma, id, input)).rejects.toThrow('尚未停止');
    await prisma.$executeRaw(
      Prisma.sql`UPDATE "OptimizationAttempt" SET "leaseUntil"=CURRENT_TIMESTAMP-INTERVAL '1 second' WHERE "experimentId"=${id}::uuid`,
    );
    await expect(requestOptimizationRetry(prisma, id, input)).resolves.toEqual({ accepted: true });
    expect(
      await prisma.$queryRaw(
        Prisma.sql`SELECT "status" FROM "OptimizationAttempt" WHERE "experimentId"=${id}::uuid`,
      ),
    ).toEqual([{ status: 'unknown_outcome' }]);
  });
  it('活动、取消、成功、已锁定及旧 attempt 均不能通过重试改写当前状态', async () => {
    const { prisma, read, create } = context;

    for (const status of ['running', 'cancelled', 'succeeded', 'testing']) {
      const { id, input } = await create();
      await prisma.$executeRaw(
        Prisma.sql`UPDATE "OptimizationExperiment" SET "status"=${status} WHERE "id"=${id}::uuid`,
      );
      await expect(requestOptimizationRetry(prisma, id, input)).rejects.toThrow();
      expect((await read(id)).status).toBe(status);
    }
    const locked = await create();
    await prisma.$executeRaw(
      Prisma.sql`UPDATE "OptimizationExperiment" SET "lockedCandidateIds"=${JSON.stringify([randomUUID()])}::jsonb WHERE "id"=${locked.id}::uuid`,
    );
    await expect(requestOptimizationRetry(prisma, locked.id, locked.input)).rejects.toThrow(
      '封存测试已锁定',
    );
    const { id, input } = await create(),
      before = await read(id);
    await requestOptimizationRetry(prisma, id, input);
    await prisma.$executeRaw(
      Prisma.sql`UPDATE "OptimizationExperiment" SET "status"='running', "executionAttempt"=3 WHERE "id"=${id}::uuid`,
    );
    const service = new StrategyOptimizationService(
      prisma,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const internals = service as unknown as {
      fail(id: string, reason: string, attempt: number): Promise<void>;
      setStage(e: ExperimentRow, stage: string): Promise<void>;
    };
    await internals.fail(id, 'late failure', 1);
    await expect(internals.setStage(before, 'proposing')).rejects.toThrow('接管');
    const runs = new StrategyOptimizationRunService(prisma, {} as never);
    await expect(runs.reserveBudget(id, { aiCalls: 1, executionAttempt: 1 })).rejects.toThrow();
    expect(await read(id)).toMatchObject({
      status: 'running',
      stage: 'preparing',
      executionAttempt: 3,
      aiCallsUsed: 1,
      stopReason: null,
    });
  });
}
