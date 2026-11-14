import {
  createT06RunPersistence,
  createT06RunExecution,
  createT06CaseInsertion,
  createT06HiddenReadAssertion,
  suffix,
  initializeT06Fixture,
  type FakeRun,
} from './strategy-center-t06.fixture.js';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
import type { RunConfigV3 } from '@thesis-ledger/schemas';

const isolatedDescribe =
  process.env.RUN_STRATEGY_CENTER_T06_POSTGRES === '1' ? describe : describe.skip;

const waitUntil = async (predicate: () => Promise<boolean>, timeoutMs = 8_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw new Error('等待 T06 进程恢复超时');
};

isolatedDescribe('T06 isolated PostgreSQL state machine and reveal boundary', () => {
  const suiteScope = t06SealedBatchContext();
  registerT06AutomaticBatchCases(suiteScope);
  registerT06PartialBatchRevealCase(suiteScope);
  registerT06CancellationAndLeaseCases(suiteScope);
});

function t06SealedBatchContext() {
  const prisma = new PrismaService();
  const policy = new ResultReadPolicyService(prisma);
  const reads = new StrategyOptimizationReadService(prisma, new AiProviderRegistry(), policy);
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
  let currentRunConfig: RunConfigV3;
  const persistRun = createT06RunPersistence({
    prisma,
    createdRunIds,
    runsById,
    get currentRunConfig() {
      return currentRunConfig;
    },
  });
  const fakeRuns = createT06RunExecution({
    runsByIdentity,
    runsById,
    persistRun,
    get primaryCandidateBId() {
      return primaryCandidateBId;
    },
    get failPrimaryCandidateB() {
      return failPrimaryCandidateB;
    },
    set failPrimaryCandidateB(value: boolean) {
      failPrimaryCandidateB = value;
    },
    get invalidatePrimaryCandidateB() {
      return invalidatePrimaryCandidateB;
    },
    set invalidatePrimaryCandidateB(value: boolean) {
      invalidatePrimaryCandidateB = value;
    },
  });
  const optimizer = new StrategyOptimizationService(
    prisma,
    {} as never,
    {} as never,
    reads,
    fakeRuns as never,
    {} as never,
  );
  const finalization = (
    optimizer as unknown as {
      finalization: {
        finalCandidate(
          experiment: ExperimentRow,
          candidate: CandidateRow,
          fingerprint: string,
        ): Promise<void>;
      };
    }
  ).finalization;
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
  const insertCase = createT06CaseInsertion({
    prisma,
    createdExperimentIds,
    createdCandidateIds,
    get baselineVersionId() {
      return baselineVersionId;
    },
  });
  const assertHidden = createT06HiddenReadAssertion({ reads, policy, backtests });
  const fixtureState = {
    get prisma() {
      return prisma;
    },
    get policy() {
      return policy;
    },
    get reads() {
      return reads;
    },
    get backtests() {
      return backtests;
    },
    get strategyId() {
      return strategyId;
    },
    get createdExperimentIds() {
      return createdExperimentIds;
    },
    get createdCandidateIds() {
      return createdCandidateIds;
    },
    get createdRunIds() {
      return createdRunIds;
    },
    get baselineVersionId() {
      return baselineVersionId;
    },
    set baselineVersionId(value: typeof baselineVersionId) {
      baselineVersionId = value;
    },
    get candidateVersionAId() {
      return candidateVersionAId;
    },
    set candidateVersionAId(value: typeof candidateVersionAId) {
      candidateVersionAId = value;
    },
    get candidateVersionBId() {
      return candidateVersionBId;
    },
    set candidateVersionBId(value: typeof candidateVersionBId) {
      candidateVersionBId = value;
    },
    get candidateVersionCId() {
      return candidateVersionCId;
    },
    set candidateVersionCId(value: typeof candidateVersionCId) {
      candidateVersionCId = value;
    },
    get primaryCandidateBId() {
      return primaryCandidateBId;
    },
    set primaryCandidateBId(value: typeof primaryCandidateBId) {
      primaryCandidateBId = value;
    },
    get failPrimaryCandidateB() {
      return failPrimaryCandidateB;
    },
    set failPrimaryCandidateB(value: typeof failPrimaryCandidateB) {
      failPrimaryCandidateB = value;
    },
    get invalidatePrimaryCandidateB() {
      return invalidatePrimaryCandidateB;
    },
    set invalidatePrimaryCandidateB(value: typeof invalidatePrimaryCandidateB) {
      invalidatePrimaryCandidateB = value;
    },
    get runsByIdentity() {
      return runsByIdentity;
    },
    get runsById() {
      return runsById;
    },
    get currentRunConfig() {
      return currentRunConfig;
    },
    set currentRunConfig(value: typeof currentRunConfig) {
      currentRunConfig = value;
    },
    get persistRun() {
      return persistRun;
    },
    get fakeRuns() {
      return fakeRuns;
    },
    get optimizer() {
      return optimizer;
    },
    get finalization() {
      return finalization;
    },
    get readExperiment() {
      return readExperiment;
    },
    get readCandidate() {
      return readCandidate;
    },
    get insertCase() {
      return insertCase;
    },
    get assertHidden() {
      return assertHidden;
    },
  };
  beforeAll(async () => {
    await initializeT06Fixture(prisma, strategyId, fixtureState);
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
    await prisma.strategy.deleteMany({ where: { id: strategyId } });
    await prisma.$disconnect();
  });
  return fixtureState;
}
function registerT06AutomaticBatchCases(suiteScope: ReturnType<typeof t06SealedBatchContext>) {
  it('候选结束后自动测试全部有效候选，恢复领取间隙且拒绝过期阶段提交', async () => {
    const automatic = await suiteScope.insertCase({
      name: `自动完成 ${suffix}`,
      status: 'running',
      stage: 'evaluating',
      candidates: [
        { versionId: suiteScope.candidateVersionAId },
        { versionId: suiteScope.candidateVersionBId },
        { versionId: suiteScope.candidateVersionCId },
        { versionId: suiteScope.candidateVersionAId },
        { versionId: suiteScope.candidateVersionBId, status: 'invalid' },
      ],
    });
    const finish = (attempt: number) =>
      (
        suiteScope.optimizer as unknown as {
          finishProposalStage(id: string, attempt: number): Promise<unknown>;
        }
      ).finishProposalStage(automatic.experimentId, attempt);
    await finish(999);
    expect((await suiteScope.readExperiment(automatic.experimentId)).status).toBe('running');
    await finish(0);
    const completed = await suiteScope.readExperiment(automatic.experimentId);
    expect(completed).toMatchObject({
      status: 'succeeded',
      stage: 'completed',
      selectedCandidateId: null,
    });
    expect(completed.lockedCandidateIds).toEqual(automatic.candidateIds.slice(0, 4));
    expect(completed.exposure).toMatchObject({ testRevealed: true, preselectedCandidateId: null });
    expect((await suiteScope.readCandidate(automatic.candidateIds[4]!)).validationStatus).toBe(
      'invalid',
    );
    const calls = suiteScope.fakeRuns.executeRun.mock.calls.length;
    await suiteScope.optimizer.complete(automatic.experimentId);
    expect(suiteScope.fakeRuns.executeRun.mock.calls.length).toBe(calls);
    const gap = await suiteScope.insertCase({
      name: `领取间隙 ${suffix}`,
      candidates: [{ versionId: suiteScope.candidateVersionAId }],
    });
    await suiteScope.optimizer.reconcilePending();
    await waitUntil(
      async () => (await suiteScope.readExperiment(gap.experimentId)).status === 'succeeded',
    );
    expect((await suiteScope.readExperiment(gap.experimentId)).selectedCandidateId).toBeNull();
  });
  it.each([null, undefined])(
    '没有预选 %s 时完成锁定、测试和统一揭示',
    async (selectedCandidateId) => {
      const testCase = await suiteScope.insertCase({
        name: `可选预选 ${suffix}`,
        candidates: [{ versionId: suiteScope.candidateVersionAId }],
      });
      await suiteScope.optimizer.finalize(testCase.experimentId, {
        candidateIds: testCase.candidateIds,
        ...(selectedCandidateId === undefined ? {} : { selectedCandidateId }),
        expectedStage: 'awaiting_finalization',
      });
      const after = await suiteScope.readExperiment(testCase.experimentId);
      expect(after).toMatchObject({
        status: 'succeeded',
        stage: 'completed',
        selectedCandidateId: null,
      });
      expect(after.exposure).toMatchObject({ preselectedCandidateId: null, testRevealed: true });
      expect((await suiteScope.readCandidate(testCase.candidateIds[0]!)).validationStatus).toBe(
        'test_valid',
      );
      expect(
        (await suiteScope.reads.compare(testCase.experimentId)).experiment.readEligibility.state,
      ).toBe('readable');
      await expect(
        suiteScope.optimizer.adopt(testCase.experimentId, {
          candidateId: testCase.candidateIds[0],
          candidateHash: (await suiteScope.readCandidate(testCase.candidateIds[0]!)).executionHash,
          expectedStrategyVersion: 1,
          idempotencyKey: randomUUID(),
          acknowledgeTestExposure: false,
        }),
      ).rejects.toMatchObject({ response: { errorCode: 'ADOPTION_NOT_ELIGIBLE' } });
    },
  );
  it('空预选批次技术失败后保持隐藏，重试不能补选或更换集合', async () => {
    const testCase = await suiteScope.insertCase({
      name: `空预选重试 ${suffix}`,
      candidates: [
        { versionId: suiteScope.candidateVersionAId },
        { versionId: suiteScope.candidateVersionBId },
      ],
    });
    suiteScope.primaryCandidateBId = testCase.candidateIds[1]!;
    suiteScope.failPrimaryCandidateB = true;
    suiteScope.invalidatePrimaryCandidateB = false;
    const body = {
      candidateIds: testCase.candidateIds,
      selectedCandidateId: null,
      expectedStage: 'awaiting_finalization',
    };
    await expect(suiteScope.optimizer.finalize(testCase.experimentId, body)).rejects.toThrow(
      '受控封存测试技术失败',
    );
    const firstRunId = (await suiteScope.readCandidate(testCase.candidateIds[0]!)).runRefs as {
      test: string;
    };
    await suiteScope.assertHidden(testCase, firstRunId.test);
    await expect(
      suiteScope.optimizer.finalize(testCase.experimentId, {
        ...body,
        selectedCandidateId: testCase.selectedCandidateId,
      }),
    ).rejects.toThrow('只允许对原锁定候选');
    await expect(
      suiteScope.optimizer.finalize(testCase.experimentId, {
        ...body,
        candidateIds: [testCase.candidateIds[0]],
      }),
    ).rejects.toThrow('只允许对原锁定候选');
    await suiteScope.optimizer.finalize(testCase.experimentId, body);
    expect((await suiteScope.readExperiment(testCase.experimentId)).exposure).toMatchObject({
      preselectedCandidateId: null,
      testRevealed: true,
    });
    expect((await suiteScope.readCandidate(testCase.candidateIds[0]!)).runRefs).toMatchObject({
      test: firstRunId.test,
    });
  });
}
function registerT06PartialBatchRevealCase(suiteScope: ReturnType<typeof t06SealedBatchContext>) {
  it('keeps a partial batch hidden, retries only the original incomplete candidate, and reveals once', async () => {
    const testCase = await suiteScope.insertCase({
      name: `T06 原批次 ${suffix}`,
      candidates: [
        { versionId: suiteScope.candidateVersionAId },
        { versionId: suiteScope.candidateVersionBId },
      ],
    });
    suiteScope.primaryCandidateBId = testCase.candidateIds[1]!;
    suiteScope.failPrimaryCandidateB = true;
    suiteScope.invalidatePrimaryCandidateB = true;

    await expect(
      suiteScope.optimizer.finalize(testCase.experimentId, {
        candidateIds: testCase.candidateIds,
        selectedCandidateId: testCase.selectedCandidateId,
        expectedStage: 'awaiting_finalization',
      }),
    ).rejects.toThrow('受控封存测试技术失败');

    const afterFailure = await suiteScope.readExperiment(testCase.experimentId);
    expect(afterFailure).toMatchObject({
      status: 'awaiting_finalization',
      stage: 'awaiting_finalization',
    });
    expect(afterFailure.testExposedAt).not.toBeNull();
    expect(afterFailure.exposure).toMatchObject({
      testAccessStarted: true,
      testRevealed: false,
      lockedCandidateIds: testCase.candidateIds,
      preselectedCandidateId: testCase.selectedCandidateId,
    });
    expect((await suiteScope.readCandidate(testCase.candidateIds[0]!)).validationStatus).toBe(
      'test_valid',
    );
    expect((await suiteScope.readCandidate(testCase.candidateIds[1]!)).validationStatus).toBe(
      'test_failed',
    );
    const baselineCallsAfterFailure = suiteScope.fakeRuns.executeRun.mock.calls.filter(
      (call) => call[3] === 'baseline-final',
    ).length;
    const firstCandidateCallsAfterFailure = suiteScope.fakeRuns.executeRun.mock.calls.filter(
      (call) => call[3] === `candidate-final:${testCase.candidateIds[0]}`,
    ).length;
    const firstCandidateRunId = (await suiteScope.readCandidate(testCase.candidateIds[0]!))
      .runRefs as {
      test: string;
    };
    await suiteScope.assertHidden(testCase, firstCandidateRunId.test);

    await suiteScope.prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationExperiment"
      SET "status"='testing', "stage"='testing', "leaseUntil"=${new Date(Date.now() - 1_000)}
      WHERE "id"=${testCase.experimentId}::uuid
    `);
    await suiteScope.prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationCandidate" SET "validationStatus"='test_running'
      WHERE "id"=${testCase.candidateIds[1]!}::uuid
    `);
    await suiteScope.assertHidden(testCase, firstCandidateRunId.test);

    await suiteScope.prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationExperiment"
      SET "status"='awaiting_finalization', "stage"='awaiting_finalization', "leaseUntil"=NULL
      WHERE "id"=${testCase.experimentId}::uuid
    `);
    await suiteScope.prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationCandidate" SET "validationStatus"='test_failed'
      WHERE "id"=${testCase.candidateIds[1]!}::uuid
    `);
    await suiteScope.assertHidden(testCase, firstCandidateRunId.test);

    await suiteScope.prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationCandidate"
      SET "validationStatus"='test_invalid',
          "runRefs"=${JSON.stringify({ test: firstCandidateRunId.test })}::jsonb,
          "metrics"=${JSON.stringify({ test: { runId: firstCandidateRunId.test, status: 'invalid' } })}::jsonb
      WHERE "id"=${testCase.candidateIds[1]!}::uuid
    `);
    await suiteScope.assertHidden(testCase, firstCandidateRunId.test);
    await suiteScope.prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationCandidate"
      SET "validationStatus"='test_failed', "runRefs"='{}'::jsonb, "metrics"='{}'::jsonb
      WHERE "id"=${testCase.candidateIds[1]!}::uuid
    `);

    const baselineFacts = await suiteScope.readExperiment(testCase.experimentId);
    await suiteScope.prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationExperiment"
      SET "baselineMetrics"='{}'::jsonb, "frozenDataFingerprints"='{}'::jsonb
      WHERE "id"=${testCase.experimentId}::uuid
    `);
    await expect(
      suiteScope.optimizer.finalize(testCase.experimentId, {
        candidateIds: testCase.candidateIds,
        selectedCandidateId: testCase.selectedCandidateId,
        expectedStage: 'awaiting_finalization',
      }),
    ).rejects.toThrow('基线冻结事实不完整');
    expect(
      suiteScope.fakeRuns.executeRun.mock.calls.filter((call) => call[3] === 'baseline-final')
        .length,
    ).toBe(baselineCallsAfterFailure);
    await suiteScope.prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationExperiment"
      SET "baselineRunRefs"=${JSON.stringify(baselineFacts.baselineRunRefs)}::jsonb,
          "baselineMetrics"=${JSON.stringify(baselineFacts.baselineMetrics)}::jsonb,
          "frozenDataFingerprints"=${JSON.stringify(baselineFacts.frozenDataFingerprints)}::jsonb
      WHERE "id"=${testCase.experimentId}::uuid
    `);

    await suiteScope.prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationExperiment"
      SET "baselineRunRefs"='{}'::jsonb, "baselineMetrics"='{}'::jsonb,
          "frozenDataFingerprints"=${JSON.stringify(baselineFacts.frozenDataFingerprints)}::jsonb
      WHERE "id"=${testCase.experimentId}::uuid
    `);
    await expect(
      suiteScope.optimizer.finalize(testCase.experimentId, {
        candidateIds: testCase.candidateIds,
        selectedCandidateId: testCase.selectedCandidateId,
        expectedStage: 'awaiting_finalization',
      }),
    ).rejects.toThrow('基线冻结事实不完整');
    expect(
      suiteScope.fakeRuns.executeRun.mock.calls.filter((call) => call[3] === 'baseline-final')
        .length,
    ).toBe(baselineCallsAfterFailure);
    await suiteScope.prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationExperiment"
      SET "baselineRunRefs"=${JSON.stringify(baselineFacts.baselineRunRefs)}::jsonb,
          "baselineMetrics"=${JSON.stringify(baselineFacts.baselineMetrics)}::jsonb,
          "frozenDataFingerprints"=${JSON.stringify(baselineFacts.frozenDataFingerprints)}::jsonb
      WHERE "id"=${testCase.experimentId}::uuid
    `);

    await suiteScope.prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationCandidate"
      SET "validationStatus"='test_valid', "runRefs"=${JSON.stringify({ test: 'orphan-run' })}::jsonb,
          "metrics"='{}'::jsonb
      WHERE "id"=${testCase.candidateIds[1]!}::uuid
    `);
    await expect(
      suiteScope.optimizer.finalize(testCase.experimentId, {
        candidateIds: testCase.candidateIds,
        selectedCandidateId: testCase.selectedCandidateId,
        expectedStage: 'awaiting_finalization',
      }),
    ).rejects.toThrow('缺少冻结 Run 引用');
    expect((await suiteScope.readExperiment(testCase.experimentId)).exposure).toMatchObject({
      testAccessStarted: true,
      testRevealed: false,
    });
    await suiteScope.prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationCandidate"
      SET "validationStatus"='test_failed', "runRefs"='{}'::jsonb, "metrics"='{}'::jsonb
      WHERE "id"=${testCase.candidateIds[1]!}::uuid
    `);

    const staleExperiment = await suiteScope.readExperiment(testCase.experimentId);
    const staleCandidate = await suiteScope.readCandidate(testCase.candidateIds[1]!);
    await suiteScope.prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationExperiment"
      SET "status"='testing', "stage"='testing', "leaseUntil"=${new Date(Date.now() - 1_000)},
          "executionAttempt"="executionAttempt"+1
      WHERE "id"=${testCase.experimentId}::uuid
    `);
    const callsBeforeLateResult = suiteScope.fakeRuns.executeRun.mock.calls.length;
    await suiteScope.finalization.finalCandidate(
      staleExperiment,
      staleCandidate,
      't06-frozen-fingerprint',
    );
    expect(suiteScope.fakeRuns.executeRun.mock.calls.length).toBe(callsBeforeLateResult);
    expect((await suiteScope.readCandidate(testCase.candidateIds[1]!)).validationStatus).toBe(
      'test_failed',
    );

    await suiteScope.prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationExperiment"
      SET "status"='awaiting_finalization', "stage"='awaiting_finalization', "leaseUntil"=NULL
      WHERE "id"=${testCase.experimentId}::uuid
    `);
    await suiteScope.optimizer.finalize(testCase.experimentId, {
      candidateIds: testCase.candidateIds,
      selectedCandidateId: testCase.selectedCandidateId,
      expectedStage: 'awaiting_finalization',
    });
    const completed = await suiteScope.readExperiment(testCase.experimentId);
    expect(completed).toMatchObject({ status: 'succeeded', stage: 'completed' });
    expect(completed.exposure).toMatchObject({
      testAccessStarted: true,
      testRevealed: true,
      lockedCandidateIds: testCase.candidateIds,
      preselectedCandidateId: testCase.selectedCandidateId,
    });
    expect(completed.split).toEqual(baselineFacts.split);
    expect(completed.dataFingerprint).toBe(baselineFacts.dataFingerprint);
    expect((await suiteScope.readCandidate(testCase.candidateIds[0]!)).validationStatus).toBe(
      'test_valid',
    );
    expect((await suiteScope.readCandidate(testCase.candidateIds[1]!)).validationStatus).toBe(
      'test_invalid',
    );
    expect(
      suiteScope.fakeRuns.executeRun.mock.calls.filter((call) => call[3] === 'baseline-final')
        .length,
    ).toBe(baselineCallsAfterFailure);
    expect(
      suiteScope.fakeRuns.executeRun.mock.calls.filter(
        (call) => call[3] === `candidate-final:${testCase.candidateIds[0]}`,
      ).length,
    ).toBe(firstCandidateCallsAfterFailure);
    const revealed = await suiteScope.reads.get(testCase.experimentId);
    expect(revealed.experiment.readEligibility).toMatchObject({
      state: 'readable',
      code: 'READABLE',
    });
    expect(revealed.candidates[1]).toMatchObject({ validationStatus: 'test_invalid' });
  });
}
function registerT06CancellationAndLeaseCases(
  suiteScope: ReturnType<typeof t06SealedBatchContext>,
) {
  it('keeps cancellation hidden and blocks a missing frozen dependency', async () => {
    const cancelRun = await suiteScope.persistRun(
      suiteScope.baselineVersionId,
      'cancel-case',
      'cancel-baseline',
      't06-cancel-fingerprint',
    );
    const cancelCase = await suiteScope.insertCase({
      name: `T06 放弃 ${suffix}`,
      candidates: [{ versionId: suiteScope.candidateVersionCId, status: 'test_failed' }],
      status: 'testing',
      stage: 'testing',
      executionAttempt: 3,
      baselineRunId: cancelRun.id,
      baselineMetrics: { test: { runId: cancelRun.id, status: 'valid' } },
      frozenFingerprint: cancelRun.fingerprint,
      exposure: { testAccessStarted: true, testRevealed: false },
      leaseUntil: new Date(Date.now() + 60_000),
    });
    const cancelled = await suiteScope.optimizer.cancel(cancelCase.experimentId);
    expect(cancelled.readEligibility).toMatchObject({
      state: 'restricted',
      code: 'TEST_NOT_REVEALED',
    });
    const cancelledRow = await suiteScope.readExperiment(cancelCase.experimentId);
    expect(cancelledRow).toMatchObject({ status: 'cancelled', stage: 'cancelled' });
    expect(cancelledRow.exposure).toMatchObject({
      testAccessStarted: true,
      testRevealed: false,
    });
    await suiteScope.assertHidden(cancelCase, cancelRun.id);

    const missingBaselineId = randomUUID();
    const missingCandidateId = randomUUID();
    const missingCase = await suiteScope.insertCase({
      name: `T06 冻结依赖 ${suffix}`,
      candidates: [
        { versionId: suiteScope.candidateVersionCId, status: 'test_valid', runId: randomUUID() },
      ],
      baselineRunId: missingBaselineId,
      baselineMetrics: { test: { runId: missingBaselineId, status: 'valid' } },
      frozenFingerprint: 't06-missing-fingerprint',
    });
    const missingCandidate = await suiteScope.readCandidate(missingCase.candidateIds[0]!);
    await suiteScope.prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationCandidate"
      SET "runRefs"=${JSON.stringify({ test: missingCandidateId })}::jsonb,
          "metrics"=${JSON.stringify({ test: { runId: missingCandidateId, status: 'valid' } })}::jsonb
      WHERE "id"=${missingCase.candidateIds[0]!}::uuid
    `);
    await expect(
      suiteScope.optimizer.finalize(missingCase.experimentId, {
        candidateIds: missingCase.candidateIds,
        selectedCandidateId: missingCase.selectedCandidateId,
        expectedStage: 'awaiting_finalization',
      }),
    ).rejects.toThrow('冻结 Run 不可访问');
    expect(await suiteScope.readExperiment(missingCase.experimentId)).toMatchObject({
      status: 'awaiting_finalization',
      stage: 'awaiting_finalization',
      exposure: { testAccessStarted: true, testRevealed: false },
    });
    expect(missingCandidate.validationStatus).toBe('test_valid');
  });
  it('recovers an expired testing lease without rerunning completed candidates', async () => {
    const baselineRun = await suiteScope.persistRun(
      suiteScope.baselineVersionId,
      'recovery-case',
      'recovery-baseline',
      't06-recovery-fingerprint',
    );
    const completedCandidateRun = await suiteScope.persistRun(
      suiteScope.candidateVersionAId,
      'recovery-case',
      'recovery-candidate-a',
      't06-recovery-fingerprint',
    );
    const recoveryCase = await suiteScope.insertCase({
      name: `T06 进程恢复 ${suffix}`,
      candidates: [
        {
          versionId: suiteScope.candidateVersionAId,
          status: 'test_valid',
          runId: completedCandidateRun.id,
        },
        { versionId: suiteScope.candidateVersionBId, status: 'test_failed' },
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
    const recoveryExperiment = await suiteScope.readExperiment(recoveryCase.experimentId);
    const recoveryCandidate = await suiteScope.readCandidate(recoveryCase.candidateIds[1]!);
    await suiteScope.prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationExperiment"
      SET "executionAttempt"="executionAttempt"+1, "leaseUntil"=${new Date(Date.now() - 60_000)}
      WHERE "id"=${recoveryCase.experimentId}::uuid
    `);
    const callsBeforeLateRecoveryResult = suiteScope.fakeRuns.executeRun.mock.calls.length;
    await suiteScope.finalization.finalCandidate(
      recoveryExperiment,
      recoveryCandidate,
      baselineRun.fingerprint,
    );
    expect(suiteScope.fakeRuns.executeRun.mock.calls.length).toBe(callsBeforeLateRecoveryResult);
    expect((await suiteScope.readCandidate(recoveryCase.candidateIds[1]!)).validationStatus).toBe(
      'test_failed',
    );

    await suiteScope.optimizer.reconcilePending();
    await waitUntil(
      async () =>
        (await suiteScope.readExperiment(recoveryCase.experimentId)).status === 'succeeded',
    );
    const recovered = await suiteScope.readExperiment(recoveryCase.experimentId);
    expect(recovered.exposure).toMatchObject({ testAccessStarted: true, testRevealed: true });
    expect(recovered.lockedCandidateIds).toEqual(recoveryCase.candidateIds);
    expect(recovered.selectedCandidateId).toBe(recoveryCase.selectedCandidateId);
    expect((await suiteScope.readCandidate(recoveryCase.candidateIds[0]!)).validationStatus).toBe(
      'test_valid',
    );
    expect((await suiteScope.readCandidate(recoveryCase.candidateIds[1]!)).validationStatus).toBe(
      'test_valid',
    );
    expect(
      suiteScope.fakeRuns.executeRun.mock.calls.filter((call) => call[3] === 'recovery-baseline')
        .length,
    ).toBe(0);
    expect(
      suiteScope.fakeRuns.executeRun.mock.calls.filter((call) => call[3] === 'recovery-candidate-a')
        .length,
    ).toBe(0);
    expect(
      suiteScope.fakeRuns.executeRun.mock.calls.filter(
        (call) => call[3] === `candidate-final:${recoveryCase.candidateIds[1]}`,
      ).length,
    ).toBe(1);
    const visible = await suiteScope.reads.get(recoveryCase.experimentId);
    expect(visible.experiment.readEligibility).toMatchObject({
      state: 'readable',
      code: 'READABLE',
    });
    expect(await suiteScope.policy.run(baselineRun.id)).toMatchObject({
      state: 'readable',
      code: 'READABLE',
    });
    expect(await suiteScope.backtests.statusForRead(baselineRun.id)).toHaveProperty('result');
  });
}
