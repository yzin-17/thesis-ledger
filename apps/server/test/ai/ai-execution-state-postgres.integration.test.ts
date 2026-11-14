import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { aiGenerationContracts, type AiExecutionSummary } from '@thesis-ledger/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AiExecutionStateStore } from '../../src/ai/ai-execution-state.store.js';
import { AiRunService } from '../../src/ai/ai-run.service.js';
import { StrategyOptimizationAiSettlementStore } from '../../src/strategy-optimization/strategy-optimization-ai-settlement.store.js';

const databaseUrl = process.env.AI_EXECUTION_DATABASE_URL;
const postgresDescribe = databaseUrl ? describe : describe.skip;
const suffix = `ai-execution-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const execution = (): AiExecutionSummary => ({
  version: 'sdk-execution-v1',
  contract: aiGenerationContracts.research.ref,
  frozenPolicy: null,
  deadlineAt: new Date(Date.now() + 60_000).toISOString(),
  generationStatus: 'pending',
  usageCompleteness: 'unknown',
  requests: [],
  continuationBlockedReason: null,
});

const reservation = (cost: string | null = '1') => ({
  aiCalls: 1 as const,
  inputTokens: 10,
  outputTokens: 10,
  cost:
    cost === null
      ? {
          status: 'unknown' as const,
          amount: null,
          currency: null,
          source: null,
          pricingVersion: null,
        }
      : {
          status: 'estimated' as const,
          amount: cost,
          currency: 'USD',
          source: 'frozen-test-price',
          pricingVersion: 'test-v1',
        },
});

const outcome = {
  status: 'complete' as const,
  finishReason: 'stop',
  contract: aiGenerationContracts.research.ref,
  schemaAccepted: true,
};

const revision = (
  requestRevision: number,
  usage: {
    status: 'reported' | 'partial' | 'unknown';
    inputTokens: number | null;
    outputTokens: number | null;
  },
  cost: {
    status: 'known' | 'estimated' | 'unknown';
    amount: string | null;
    currency: string | null;
    source: string | null;
    pricingVersion: string | null;
  },
) => ({ revision: requestRevision, usage, cost, recordedAt: new Date().toISOString() });

postgresDescribe('AI execution state isolated PostgreSQL', () => {
  const suiteScope = executionFactContext();
  registerExecutionOwnershipAndLeaseCases(suiteScope);
  registerExecutionUnknownAndSettlementCases(suiteScope);
  registerExecutionCurrencyAndRevisionCases(suiteScope);
});

function executionFactContext() {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl ?? '' });
  const store = new AiExecutionStateStore(prisma as never);
  const optimizationSettlements = new StrategyOptimizationAiSettlementStore(store);
  const runs = new AiRunService(prisma as never);
  const runIds: string[] = [];
  let strategyId = '';
  let strategyVersionId = '';
  const experimentIds: string[] = [];
  const createRun = async (metadata: Record<string, unknown> = { legacyKey: 'preserve-me' }) => {
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
        modelMetadata: metadata as Prisma.InputJsonValue,
      },
    });
    runIds.push(run.id);
    await store.initialize({ runId: run.id, executionAttempt: 1 }, execution());
    return run.id;
  };
  const prepare = async (runId: string, requestId = randomUUID(), cost: string | null = '1') => {
    const prepared = await store.prepareRequest({
      runId,
      executionAttempt: 1,
      requestId,
      reservation: reservation(cost),
    });
    expect(prepared?.state).toBe('prepared');
    return requestId;
  };
  const createOptimization = async (runId: string, budget: Record<string, unknown>) => {
    const experimentId = randomUUID();
    const attemptId = randomUUID();
    experimentIds.push(experimentId);
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "OptimizationExperiment" (
        "id", "baselineStrategyVersionId", "status", "stage", "objective",
        "allowedParameterIds", "split", "runConfig", "dataFingerprint", "modelConfig",
        "budget", "maxRounds", "aiCallsUsed", "inputTokensUsed", "outputTokensUsed",
        "costUsed", "idempotencyKey"
      ) VALUES (
        ${experimentId}::uuid, ${strategyVersionId}::uuid, 'running', 'generation', '{}'::jsonb,
        '[]'::jsonb, '{}'::jsonb, '{}'::jsonb, ${suffix}, '[]'::jsonb,
        ${JSON.stringify(budget)}::jsonb, 1, 1, 10, 10, 1,
        ${`${suffix}-${experimentId}`}
      )
    `);
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "OptimizationAttempt" ("id", "experimentId", "modelKey", "aiRunId", "attempt", "status")
      VALUES (${attemptId}::uuid, ${experimentId}::uuid, 'fixture:model', ${runId}::uuid, 1, 'running')
    `);
    return { experimentId, attemptId };
  };
  beforeAll(async () => {
    const strategy = await prisma.strategy.create({
      data: { schemaVersion: 2, name: `AI execution ${suffix}` },
    });
    strategyId = strategy.id;
    const version = await prisma.strategyVersion.create({
      data: { strategyId, version: 1, schemaVersion: 2, schema: {} },
    });
    strategyVersionId = version.id;
  });
  afterAll(async () => {
    if (experimentIds.length > 0)
      await prisma.$executeRawUnsafe(
        `DELETE FROM "OptimizationAttempt" WHERE "experimentId" IN (${experimentIds.map((_, index) => `$${index + 1}::uuid`).join(',')})`,
        ...experimentIds,
      );
    if (experimentIds.length > 0)
      await prisma.$executeRawUnsafe(
        `DELETE FROM "OptimizationExperiment" WHERE "id" IN (${experimentIds.map((_, index) => `$${index + 1}::uuid`).join(',')})`,
        ...experimentIds,
      );
    await prisma.aiRun.deleteMany({ where: { id: { in: runIds } } });
    if (strategyVersionId)
      await prisma.strategyVersion.delete({ where: { id: strategyVersionId } });
    if (strategyId) await prisma.strategy.delete({ where: { id: strategyId } });
    await prisma.$disconnect();
  });
  return {
    get prisma() {
      return prisma;
    },
    get store() {
      return store;
    },
    get optimizationSettlements() {
      return optimizationSettlements;
    },
    get runs() {
      return runs;
    },
    get runIds() {
      return runIds;
    },
    get strategyId() {
      return strategyId;
    },
    set strategyId(value: typeof strategyId) {
      strategyId = value;
    },
    get strategyVersionId() {
      return strategyVersionId;
    },
    set strategyVersionId(value: typeof strategyVersionId) {
      strategyVersionId = value;
    },
    get experimentIds() {
      return experimentIds;
    },
    get createRun() {
      return createRun;
    },
    get prepare() {
      return prepare;
    },
    get createOptimization() {
      return createOptimization;
    },
  };
}
function registerExecutionOwnershipAndLeaseCases(
  suiteScope: ReturnType<typeof executionFactContext>,
) {
  it('serializes double dispatch authorization and preserves concurrent JSON metadata', async () => {
    const runId = await suiteScope.createRun();
    const firstId = await suiteScope.prepare(runId);
    const [first, second] = await Promise.all([
      suiteScope.store.authorizeDispatch({ runId, executionAttempt: 1 }, firstId),
      suiteScope.store.authorizeDispatch({ runId, executionAttempt: 1 }, firstId),
    ]);
    expect([first, second].filter(Boolean)).toHaveLength(1);

    const secondId = randomUUID();
    const thirdId = randomUUID();
    await Promise.all([
      suiteScope.store.prepareRequest({
        runId,
        executionAttempt: 1,
        requestId: secondId,
        reservation: reservation(),
      }),
      suiteScope.store.prepareRequest({
        runId,
        executionAttempt: 1,
        requestId: thirdId,
        reservation: reservation(),
      }),
    ]);
    const stored = await suiteScope.prisma.aiRun.findUniqueOrThrow({ where: { id: runId } });
    const metadata = stored.modelMetadata as Record<string, unknown>;
    const savedExecution = metadata.sdkExecution as AiExecutionSummary;
    expect(metadata.legacyKey).toBe('preserve-me');
    expect(savedExecution.requests.map((item) => item.requestId)).toEqual(
      expect.arrayContaining([firstId, secondId, thirdId]),
    );
  });
  it('allows exactly one worker to claim a queued run', async () => {
    const queued = await suiteScope.prisma.aiRun.create({
      data: {
        provider: 'pending',
        model: 'pending',
        promptVersion: 'research-v1',
        status: 'queued',
      },
    });
    suiteScope.runIds.push(queued.id);
    const claimed = await Promise.all([
      suiteScope.runs.claim(queued.id),
      suiteScope.runs.claim(queued.id),
    ]);
    expect(claimed.filter(Boolean)).toHaveLength(1);
    expect(claimed.find(Boolean)).toMatchObject({ status: 'running', executionAttempt: 1 });
  });
  it('rejects stale owners for dispatch, lease renewal, and terminal writes', async () => {
    const runId = await suiteScope.createRun();
    const requestId = await suiteScope.prepare(runId);
    await suiteScope.prisma.aiRun.update({ where: { id: runId }, data: { executionAttempt: 2 } });
    await expect(
      suiteScope.store.authorizeDispatch({ runId, executionAttempt: 1 }, requestId),
    ).resolves.toBe(false);
    await expect(suiteScope.store.renewLease({ runId, executionAttempt: 1 }, 60_000)).resolves.toBe(
      false,
    );
    await expect(
      suiteScope.store.completeAndSettle({
        runId,
        executionAttempt: 1,
        requestId,
        outcome,
        revision: revision(
          1,
          { status: 'reported', inputTokens: 1, outputTokens: 1 },
          {
            status: 'known',
            amount: '0',
            currency: 'USD',
            source: 'fixture',
            pricingVersion: 'v1',
          },
        ),
        result: { valid: true },
      }),
    ).resolves.toBeNull();
  });
}
function registerExecutionUnknownAndSettlementCases(
  suiteScope: ReturnType<typeof executionFactContext>,
) {
  it('turns an authorized send crash into unknown without releasing reservations', async () => {
    const runId = await suiteScope.createRun();
    const requestId = await suiteScope.prepare(runId, randomUUID(), null);
    expect(
      await suiteScope.store.authorizeDispatch({ runId, executionAttempt: 1 }, requestId),
    ).toBe(true);
    expect(
      await suiteScope.store.markUnknown({ runId, executionAttempt: 1 }, requestId, {
        code: 'transport_unknown',
        phase: 'request',
        externalResult: 'unknown',
        summary: '发送授权后连接中断',
        requestId,
      }),
    ).toBe(true);
    const stored = await suiteScope.prisma.aiRun.findUniqueOrThrow({ where: { id: runId } });
    const saved = (stored.modelMetadata as Record<string, unknown>)
      .sdkExecution as AiExecutionSummary;
    expect(saved.requests[0]).toMatchObject({ state: 'unknown', settledRevision: 0 });
    expect(saved.generationStatus).toBe('unknown');
  });
  it('aggregates usage and cost across separate fallback request facts', async () => {
    const runId = await suiteScope.createRun();
    const firstId = await suiteScope.prepare(runId);
    await suiteScope.store.authorizeDispatch({ runId, executionAttempt: 1 }, firstId);
    await suiteScope.store.completeAndSettle({
      runId,
      executionAttempt: 1,
      requestId: firstId,
      outcome: { ...outcome, status: 'incomplete', schemaAccepted: false },
      error: {
        code: 'provider_rejected',
        phase: 'request',
        summary: '生成前拒绝',
        externalResult: 'rejected_before_generation',
        requestId: firstId,
      },
      revision: revision(
        1,
        { status: 'reported', inputTokens: 2, outputTokens: 3 },
        {
          status: 'known',
          amount: '0.25',
          currency: 'USD',
          source: 'provider',
          pricingVersion: 'v1',
        },
      ),
    });
    const secondId = await suiteScope.prepare(runId);
    await suiteScope.store.authorizeDispatch({ runId, executionAttempt: 1 }, secondId);
    await suiteScope.store.completeAndSettle({
      runId,
      executionAttempt: 1,
      requestId: secondId,
      outcome,
      result: { valid: true },
      revision: revision(
        1,
        { status: 'reported', inputTokens: 5, outputTokens: 7 },
        {
          status: 'known',
          amount: '0.5',
          currency: 'USD',
          source: 'provider',
          pricingVersion: 'v1',
        },
      ),
    });

    expect(await suiteScope.prisma.aiRun.findUniqueOrThrow({ where: { id: runId } })).toMatchObject(
      {
        status: 'succeeded',
        inputTokens: 7,
        outputTokens: 10,
        cost: new Prisma.Decimal('0.75'),
      },
    );
  });
  it('persists overage facts and legal result before blocking continuation, once', async () => {
    const runId = await suiteScope.createRun();
    const requestId = await suiteScope.prepare(runId);
    expect(
      await suiteScope.store.authorizeDispatch({ runId, executionAttempt: 1 }, requestId),
    ).toBe(true);
    const optimization = await suiteScope.createOptimization(runId, {
      maxAiCalls: 1,
      maxInputTokens: 11,
      maxOutputTokens: 20,
      maxCost: '1.25',
    });
    const usageRevision = revision(
      1,
      { status: 'reported', inputTokens: 12, outputTokens: 5 },
      { status: 'known', amount: '1.5', currency: 'USD', source: 'provider', pricingVersion: 'v1' },
    );
    const completion = {
      runId,
      executionAttempt: 1,
      requestId,
      outcome,
      revision: usageRevision,
      result: { legal: true },
      checkpoint: { legal: true },
      attemptId: optimization.attemptId,
      proposal: { legal: true },
    };
    const first = await suiteScope.optimizationSettlements.completeAndSettle(completion);
    expect(first).toMatchObject({ applied: true, continuationBlockedReason: 'budget_exceeded' });
    const duplicate = await suiteScope.optimizationSettlements.completeAndSettle(completion);
    expect(duplicate).toMatchObject({ applied: false, idempotent: true });
    const [run, account, attempt] = await Promise.all([
      suiteScope.prisma.aiRun.findUniqueOrThrow({ where: { id: runId } }),
      suiteScope.prisma.$queryRaw<
        Array<{ inputTokensUsed: number; outputTokensUsed: number; costUsed: Prisma.Decimal }>
      >(Prisma.sql`
        SELECT "inputTokensUsed", "outputTokensUsed", "costUsed"
        FROM "OptimizationExperiment" WHERE "id"=${optimization.experimentId}::uuid
      `),
      suiteScope.prisma.$queryRaw<Array<{ status: string; proposal: unknown }>>(Prisma.sql`
        SELECT "status", "proposal" FROM "OptimizationAttempt" WHERE "id"=${optimization.attemptId}::uuid
      `),
    ]);
    expect(run).toMatchObject({ status: 'succeeded', inputTokens: 12, outputTokens: 5 });
    expect(run.result).toEqual({ legal: true });
    expect(account[0]).toMatchObject({ inputTokensUsed: 12, outputTokensUsed: 5 });
    expect(account[0]?.costUsed.toString()).toBe('1.5');
    expect(attempt[0]).toMatchObject({ status: 'succeeded', proposal: { legal: true } });
  });
}
function registerExecutionCurrencyAndRevisionCases(
  suiteScope: ReturnType<typeof executionFactContext>,
) {
  it('keeps the frozen estimate when an actual cost uses another currency', async () => {
    const runId = await suiteScope.createRun();
    const requestId = await suiteScope.prepare(runId);
    await suiteScope.store.authorizeDispatch({ runId, executionAttempt: 1 }, requestId);
    const optimization = await suiteScope.createOptimization(runId, {
      maxAiCalls: 1,
      maxInputTokens: 20,
      maxOutputTokens: 20,
      maxCost: '2',
    });
    const settled = await suiteScope.optimizationSettlements.completeAndSettle({
      runId,
      executionAttempt: 1,
      requestId,
      outcome,
      revision: revision(
        1,
        { status: 'reported', inputTokens: 10, outputTokens: 10 },
        {
          status: 'known',
          amount: '0.5',
          currency: 'EUR',
          source: 'provider',
          pricingVersion: 'v1',
        },
      ),
      attemptId: optimization.attemptId,
    });
    expect(settled?.continuationBlockedReason).toBe('cost_unknown');
    const account = await suiteScope.prisma.$queryRaw<
      Array<{ costUsed: Prisma.Decimal }>
    >(Prisma.sql`
      SELECT "costUsed" FROM "OptimizationExperiment" WHERE "id"=${optimization.experimentId}::uuid
    `);
    expect(account[0]?.costUsed.toString()).toBe('1');
  });
  it('未知 Provider 费用不再因历史免费依据而放行后续执行', async () => {
    const runId = await suiteScope.createRun();
    const requestId = randomUUID();
    await suiteScope.store.prepareRequest({
      runId,
      executionAttempt: 1,
      requestId,
      reservation: {
        aiCalls: 1,
        inputTokens: 10,
        outputTokens: 10,
        cost: {
          status: 'unknown',
          amount: null,
          currency: null,
          source: 'provider_cost_unavailable',
          pricingVersion: null,
        },
      },
    });
    await suiteScope.store.authorizeDispatch({ runId, executionAttempt: 1 }, requestId);
    const optimization = await suiteScope.createOptimization(runId, {
      maxAiCalls: 1,
      maxInputTokens: 20,
      maxOutputTokens: 20,
      maxCost: '2',
    });

    const settled = await suiteScope.optimizationSettlements.completeAndSettle({
      runId,
      executionAttempt: 1,
      requestId,
      outcome,
      revision: revision(
        1,
        { status: 'reported', inputTokens: 10, outputTokens: 10 },
        {
          status: 'unknown',
          amount: null,
          currency: null,
          source: 'provider_cost_unavailable',
          pricingVersion: null,
        },
      ),
      attemptId: optimization.attemptId,
    });

    expect(settled?.continuationBlockedReason).toBe('cost_unknown');
    const account = await suiteScope.prisma.$queryRaw<
      Array<{ costUsed: Prisma.Decimal }>
    >(Prisma.sql`
      SELECT "costUsed" FROM "OptimizationExperiment" WHERE "id"=${optimization.experimentId}::uuid
    `);
    expect(account[0]?.costUsed.toString()).toBe('1');
  });
  it('keeps unknown reservation components and rolls back conflicting revisions', async () => {
    const runId = await suiteScope.createRun();
    const requestId = await suiteScope.prepare(runId);
    await suiteScope.store.authorizeDispatch({ runId, executionAttempt: 1 }, requestId);
    const optimization = await suiteScope.createOptimization(runId, {
      maxAiCalls: 1,
      maxInputTokens: 20,
      maxOutputTokens: 20,
      maxCost: '2',
    });
    const partial = revision(
      1,
      { status: 'partial', inputTokens: 12, outputTokens: null },
      { status: 'unknown', amount: null, currency: null, source: null, pricingVersion: null },
    );
    const first = await suiteScope.optimizationSettlements.completeAndSettle({
      runId,
      executionAttempt: 1,
      requestId,
      outcome,
      revision: partial,
      attemptId: optimization.attemptId,
    });
    expect(first).toMatchObject({ applied: true, continuationBlockedReason: null });
    const before = await suiteScope.prisma.$queryRaw<
      Array<{ inputTokensUsed: number; outputTokensUsed: number; costUsed: Prisma.Decimal }>
    >(Prisma.sql`
      SELECT "inputTokensUsed", "outputTokensUsed", "costUsed"
      FROM "OptimizationExperiment" WHERE "id"=${optimization.experimentId}::uuid
    `);
    expect(before[0]).toMatchObject({ inputTokensUsed: 12, outputTokensUsed: 10 });
    expect(before[0]?.costUsed.toString()).toBe('1');
    await expect(
      suiteScope.optimizationSettlements.completeAndSettle({
        runId,
        executionAttempt: 1,
        requestId,
        outcome,
        revision: revision(
          1,
          { status: 'reported', inputTokens: 99, outputTokens: 99 },
          {
            status: 'known',
            amount: '9',
            currency: 'USD',
            source: 'conflict',
            pricingVersion: 'v1',
          },
        ),
        attemptId: optimization.attemptId,
      }),
    ).rejects.toThrow('冲突事实');
    const after = await suiteScope.prisma.$queryRaw<
      Array<{ inputTokensUsed: number; outputTokensUsed: number; costUsed: Prisma.Decimal }>
    >(Prisma.sql`
      SELECT "inputTokensUsed", "outputTokensUsed", "costUsed"
      FROM "OptimizationExperiment" WHERE "id"=${optimization.experimentId}::uuid
    `);
    expect(after).toEqual(before);

    await expect(
      suiteScope.optimizationSettlements.completeAndSettle({
        runId,
        executionAttempt: 1,
        requestId,
        outcome,
        revision: revision(
          2,
          { status: 'reported', inputTokens: 15, outputTokens: 15 },
          {
            status: 'known',
            amount: '1.5',
            currency: 'USD',
            source: 'provider',
            pricingVersion: 'v1',
          },
        ),
        result: { valid: true },
        attemptId: optimization.attemptId,
        proposal: { invalid: 1n },
      }),
    ).rejects.toThrow();
    const rolledBack = await suiteScope.prisma.$queryRaw<
      Array<{ inputTokensUsed: number; outputTokensUsed: number; costUsed: Prisma.Decimal }>
    >(Prisma.sql`
      SELECT "inputTokensUsed", "outputTokensUsed", "costUsed"
      FROM "OptimizationExperiment" WHERE "id"=${optimization.experimentId}::uuid
    `);
    expect(rolledBack).toEqual(before);
    const stored = await suiteScope.prisma.aiRun.findUniqueOrThrow({ where: { id: runId } });
    const saved = (stored.modelMetadata as Record<string, unknown>)
      .sdkExecution as AiExecutionSummary;
    expect(stored.status).toBe('running');
    expect(saved.requests[0]?.settledRevision).toBe(1);
  });
}
