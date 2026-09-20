import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AiProviderRegistry } from '../../src/ai/provider-registry.js';
import { BacktestService } from '../../src/backtest/backtest.service.js';
import { PrismaService } from '../../src/platform/prisma.service.js';
import { ResultReadPolicyService } from '../../src/platform/result-read-policy.service.js';
import {
  type CandidateRow,
  type ExperimentRow,
} from '../../src/strategy-optimization/strategy-optimization-common.js';
import { StrategyOptimizationReadService } from '../../src/strategy-optimization/strategy-optimization-read.service.js';
import { StrategyOptimizationService } from '../../src/strategy-optimization/strategy-optimization.service.js';

const isolatedDescribe =
  process.env.RUN_STRATEGY_CENTER_T06_POSTGRES === '1' ? describe : describe.skip;
const suffix = `t06-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const split = {
  development: { start: '2026-01-01', end: '2026-04-30' },
  validation: { start: '2026-05-01', end: '2026-07-31' },
  test: { start: '2026-08-01', end: '2026-09-10' },
};
const runConfig = {
  startDate: '2026-01-01',
  endDate: '2026-09-10',
  dataAsOf: '2026-09-11T08:00:00.000Z',
  baseCurrency: 'CNY',
  initialCash: { CNY: '100000' },
};
const objective = { mode: 'balanced', minClosedTrades: 0 };
const budget = {
  maxAiCalls: 5,
  maxBacktestRuns: 10,
  maxInputTokens: 100_000,
  maxOutputTokens: 10_000,
  maxDurationSeconds: 600,
};

type FakeRun = {
  id: string;
  strategyVersionId: string;
  status: 'succeeded';
  result: Record<string, unknown>;
  fingerprint: string;
};

type TestCase = {
  experimentId: string;
  name: string;
  candidateIds: string[];
  selectedCandidateId: string;
};

const waitUntil = async (predicate: () => Promise<boolean>, timeoutMs = 8_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw new Error('等待 T06 进程恢复超时');
};

isolatedDescribe('T06 isolated PostgreSQL state machine and reveal boundary', () => {
  const prisma = new PrismaService();
  const policy = new ResultReadPolicyService(prisma);
  const reads = new StrategyOptimizationReadService(
    prisma,
    new AiProviderRegistry(),
    policy,
  );
  const backtests = new BacktestService(prisma, undefined, undefined, policy);
  const strategyId = randomUUID();
  const createdExperimentIds: string[] = [];
  const createdCandidateIds: string[] = [];
  const createdRunIds: string[] = [];
  let baselineVersionId = '';
  let candidateVersionAId = '';
  let candidateVersionBId = '';
  let candidateVersionCId = '';
  let primaryCandidateBId = '';
  let failPrimaryCandidateB = false;
  let invalidatePrimaryCandidateB = false;
  const runsByIdentity = new Map<string, FakeRun>();
  const runsById = new Map<string, FakeRun>();

  const persistRun = async (
    strategyVersionId: string,
    experimentId: string,
    identity: string,
    fingerprint: string,
    id = randomUUID(),
  ) => {
    const result = {
      source: 'BACKTEST',
      runId: id,
      completeness: 'complete',
      metrics: { totalReturn: '0.10', maxDrawdown: '-0.02' },
      trades: [],
    } satisfies Record<string, unknown>;
    await prisma.backtestJob.create({
      data: {
        id,
        strategyVersionId,
        idempotencyKey: `optimization:${experimentId}:${identity}`,
        mode: 'V2',
        status: 'succeeded',
        progress: 100,
        periodStart: new Date('2026-01-01T00:00:00.000Z'),
        periodEnd: new Date('2026-09-10T00:00:00.000Z'),
        dataAsOf: new Date('2026-09-11T08:00:00.000Z'),
        input: { runConfig },
        result: result as Prisma.InputJsonValue,
        warnings: [],
        snapshotManifest: { artifacts: [{ key: 'test', contentHash: fingerprint }] },
        finishedAt: new Date(),
      },
    });
    const run: FakeRun = { id, strategyVersionId, status: 'succeeded', result, fingerprint };
    createdRunIds.push(id);
    runsById.set(id, run);
    return run;
  };

  const fakeRuns = {
    executeRun: vi.fn(
      async (
        experiment: ExperimentRow,
        strategyVersionId: string,
        _splitName: string,
        identity: string,
      ) => {
        if (identity === `candidate-final:${primaryCandidateBId}` && failPrimaryCandidateB) {
          failPrimaryCandidateB = false;
          throw new Error('受控封存测试技术失败');
        }
        const previous = runsByIdentity.get(`${experiment.id}:${identity}`);
        if (previous) return previous;
        const frozenFingerprint = (
          experiment.frozenDataFingerprints as Record<string, unknown>
        ).test;
        let fingerprint =
          typeof frozenFingerprint === 'string'
            ? frozenFingerprint
            : 't06-frozen-fingerprint';
        if (identity === `candidate-final:${primaryCandidateBId}` && invalidatePrimaryCandidateB)
          fingerprint = 't06-different-fingerprint';
        if (identity === `candidate-final:${primaryCandidateBId}`)
          invalidatePrimaryCandidateB = false;
        const run = await persistRun(strategyVersionId, experiment.id, identity, fingerprint);
        runsByIdentity.set(`${experiment.id}:${identity}`, run);
        return run;
      },
    ),
    dataArtifactFingerprint: vi.fn(async (run: FakeRun) => run.fingerprint),
    evaluateResult: vi.fn((run: FakeRun) => ({
      runId: run.id,
      status: 'valid' as const,
      completeness: 'complete' as const,
      tradeCount: 0,
      score: 1,
    })),
    requireCompletedRun: vi.fn(async (id: string, label: string) => {
      const run = runsById.get(id);
      if (!run) throw new Error(`${label}冻结 Run 不可访问`);
      return run;
    }),
  };

  const optimizer = new StrategyOptimizationService(
    prisma,
    {} as never,
    {} as never,
    reads,
    fakeRuns as never,
    {} as never,
  );

  const readExperiment = async (id: string) => {
    const rows = await prisma.$queryRaw<ExperimentRow[]>(Prisma.sql`
      SELECT * FROM "OptimizationExperiment" WHERE "id"=${id}::uuid LIMIT 1
    `);
    if (!rows[0]) throw new Error(`实验不存在: ${id}`);
    return rows[0];
  };

  const readCandidate = async (id: string) => {
    const rows = await prisma.$queryRaw<CandidateRow[]>(Prisma.sql`
      SELECT * FROM "OptimizationCandidate" WHERE "id"=${id}::uuid LIMIT 1
    `);
    if (!rows[0]) throw new Error(`候选不存在: ${id}`);
    return rows[0];
  };

  const insertCase = async (input: {
    name: string;
    candidates: Array<{ versionId: string; status?: string; runId?: string }>;
    status?: string;
    stage?: string;
    executionAttempt?: number;
    baselineRunId?: string;
    baselineMetrics?: unknown;
    frozenFingerprint?: string;
    exposure?: unknown;
    leaseUntil?: Date | null;
  }): Promise<TestCase> => {
    const experimentId = randomUUID();
    const candidateIds = input.candidates.map(() => randomUUID());
    const selectedCandidateId = candidateIds[0]!;
    createdExperimentIds.push(experimentId);
    createdCandidateIds.push(...candidateIds);
    const baselineRunRefs = input.baselineRunId ? { test: input.baselineRunId } : {};
    const baselineMetrics = input.baselineMetrics ?? {};
    const frozenDataFingerprints = input.frozenFingerprint
      ? { test: input.frozenFingerprint }
      : {};
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "OptimizationExperiment" (
        "id", "name", "sourceMode", "baselineStrategyVersionId", "status", "stage", "objective",
        "allowedParameterIds", "split", "runConfig", "dataFingerprint", "modelConfig", "budget", "maxRounds",
        "baselineRunRefs", "baselineMetrics", "frozenDataFingerprints", "lockedCandidateIds", "selectedCandidateId",
        "testExposedAt", "exposure", "leaseUntil", "executionAttempt", "idempotencyKey"
      ) VALUES (
        ${experimentId}::uuid, ${input.name}, 'existing', ${baselineVersionId}::uuid,
        ${input.status ?? 'awaiting_finalization'}, ${input.stage ?? 'awaiting_finalization'},
        ${JSON.stringify(objective)}::jsonb, '[]'::jsonb, ${JSON.stringify(split)}::jsonb,
        ${JSON.stringify(runConfig)}::jsonb, ${`t06-data-${experimentId}`}, '[]'::jsonb,
        ${JSON.stringify(budget)}::jsonb, 1, ${JSON.stringify(baselineRunRefs)}::jsonb,
        ${JSON.stringify(baselineMetrics)}::jsonb, ${JSON.stringify(frozenDataFingerprints)}::jsonb,
        ${input.status === 'testing' || input.status === 'succeeded' ? JSON.stringify(candidateIds) : null}::jsonb,
        ${input.status === 'testing' || input.status === 'succeeded' ? selectedCandidateId : null}::uuid,
        ${input.status === 'testing' || input.status === 'succeeded' ? new Date() : null},
        ${JSON.stringify(input.exposure ?? null)}::jsonb, ${input.leaseUntil ?? null}, ${input.executionAttempt ?? 0},
        ${`t06-${suffix}-${experimentId}`}
      )
    `);
    for (const [index, candidateId] of candidateIds.entries()) {
      const candidate = input.candidates[index]!;
      const runRefs = candidate.runId ? { test: candidate.runId } : {};
      const metrics = candidate.runId
        ? { test: { runId: candidate.runId, status: 'valid', score: 1 } }
        : {};
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO "OptimizationCandidate" (
          "id", "experimentId", "candidateNumber", "modelKey", "candidateStrategyVersionId",
          "executionHash", "proposal", "diff", "validationStatus", "runRefs", "metrics"
        ) VALUES (
          ${candidateId}::uuid, ${experimentId}::uuid, ${index + 1}, ${`t06:model-${index + 1}`},
          ${candidate.versionId}::uuid, ${`t06-hash-${experimentId}-${index}`}, '{}'::jsonb, '[]'::jsonb,
          ${candidate.status ?? 'valid'}, ${JSON.stringify(runRefs)}::jsonb, ${JSON.stringify(metrics)}::jsonb
        )
      `);
    }
    return { experimentId, name: input.name, candidateIds, selectedCandidateId };
  };

  const assertHidden = async (testCase: TestCase, runId: string) => {
    const detail = await reads.get(testCase.experimentId);
    expect(detail.experiment.readEligibility).toMatchObject({
      state: 'restricted',
      code: 'TEST_NOT_REVEALED',
    });
    expect(detail.experiment.baselineRunRefs).not.toHaveProperty('test');
    expect(detail.experiment.baselineMetrics).not.toHaveProperty('test');
    expect(detail.candidates.every((candidate) => candidate.readEligibility.state === 'restricted')).toBe(
      true,
    );
    expect(detail.candidates.every((candidate) => !('test' in (candidate.metrics as object)))).toBe(
      true,
    );

    const compared = await reads.compare(testCase.experimentId);
    expect(compared.experiment.readEligibility).toMatchObject({
      state: 'restricted',
      code: 'TEST_NOT_REVEALED',
    });
    expect(compared.candidates.every((candidate) => candidate.validationScore === null)).toBe(true);

    const groups = await reads.listBacktestGroups({ search: testCase.name });
    const group = groups.items.find((item) => item.experimentId === testCase.experimentId);
    expect(group).toBeDefined();
    expect(group?.jobs.every((job) => job.readEligibility?.state === 'restricted')).toBe(true);

    expect(await policy.run(runId)).toMatchObject({
      state: 'restricted',
      code: 'TEST_NOT_REVEALED',
    });
    const direct = await backtests.statusForRead(runId);
    expect(direct).toMatchObject({ readEligibility: { state: 'restricted', code: 'TEST_NOT_REVEALED' } });
    expect(direct).not.toHaveProperty('result');
  };

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.strategy.create({
      data: { id: strategyId, name: `T06 策略 ${suffix}`, status: 'draft', schemaVersion: 2 },
    });
    const versions = await Promise.all([
      prisma.strategyVersion.create({
        data: {
          strategyId,
          version: 1,
          schemaVersion: 2,
          schema: { schemaVersion: '2', name: `T06 基线 ${suffix}` },
        },
      }),
      prisma.strategyVersion.create({
        data: {
          strategyId,
          version: -1,
          schemaVersion: 2,
          schema: { schemaVersion: '2', name: `T06 候选 A ${suffix}` },
        },
      }),
      prisma.strategyVersion.create({
        data: {
          strategyId,
          version: -2,
          schemaVersion: 2,
          schema: { schemaVersion: '2', name: `T06 候选 B ${suffix}` },
        },
      }),
      prisma.strategyVersion.create({
        data: {
          strategyId,
          version: -3,
          schemaVersion: 2,
          schema: { schemaVersion: '2', name: `T06 候选 C ${suffix}` },
        },
      }),
    ]);
    baselineVersionId = versions[0]!.id;
    candidateVersionAId = versions[1]!.id;
    candidateVersionBId = versions[2]!.id;
    candidateVersionCId = versions[3]!.id;
  });

  afterAll(async () => {
    if (createdRunIds.length > 0)
      await prisma.$executeRaw(Prisma.sql`
        DELETE FROM "BacktestJob"
        WHERE "id" IN (${Prisma.join(createdRunIds.map((id) => Prisma.sql`${id}::uuid`))})
      `);
    if (createdCandidateIds.length > 0)
      await prisma.$executeRaw(Prisma.sql`
        DELETE FROM "OptimizationCandidate"
        WHERE "id" IN (${Prisma.join(createdCandidateIds.map((id) => Prisma.sql`${id}::uuid`))})
      `);
    if (createdExperimentIds.length > 0)
      await prisma.$executeRaw(Prisma.sql`
        DELETE FROM "OptimizationExperiment"
        WHERE "id" IN (${Prisma.join(createdExperimentIds.map((id) => Prisma.sql`${id}::uuid`))})
      `);
    await prisma.strategyVersion.deleteMany({ where: { strategyId } });
    await prisma.strategy.delete({ where: { id: strategyId } });
    await prisma.$disconnect();
  });

  it('keeps a partial batch hidden, retries only the original incomplete candidate, and reveals once', async () => {
    const testCase = await insertCase({
      name: `T06 原批次 ${suffix}`,
      candidates: [{ versionId: candidateVersionAId }, { versionId: candidateVersionBId }],
    });
    primaryCandidateBId = testCase.candidateIds[1]!;
    failPrimaryCandidateB = true;
    invalidatePrimaryCandidateB = true;

    await expect(
      optimizer.finalize(testCase.experimentId, {
        candidateIds: testCase.candidateIds,
        selectedCandidateId: testCase.selectedCandidateId,
        expectedStage: 'awaiting_finalization',
      }),
    ).rejects.toThrow('受控封存测试技术失败');

    const afterFailure = await readExperiment(testCase.experimentId);
    expect(afterFailure).toMatchObject({ status: 'awaiting_finalization', stage: 'awaiting_finalization' });
    expect(afterFailure.testExposedAt).not.toBeNull();
    expect(afterFailure.exposure).toMatchObject({
      testAccessStarted: true,
      testRevealed: false,
      lockedCandidateIds: testCase.candidateIds,
      preselectedCandidateId: testCase.selectedCandidateId,
    });
    expect((await readCandidate(testCase.candidateIds[0]!)).validationStatus).toBe('test_valid');
    expect((await readCandidate(testCase.candidateIds[1]!)).validationStatus).toBe('test_failed');
    const baselineCallsAfterFailure = fakeRuns.executeRun.mock.calls.filter(
      (call) => call[3] === 'baseline-final',
    ).length;
    const firstCandidateCallsAfterFailure = fakeRuns.executeRun.mock.calls.filter(
      (call) => call[3] === `candidate-final:${testCase.candidateIds[0]}`,
    ).length;
    const firstCandidateRunId = (await readCandidate(testCase.candidateIds[0]!)).runRefs as {
      test: string;
    };
    await assertHidden(testCase, firstCandidateRunId.test);

    await prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationExperiment"
      SET "status"='testing', "stage"='testing', "leaseUntil"=${new Date(Date.now() - 1_000)}
      WHERE "id"=${testCase.experimentId}::uuid
    `);
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationCandidate" SET "validationStatus"='test_running'
      WHERE "id"=${testCase.candidateIds[1]!}::uuid
    `);
    await assertHidden(testCase, firstCandidateRunId.test);

    await prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationExperiment"
      SET "status"='awaiting_finalization', "stage"='awaiting_finalization', "leaseUntil"=NULL
      WHERE "id"=${testCase.experimentId}::uuid
    `);
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationCandidate" SET "validationStatus"='test_failed'
      WHERE "id"=${testCase.candidateIds[1]!}::uuid
    `);
    await assertHidden(testCase, firstCandidateRunId.test);

    await prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationCandidate"
      SET "validationStatus"='test_invalid',
          "runRefs"=${JSON.stringify({ test: firstCandidateRunId.test })}::jsonb,
          "metrics"=${JSON.stringify({ test: { runId: firstCandidateRunId.test, status: 'invalid' } })}::jsonb
      WHERE "id"=${testCase.candidateIds[1]!}::uuid
    `);
    await assertHidden(testCase, firstCandidateRunId.test);
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationCandidate"
      SET "validationStatus"='test_failed', "runRefs"='{}'::jsonb, "metrics"='{}'::jsonb
      WHERE "id"=${testCase.candidateIds[1]!}::uuid
    `);

    const baselineFacts = await readExperiment(testCase.experimentId);
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationExperiment"
      SET "baselineMetrics"='{}'::jsonb, "frozenDataFingerprints"='{}'::jsonb
      WHERE "id"=${testCase.experimentId}::uuid
    `);
    await expect(
      optimizer.finalize(testCase.experimentId, {
        candidateIds: testCase.candidateIds,
        selectedCandidateId: testCase.selectedCandidateId,
        expectedStage: 'awaiting_finalization',
      }),
    ).rejects.toThrow('基线冻结事实不完整');
    expect(
      fakeRuns.executeRun.mock.calls.filter((call) => call[3] === 'baseline-final').length,
    ).toBe(baselineCallsAfterFailure);
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationExperiment"
      SET "baselineRunRefs"=${JSON.stringify(baselineFacts.baselineRunRefs)}::jsonb,
          "baselineMetrics"=${JSON.stringify(baselineFacts.baselineMetrics)}::jsonb,
          "frozenDataFingerprints"=${JSON.stringify(baselineFacts.frozenDataFingerprints)}::jsonb
      WHERE "id"=${testCase.experimentId}::uuid
    `);

    await prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationExperiment"
      SET "baselineRunRefs"='{}'::jsonb, "baselineMetrics"='{}'::jsonb,
          "frozenDataFingerprints"=${JSON.stringify(baselineFacts.frozenDataFingerprints)}::jsonb
      WHERE "id"=${testCase.experimentId}::uuid
    `);
    await expect(
      optimizer.finalize(testCase.experimentId, {
        candidateIds: testCase.candidateIds,
        selectedCandidateId: testCase.selectedCandidateId,
        expectedStage: 'awaiting_finalization',
      }),
    ).rejects.toThrow('基线冻结事实不完整');
    expect(
      fakeRuns.executeRun.mock.calls.filter((call) => call[3] === 'baseline-final').length,
    ).toBe(baselineCallsAfterFailure);
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationExperiment"
      SET "baselineRunRefs"=${JSON.stringify(baselineFacts.baselineRunRefs)}::jsonb,
          "baselineMetrics"=${JSON.stringify(baselineFacts.baselineMetrics)}::jsonb,
          "frozenDataFingerprints"=${JSON.stringify(baselineFacts.frozenDataFingerprints)}::jsonb
      WHERE "id"=${testCase.experimentId}::uuid
    `);

    await prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationCandidate"
      SET "validationStatus"='test_valid', "runRefs"=${JSON.stringify({ test: 'orphan-run' })}::jsonb,
          "metrics"='{}'::jsonb
      WHERE "id"=${testCase.candidateIds[1]!}::uuid
    `);
    await expect(
      optimizer.finalize(testCase.experimentId, {
        candidateIds: testCase.candidateIds,
        selectedCandidateId: testCase.selectedCandidateId,
        expectedStage: 'awaiting_finalization',
      }),
    ).rejects.toThrow('缺少冻结 Run 引用');
    expect((await readExperiment(testCase.experimentId)).exposure).toMatchObject({
      testAccessStarted: true,
      testRevealed: false,
    });
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationCandidate"
      SET "validationStatus"='test_failed', "runRefs"='{}'::jsonb, "metrics"='{}'::jsonb
      WHERE "id"=${testCase.candidateIds[1]!}::uuid
    `);

    const staleExperiment = await readExperiment(testCase.experimentId);
    const staleCandidate = await readCandidate(testCase.candidateIds[1]!);
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationExperiment"
      SET "status"='testing', "stage"='testing', "leaseUntil"=${new Date(Date.now() - 1_000)},
          "executionAttempt"="executionAttempt"+1
      WHERE "id"=${testCase.experimentId}::uuid
    `);
    const callsBeforeLateResult = fakeRuns.executeRun.mock.calls.length;
    await (
      optimizer as unknown as {
        finalCandidate: (experiment: ExperimentRow, candidate: CandidateRow, fingerprint: string) => Promise<void>;
      }
    ).finalCandidate(staleExperiment, staleCandidate, 't06-frozen-fingerprint');
    expect(fakeRuns.executeRun.mock.calls.length).toBe(callsBeforeLateResult);
    expect((await readCandidate(testCase.candidateIds[1]!)).validationStatus).toBe('test_failed');

    await prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationExperiment"
      SET "status"='awaiting_finalization', "stage"='awaiting_finalization', "leaseUntil"=NULL
      WHERE "id"=${testCase.experimentId}::uuid
    `);
    await optimizer.finalize(testCase.experimentId, {
      candidateIds: testCase.candidateIds,
      selectedCandidateId: testCase.selectedCandidateId,
      expectedStage: 'awaiting_finalization',
    });
    const completed = await readExperiment(testCase.experimentId);
    expect(completed).toMatchObject({ status: 'succeeded', stage: 'completed' });
    expect(completed.exposure).toMatchObject({
      testAccessStarted: true,
      testRevealed: true,
      lockedCandidateIds: testCase.candidateIds,
      preselectedCandidateId: testCase.selectedCandidateId,
    });
    expect(completed.split).toEqual(baselineFacts.split);
    expect(completed.dataFingerprint).toBe(baselineFacts.dataFingerprint);
    expect((await readCandidate(testCase.candidateIds[0]!)).validationStatus).toBe('test_valid');
    expect((await readCandidate(testCase.candidateIds[1]!)).validationStatus).toBe('test_invalid');
    expect(
      fakeRuns.executeRun.mock.calls.filter((call) => call[3] === 'baseline-final').length,
    ).toBe(baselineCallsAfterFailure);
    expect(
      fakeRuns.executeRun.mock.calls.filter(
        (call) => call[3] === `candidate-final:${testCase.candidateIds[0]}`,
      ).length,
    ).toBe(firstCandidateCallsAfterFailure);
    const revealed = await reads.get(testCase.experimentId);
    expect(revealed.experiment.readEligibility).toMatchObject({ state: 'readable', code: 'READABLE' });
    expect(revealed.candidates[1]).toMatchObject({ validationStatus: 'test_invalid' });
  });

  it('keeps cancellation hidden and blocks a missing frozen dependency', async () => {
    const cancelRun = await persistRun(
      baselineVersionId,
      'cancel-case',
      'cancel-baseline',
      't06-cancel-fingerprint',
    );
    const cancelCase = await insertCase({
      name: `T06 放弃 ${suffix}`,
      candidates: [{ versionId: candidateVersionCId, status: 'test_failed' }],
      status: 'testing',
      stage: 'testing',
      executionAttempt: 3,
      baselineRunId: cancelRun.id,
      baselineMetrics: { test: { runId: cancelRun.id, status: 'valid' } },
      frozenFingerprint: cancelRun.fingerprint,
      exposure: { testAccessStarted: true, testRevealed: false },
      leaseUntil: new Date(Date.now() + 60_000),
    });
    const cancelled = await optimizer.cancel(cancelCase.experimentId);
    expect(cancelled.readEligibility).toMatchObject({ state: 'restricted', code: 'TEST_NOT_REVEALED' });
    const cancelledRow = await readExperiment(cancelCase.experimentId);
    expect(cancelledRow).toMatchObject({ status: 'cancelled', stage: 'cancelled' });
    expect(cancelledRow.exposure).toMatchObject({
      testAccessStarted: true,
      testRevealed: false,
    });
    await assertHidden(cancelCase, cancelRun.id);

    const missingBaselineId = randomUUID();
    const missingCandidateId = randomUUID();
    const missingCase = await insertCase({
      name: `T06 冻结依赖 ${suffix}`,
      candidates: [{ versionId: candidateVersionCId, status: 'test_valid', runId: randomUUID() }],
      baselineRunId: missingBaselineId,
      baselineMetrics: { test: { runId: missingBaselineId, status: 'valid' } },
      frozenFingerprint: 't06-missing-fingerprint',
    });
    const missingCandidate = await readCandidate(missingCase.candidateIds[0]!);
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationCandidate"
      SET "runRefs"=${JSON.stringify({ test: missingCandidateId })}::jsonb,
          "metrics"=${JSON.stringify({ test: { runId: missingCandidateId, status: 'valid' } })}::jsonb
      WHERE "id"=${missingCase.candidateIds[0]!}::uuid
    `);
    await expect(
      optimizer.finalize(missingCase.experimentId, {
        candidateIds: missingCase.candidateIds,
        selectedCandidateId: missingCase.selectedCandidateId,
        expectedStage: 'awaiting_finalization',
      }),
    ).rejects.toThrow('冻结 Run 不可访问');
    expect(await readExperiment(missingCase.experimentId)).toMatchObject({
      status: 'awaiting_finalization',
      stage: 'awaiting_finalization',
      exposure: { testAccessStarted: true, testRevealed: false },
    });
    expect(missingCandidate.validationStatus).toBe('test_valid');
  });

  it('recovers an expired testing lease without rerunning completed candidates', async () => {
    const baselineRun = await persistRun(
      baselineVersionId,
      'recovery-case',
      'recovery-baseline',
      't06-recovery-fingerprint',
    );
    const completedCandidateRun = await persistRun(
      candidateVersionAId,
      'recovery-case',
      'recovery-candidate-a',
      't06-recovery-fingerprint',
    );
    const recoveryCase = await insertCase({
      name: `T06 进程恢复 ${suffix}`,
      candidates: [
        { versionId: candidateVersionAId, status: 'test_valid', runId: completedCandidateRun.id },
        { versionId: candidateVersionBId, status: 'test_failed' },
      ],
      status: 'testing',
      stage: 'testing',
      executionAttempt: 4,
      baselineRunId: baselineRun.id,
      baselineMetrics: { test: { runId: baselineRun.id, status: 'valid' } },
      frozenFingerprint: baselineRun.fingerprint,
      exposure: { testAccessStarted: true, testRevealed: false },
      leaseUntil: new Date(Date.now() - 60_000),
    });
    const recoveryExperiment = await readExperiment(recoveryCase.experimentId);
    const recoveryCandidate = await readCandidate(recoveryCase.candidateIds[1]!);
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationExperiment"
      SET "executionAttempt"="executionAttempt"+1, "leaseUntil"=${new Date(Date.now() - 60_000)}
      WHERE "id"=${recoveryCase.experimentId}::uuid
    `);
    const callsBeforeLateRecoveryResult = fakeRuns.executeRun.mock.calls.length;
    await (
      optimizer as unknown as {
        finalCandidate: (experiment: ExperimentRow, candidate: CandidateRow, fingerprint: string) => Promise<void>;
      }
    ).finalCandidate(recoveryExperiment, recoveryCandidate, baselineRun.fingerprint);
    expect(fakeRuns.executeRun.mock.calls.length).toBe(callsBeforeLateRecoveryResult);
    expect((await readCandidate(recoveryCase.candidateIds[1]!)).validationStatus).toBe('test_failed');

    await optimizer.reconcilePending();
    await waitUntil(async () => (await readExperiment(recoveryCase.experimentId)).status === 'succeeded');
    const recovered = await readExperiment(recoveryCase.experimentId);
    expect(recovered.exposure).toMatchObject({ testAccessStarted: true, testRevealed: true });
    expect(recovered.lockedCandidateIds).toEqual(recoveryCase.candidateIds);
    expect(recovered.selectedCandidateId).toBe(recoveryCase.selectedCandidateId);
    expect((await readCandidate(recoveryCase.candidateIds[0]!)).validationStatus).toBe('test_valid');
    expect((await readCandidate(recoveryCase.candidateIds[1]!)).validationStatus).toBe('test_valid');
    expect(
      fakeRuns.executeRun.mock.calls.filter((call) => call[3] === 'recovery-baseline').length,
    ).toBe(0);
    expect(
      fakeRuns.executeRun.mock.calls.filter((call) => call[3] === 'recovery-candidate-a').length,
    ).toBe(0);
    expect(
      fakeRuns.executeRun.mock.calls.filter(
        (call) => call[3] === `candidate-final:${recoveryCase.candidateIds[1]}`,
      ).length,
    ).toBe(1);
    const visible = await reads.get(recoveryCase.experimentId);
    expect(visible.experiment.readEligibility).toMatchObject({
      state: 'readable',
      code: 'READABLE',
    });
    expect(await policy.run(baselineRun.id)).toMatchObject({ state: 'readable', code: 'READABLE' });
    expect(await backtests.statusForRead(baselineRun.id)).toHaveProperty('result');
  });
});
