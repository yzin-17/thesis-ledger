import { Prisma } from '@prisma/client';
import { strategySchema, type BacktestStrategy } from '@thesis-ledger/schemas';
import { describe, expect, it } from 'vitest';
import { ResultReadPolicyService } from '../../src/platform/result-read-policy.service.js';
import { StrategyOptimizationCandidateService } from '../../src/strategy-optimization/strategy-optimization-candidate.service.js';
import { describeStrategyParameters } from '../../src/strategy-optimization/strategy-optimization-parameters.js';
import { StrategyOptimizationReadService } from '../../src/strategy-optimization/strategy-optimization-read.service.js';
import { StrategyOptimizationRunService } from '../../src/strategy-optimization/strategy-optimization-run.service.js';
import { StrategyOptimizationService } from '../../src/strategy-optimization/strategy-optimization.service.js';
import {
  evaluatedAt,
  optimizationPostgresContext,
  strategy,
  suffix,
  symbol,
} from './strategy-optimization-postgres-context.fixture.js';
import { proposal, waitUntil } from './strategy-optimization-postgres-fixtures.js';

const postgresDescribe =
  process.env.RUN_STRATEGY_OPTIMIZATION_POSTGRES_E2E === '1' ? describe : describe.skip;

postgresDescribe('策略风险与 AI 优化 PostgreSQL 服务级 E2E', () => {
  const suiteScope = optimizationPostgresContext();
  registerRiskApplicationLifecycleCase(suiteScope);
  registerOptimizationExecutionCases(suiteScope);
  registerOptimizationLeaseRecoveryCase(suiteScope);
  registerOptimizationAdoptionCase(suiteScope);
});

function registerRiskApplicationLifecycleCase(
  suiteScope: ReturnType<typeof optimizationPostgresContext>,
) {
  it('通过真实 Service 完成风险应用创建、启用、通知更新、扫描、并发唯一、原子升级与回滚', async () => {
    const preview = await suiteScope.riskApplications.preview({
      strategyVersionId: suiteScope.version1Id,
      accountId: suiteScope.accountId,
      symbol,
      cycleMode: 'existingAndFuture',
    });
    expect(preview.plan.rules).toHaveLength(1);
    const created = await suiteScope.riskApplications.create({
      strategyVersionId: suiteScope.version1Id,
      accountId: suiteScope.accountId,
      symbol,
      cycleMode: 'existingAndFuture',
      previewHash: preview.previewHash,
      idempotencyKey: `postgres-e2e-risk-${suffix}-primary`,
      enabled: false,
      notification: {
        enabled: true,
        cooldownMinutes: 60,
        severity: 'warning',
        channels: ['feishu'],
      },
    });
    suiteScope.primaryApplicationId = created.id;
    const enabled = await suiteScope.riskApplications.update(created.id, {
      expectedRevision: 1,
      enabled: true,
    });
    expect(enabled).toMatchObject({ enabled: true, revision: 2 });

    const risk = suiteScope.makeRisk();
    const scan = await risk.scan({ contexts: [] }, { evaluatedAt });
    const sourceRules = await suiteScope.prisma.riskRule.findMany({
      where: { sourcePlanId: created.id, archivedAt: null },
    });
    expect(
      scan.results.some((result) => sourceRules.some((rule) => rule.id === result.ruleId)),
    ).toBe(true);
    const triggerStatesBefore = await suiteScope.prisma.riskRuleTriggerState.findMany({
      where: { ruleId: { in: sourceRules.map((rule) => rule.id) } },
    });
    expect(triggerStatesBefore.length).toBeGreaterThan(0);

    const notificationUpdated = await suiteScope.riskApplications.update(created.id, {
      expectedRevision: 2,
      notification: {
        enabled: true,
        cooldownMinutes: 15,
        severity: 'critical',
        channels: ['feishu'],
      },
    });
    expect(notificationUpdated.revision).toBe(3);
    const triggerStatesAfter = await suiteScope.prisma.riskRuleTriggerState.findMany({
      where: { ruleId: { in: sourceRules.map((rule) => rule.id) } },
    });
    expect(triggerStatesAfter.map((state) => state.id).sort()).toEqual(
      triggerStatesBefore.map((state) => state.id).sort(),
    );
    await expect(
      suiteScope.riskApplications.update(created.id, {
        expectedRevision: 2,
        notification: {
          enabled: true,
          cooldownMinutes: 5,
          severity: 'warning',
          channels: ['feishu'],
        },
      }),
    ).rejects.toThrow('刷新后重试');

    const conflictPreview = await suiteScope.riskApplications.preview({
      strategyVersionId: suiteScope.version1Id,
      accountId: suiteScope.conflictAccountId,
      symbol,
      cycleMode: 'existingAndFuture',
    });
    const [conflictA, conflictB] = await Promise.all([
      suiteScope.riskApplications.create({
        strategyVersionId: suiteScope.version1Id,
        accountId: suiteScope.conflictAccountId,
        symbol,
        cycleMode: 'existingAndFuture',
        previewHash: conflictPreview.previewHash,
        idempotencyKey: `postgres-e2e-risk-${suffix}-conflict-a`,
        enabled: false,
      }),
      suiteScope.riskApplications.create({
        strategyVersionId: suiteScope.version1Id,
        accountId: suiteScope.conflictAccountId,
        symbol,
        cycleMode: 'existingAndFuture',
        previewHash: conflictPreview.previewHash,
        idempotencyKey: `postgres-e2e-risk-${suffix}-conflict-b`,
        enabled: false,
      }),
    ]);
    const concurrentEnable = await Promise.allSettled([
      suiteScope.riskApplications.update(conflictA.id, { expectedRevision: 1, enabled: true }),
      suiteScope.riskApplications.update(conflictB.id, { expectedRevision: 1, enabled: true }),
    ]);
    expect(concurrentEnable.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    expect(concurrentEnable.filter((item) => item.status === 'rejected')).toHaveLength(1);
    const enabledConflictRows = await suiteScope.prisma.$queryRaw<
      Array<{ count: bigint }>
    >(Prisma.sql`
      SELECT COUNT(*)::bigint AS "count" FROM "StrategyRiskApplication"
      WHERE "accountId"=${suiteScope.conflictAccountId}::uuid AND "symbol"=${symbol} AND "enabled"=true AND "archivedAt" IS NULL
    `);
    expect(enabledConflictRows[0]?.count).toBe(1n);

    const upgradePreview = await suiteScope.riskApplications.upgradePreview(
      created.id,
      suiteScope.version2Id,
    );
    expect(upgradePreview.diff.some((item) => item.change === 'changed')).toBe(true);
    expect(upgradePreview.diff.some((item) => item.change === 'added')).toBe(true);
    const beforeFailure = await suiteScope.riskApplications.get(created.id);
    const activeRulesBeforeFailure = await suiteScope.prisma.riskRule.findMany({
      where: { sourcePlanId: created.id, archivedAt: null },
      orderBy: { id: 'asc' },
    });

    await suiteScope.prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION strategy_optimization_e2e_fail_rule() RETURNS trigger AS $$
      BEGIN
        IF NEW."sourcePlanId" = '${created.id}'::uuid THEN
          RAISE EXCEPTION 'forced frozen-rule failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await suiteScope.prisma.$executeRawUnsafe(`
      CREATE TRIGGER strategy_optimization_e2e_fail_rule
      BEFORE INSERT ON "RiskRule"
      FOR EACH ROW EXECUTE FUNCTION strategy_optimization_e2e_fail_rule()
    `);
    await expect(
      suiteScope.riskApplications.upgrade(created.id, {
        expectedRevision: 3,
        targetStrategyVersionId: suiteScope.version2Id,
        previewHash: upgradePreview.previewHash,
        idempotencyKey: `postgres-e2e-risk-${suffix}-forced-rollback`,
      }),
    ).rejects.toThrow('forced frozen-rule failure');
    await suiteScope.prisma.$executeRawUnsafe(
      'DROP TRIGGER strategy_optimization_e2e_fail_rule ON "RiskRule"',
    );
    await suiteScope.prisma.$executeRawUnsafe(
      'DROP FUNCTION strategy_optimization_e2e_fail_rule()',
    );
    const afterFailure = await suiteScope.riskApplications.get(created.id);
    const activeRulesAfterFailure = await suiteScope.prisma.riskRule.findMany({
      where: { sourcePlanId: created.id, archivedAt: null },
      orderBy: { id: 'asc' },
    });
    expect(afterFailure.revision).toBe(beforeFailure.revision);
    expect(afterFailure.strategyVersionId).toBe(beforeFailure.strategyVersionId);
    expect(activeRulesAfterFailure.map((rule) => rule.id)).toEqual(
      activeRulesBeforeFailure.map((rule) => rule.id),
    );

    const upgraded = await suiteScope.riskApplications.upgrade(created.id, {
      expectedRevision: 3,
      targetStrategyVersionId: suiteScope.version2Id,
      previewHash: upgradePreview.previewHash,
      idempotencyKey: `postgres-e2e-risk-${suffix}-upgrade`,
    });
    expect(upgraded).toMatchObject({
      strategyVersionId: suiteScope.version2Id,
      revision: 4,
      enabled: true,
    });
    const upgradedRules = await suiteScope.prisma.riskRule.findMany({
      where: { sourcePlanId: created.id, archivedAt: null },
    });
    expect(upgradedRules).toHaveLength(2);
    expect(
      upgradedRules.every(
        (rule) =>
          rule.parameters && (rule.parameters as Record<string, unknown>).applicationRevision === 4,
      ),
    ).toBe(true);
  });
}
function registerOptimizationExecutionCases(
  suiteScope: ReturnType<typeof optimizationPostgresContext>,
) {
  it('Provider 调用步骤在 PostgreSQL 中 crash-safe：调用前持久化、单 worker、成功去重、过期转 unknown 且预算不重复扣除', async () => {
    const baselineVersion = await suiteScope.prisma.strategyVersion.findUniqueOrThrow({
      where: { id: suiteScope.version2Id },
    });
    const baseline = {
      ...baselineVersion,
      strategy: strategySchema.parse(baselineVersion.schema) as BacktestStrategy,
    };
    const descriptors = describeStrategyParameters(baseline.strategy);
    const runs = new StrategyOptimizationRunService(
      suiteScope.prisma,
      suiteScope.backtests as never,
      suiteScope.configuredRuns as never,
    );
    const route = { provider: suiteScope.provider.id, model: suiteScope.provider.models[0]! };

    const preCallExperimentId = await suiteScope.insertExperiment(suiteScope.version2Id);
    const preCallExperiment = await suiteScope.readExperiment(preCallExperimentId);
    suiteScope.provider.complete.mockImplementationOnce(async () => {
      const attempts = await suiteScope.prisma.$queryRaw<
        Array<{ status: string; aiRunId: string | null }>
      >(Prisma.sql`
        SELECT "status", "aiRunId" FROM "OptimizationAttempt"
        WHERE "experimentId"=${preCallExperimentId}::uuid AND "modelKey"=${`${suiteScope.provider.id}:${suiteScope.provider.models[0]}`} AND "attempt"=1
      `);
      expect(attempts[0]).toMatchObject({ status: 'running', aiRunId: expect.any(String) });
      const aiRun = await suiteScope.prisma.aiRun.findUniqueOrThrow({
        where: { id: attempts[0]!.aiRunId! },
      });
      expect(aiRun).toMatchObject({ status: 'running', leaseUntil: expect.any(Date) });
      return {
        content: proposal,
        inputTokens: 31,
        outputTokens: 17,
        cost: 0,
        costKnown: true,
        actualModel: route.model,
      };
    });
    const candidateService = new StrategyOptimizationCandidateService(
      suiteScope.prisma,
      suiteScope.providers as never,
      runs,
      suiteScope.sdkExecutor,
    );
    const first = await candidateService.generateProposal(
      preCallExperiment,
      baseline,
      descriptors,
      route,
      1,
    );
    expect(first.proposal).toEqual(proposal);
    const afterFirst = await suiteScope.readExperiment(preCallExperimentId);
    expect(afterFirst.aiCallsUsed).toBe(1);
    const aiRunCount = await suiteScope.prisma.aiRun.count({
      where: {
        provider: suiteScope.provider.id,
        modelMetadata: { path: ['optimizationExperimentId'], equals: preCallExperimentId },
      },
    });
    const providerCallsAfterFirst = suiteScope.provider.complete.mock.calls.length;
    const replay = await candidateService.generateProposal(
      await suiteScope.readExperiment(preCallExperimentId),
      baseline,
      descriptors,
      route,
      1,
    );
    expect(replay.aiRunId).toBe(first.aiRunId);
    expect(suiteScope.provider.complete.mock.calls.length).toBe(providerCallsAfterFirst);
    expect(
      await suiteScope.prisma.aiRun.count({
        where: {
          provider: suiteScope.provider.id,
          modelMetadata: { path: ['optimizationExperimentId'], equals: preCallExperimentId },
        },
      }),
    ).toBe(aiRunCount);
    expect((await suiteScope.readExperiment(preCallExperimentId)).aiCallsUsed).toBe(1);

    const concurrentExperimentId = await suiteScope.insertExperiment(suiteScope.version2Id);
    const concurrentExperiment = await suiteScope.readExperiment(concurrentExperimentId);
    let releaseProvider!: () => void;
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const release = new Promise<void>((resolve) => {
      releaseProvider = resolve;
    });
    suiteScope.provider.complete.mockImplementationOnce(async () => {
      markStarted();
      await release;
      return {
        content: proposal,
        inputTokens: 31,
        outputTokens: 17,
        cost: 0,
        costKnown: true,
        actualModel: route.model,
      };
    });
    const workerA = new StrategyOptimizationCandidateService(
      suiteScope.prisma,
      suiteScope.providers as never,
      runs,
      suiteScope.sdkExecutor,
    );
    const workerB = new StrategyOptimizationCandidateService(
      suiteScope.prisma,
      suiteScope.providers as never,
      runs,
      suiteScope.sdkExecutor,
    );
    const running = workerA.generateProposal(concurrentExperiment, baseline, descriptors, route, 1);
    await started;
    await expect(
      workerB.generateProposal(
        await suiteScope.readExperiment(concurrentExperimentId),
        baseline,
        descriptors,
        route,
        1,
      ),
    ).rejects.toThrow(/正在由其他 Worker|未取得执行权/u);
    releaseProvider();
    await running;
    expect((await suiteScope.readExperiment(concurrentExperimentId)).aiCallsUsed).toBe(1);
    expect(
      await suiteScope.prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS "count" FROM "OptimizationAttempt" WHERE "experimentId"=${concurrentExperimentId}::uuid
    `),
    ).toEqual([{ count: 1n }]);

    const crashedExperimentId = await suiteScope.insertExperiment(suiteScope.version2Id, {
      aiCallsUsed: 1,
      inputTokensUsed: 31,
      outputTokensUsed: 17,
    });
    const crashedAiRun = await suiteScope.prisma.aiRun.create({
      data: {
        provider: suiteScope.provider.id,
        model: route.model,
        promptVersion: 'strategy-optimization-v1',
        status: 'running',
        executionAttempt: 1,
        claimedAt: new Date(Date.now() - 120_000),
        leaseUntil: new Date(Date.now() - 60_000),
        startedAt: new Date(Date.now() - 120_000),
        modelMetadata: { optimizationExperimentId: crashedExperimentId, round: 1 },
      },
    });
    await suiteScope.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "OptimizationAttempt" (
        "experimentId", "modelKey", "aiRunId", "attempt", "status", "startedAt", "leaseUntil"
      ) VALUES (
        ${crashedExperimentId}::uuid, ${`${suiteScope.provider.id}:${route.model}`}, ${crashedAiRun.id}::uuid, 1,
        'running', ${new Date(Date.now() - 120_000)}, ${new Date(Date.now() - 60_000)}
      )
    `);
    const callsBeforeRecovery = suiteScope.provider.complete.mock.calls.length;
    await expect(
      candidateService.generateProposal(
        await suiteScope.readExperiment(crashedExperimentId),
        baseline,
        descriptors,
        route,
        1,
      ),
    ).rejects.toThrow(/结果未知|禁止自动重试/u);
    const recoveredAttempt = await suiteScope.prisma.$queryRaw<
      Array<{ status: string }>
    >(Prisma.sql`
      SELECT "status" FROM "OptimizationAttempt" WHERE "experimentId"=${crashedExperimentId}::uuid AND "attempt"=1
    `);
    expect(recoveredAttempt[0]?.status).toBe('unknown_outcome');
    expect(
      (await suiteScope.prisma.aiRun.findUniqueOrThrow({ where: { id: crashedAiRun.id } })).status,
    ).toBe('failed');
    await expect(
      candidateService.generateProposal(
        await suiteScope.readExperiment(crashedExperimentId),
        baseline,
        descriptors,
        route,
        2,
      ),
    ).rejects.toThrow('unknown_outcome');
    expect(suiteScope.provider.complete.mock.calls.length).toBe(callsBeforeRecovery);
    expect((await suiteScope.readExperiment(crashedExperimentId)).aiCallsUsed).toBe(1);
  });
}
function registerOptimizationAdoptionCase(
  suiteScope: ReturnType<typeof optimizationPostgresContext>,
) {
  it('正式采纳同 key 并发幂等、不同 key 禁止重复候选、expectedVersion fail-closed，并验证失败事务不留半套 Adoption', async () => {
    const runs = new StrategyOptimizationRunService(
      suiteScope.prisma,
      suiteScope.backtests as never,
      suiteScope.configuredRuns as never,
    );
    const candidateService = new StrategyOptimizationCandidateService(
      suiteScope.prisma,
      suiteScope.providers as never,
      runs,
      suiteScope.sdkExecutor,
    );
    const reads = new StrategyOptimizationReadService(
      suiteScope.prisma,
      suiteScope.providers as never,
      new ResultReadPolicyService(suiteScope.prisma),
    );
    const optimizer = new StrategyOptimizationService(
      suiteScope.prisma,
      suiteScope.providers as never,
      candidateService,
      reads,
      runs,
      suiteScope.riskApplications,
    );

    const concurrentCandidate = await suiteScope.insertAdoptableCandidate(
      suiteScope.version2Id,
      -20,
      strategy('0.09', '0.20'),
    );
    const currentBeforeConcurrent = await suiteScope.prisma.strategyVersion.aggregate({
      where: { strategyId: suiteScope.strategyId, version: { gt: 0 } },
      _max: { version: true },
    });
    const expectedBeforeConcurrent = currentBeforeConcurrent._max.version ?? 0;
    const concurrentInput = {
      candidateId: concurrentCandidate.candidateId,
      candidateHash: concurrentCandidate.hash,
      expectedStrategyVersion: expectedBeforeConcurrent,
      idempotencyKey: `postgres-e2e-adoption-${suffix}-concurrent`,
      acknowledgeTestExposure: false,
    };
    const concurrent = await Promise.all([
      optimizer.adopt(concurrentCandidate.experimentId, concurrentInput),
      optimizer.adopt(concurrentCandidate.experimentId, concurrentInput),
    ]);
    expect(concurrent[0].strategyVersion?.id).toBe(concurrent[1].strategyVersion?.id);
    expect(concurrent[0].strategyVersion?.version).toBe(expectedBeforeConcurrent + 1);
    const retryAfterCommittedResponseLoss = await optimizer.adopt(
      concurrentCandidate.experimentId,
      concurrentInput,
    );
    expect(retryAfterCommittedResponseLoss.strategyVersion?.id).toBe(
      concurrent[0].strategyVersion?.id,
    );
    await expect(
      optimizer.adopt(concurrentCandidate.experimentId, {
        ...concurrentInput,
        idempotencyKey: `postgres-e2e-adoption-${suffix}-different-intent`,
      }),
    ).rejects.toThrow('已经被正式采纳');

    const staleCandidate = await suiteScope.insertAdoptableCandidate(
      suiteScope.version2Id,
      -21,
      strategy('0.10', '0.20'),
    );
    await expect(
      optimizer.adopt(staleCandidate.experimentId, {
        candidateId: staleCandidate.candidateId,
        candidateHash: staleCandidate.hash,
        expectedStrategyVersion: expectedBeforeConcurrent,
        idempotencyKey: `postgres-e2e-adoption-${suffix}-stale-version`,
        acknowledgeTestExposure: false,
      }),
    ).rejects.toThrow('正式策略已经发布新版本');
    const staleAdoptions = await suiteScope.prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS "count" FROM "OptimizationAdoption" WHERE "candidateId"=${staleCandidate.candidateId}::uuid
    `);
    expect(staleAdoptions[0]?.count).toBe(0n);

    const raceA = await suiteScope.insertAdoptableCandidate(
      suiteScope.version2Id,
      -22,
      strategy('0.11', '0.20'),
    );
    const raceB = await suiteScope.insertAdoptableCandidate(
      suiteScope.version2Id,
      -23,
      strategy('0.12', '0.20'),
    );
    const currentBeforeRace = await suiteScope.prisma.strategyVersion.aggregate({
      where: { strategyId: suiteScope.strategyId, version: { gt: 0 } },
      _max: { version: true },
    });
    const expectedBeforeRace = currentBeforeRace._max.version ?? 0;
    const race = await Promise.allSettled([
      optimizer.adopt(raceA.experimentId, {
        candidateId: raceA.candidateId,
        candidateHash: raceA.hash,
        expectedStrategyVersion: expectedBeforeRace,
        idempotencyKey: `postgres-e2e-adoption-${suffix}-race-a`,
        acknowledgeTestExposure: false,
      }),
      optimizer.adopt(raceB.experimentId, {
        candidateId: raceB.candidateId,
        candidateHash: raceB.hash,
        expectedStrategyVersion: expectedBeforeRace,
        idempotencyKey: `postgres-e2e-adoption-${suffix}-race-b`,
        acknowledgeTestExposure: false,
      }),
    ]);
    expect(race.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    expect(race.filter((item) => item.status === 'rejected')).toHaveLength(1);
    const raceAdoptions = await suiteScope.prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS "count" FROM "OptimizationAdoption"
      WHERE "candidateId" IN (${raceA.candidateId}::uuid, ${raceB.candidateId}::uuid)
    `);
    expect(raceAdoptions[0]?.count).toBe(1n);

    const cancelledExperimentId = await suiteScope.insertExperiment(suiteScope.version2Id, {
      status: 'queued',
      stage: 'preparing',
    });
    const cancelled = await optimizer.cancel(cancelledExperimentId);
    expect(cancelled.status).toBe('cancelled');
    const beforeReconcile = await suiteScope.prisma.strategyVersion.findUniqueOrThrow({
      where: { id: suiteScope.version2Id },
    });
    await optimizer.reconcilePending();
    expect((await suiteScope.readExperiment(cancelledExperimentId)).status).toBe('cancelled');
    expect(
      (
        await suiteScope.prisma.strategyVersion.findUniqueOrThrow({
          where: { id: suiteScope.version2Id },
        })
      ).id,
    ).toBe(beforeReconcile.id);
    expect((await suiteScope.riskApplications.get(suiteScope.primaryApplicationId)).enabled).toBe(
      true,
    );
    await expect(
      suiteScope.prisma.strategyVersion.delete({ where: { id: suiteScope.version2Id } }),
    ).rejects.toThrow();
  });
}

function registerOptimizationLeaseRecoveryCase(
  suiteScope: ReturnType<typeof optimizationPostgresContext>,
) {
  it('过期 Experiment 由 reconciler 恢复到候选与封存测试，再正式采纳并返回风险应用差异', async () => {
    suiteScope.provider.complete.mockImplementation(async () => ({
      content: proposal,
      inputTokens: 31,
      outputTokens: 17,
      cost: 0,
      costKnown: true,
      actualModel: 'optimizer-model',
    }));
    const runs = new StrategyOptimizationRunService(
      suiteScope.prisma,
      suiteScope.backtests as never,
      suiteScope.configuredRuns as never,
    );
    const candidateService = new StrategyOptimizationCandidateService(
      suiteScope.prisma,
      suiteScope.providers as never,
      runs,
      suiteScope.sdkExecutor,
    );
    const reads = new StrategyOptimizationReadService(
      suiteScope.prisma,
      suiteScope.providers as never,
      new ResultReadPolicyService(suiteScope.prisma),
    );
    const optimizer = new StrategyOptimizationService(
      suiteScope.prisma,
      suiteScope.providers as never,
      candidateService,
      reads,
      runs,
      suiteScope.riskApplications,
    );
    const experimentId = await suiteScope.insertExperiment(suiteScope.version2Id, {
      status: 'running',
      stage: 'proposing',
      leaseUntil: new Date(Date.now() - 60_000),
    });
    const recovery = await optimizer.reconcilePending();
    expect(recovery.scheduled).toBeGreaterThanOrEqual(1);
    await waitUntil(async () => {
      const current = await suiteScope.readExperiment(experimentId);
      if (current.status === 'failed') throw new Error(current.stopReason ?? '实验恢复失败');
      return current.status === 'awaiting_finalization';
    });
    const candidates = await reads.candidates(experimentId);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      validationStatus: 'restricted',
      readEligibility: { code: 'TEST_NOT_REVEALED' },
    });
    const stored = await suiteScope.prisma.$queryRaw<
      Array<{ validationStatus: string }>
    >(Prisma.sql`
      SELECT "validationStatus" FROM "OptimizationCandidate" WHERE "id"=${candidates[0]!.id}::uuid
    `);
    expect(stored[0]?.validationStatus).toBe('valid');

    await optimizer.finalize(experimentId, {
      candidateIds: [candidates[0]!.id],
      selectedCandidateId: candidates[0]!.id,
      expectedStage: 'awaiting_finalization',
    });
    const finalized = await suiteScope.readExperiment(experimentId);
    expect(finalized).toMatchObject({ status: 'succeeded', stage: 'completed' });
    const finalizedCandidate = (await reads.candidates(experimentId))[0]!;
    expect(finalizedCandidate.validationStatus).toBe('test_valid');

    const adoptionInput = {
      candidateId: finalizedCandidate.id,
      candidateHash: finalizedCandidate.executionHash,
      expectedStrategyVersion: 2,
      idempotencyKey: `postgres-e2e-adoption-${suffix}-recovery`,
      acknowledgeTestExposure: false,
    };
    const adopted = await optimizer.adopt(experimentId, adoptionInput);
    expect(adopted.strategyVersion?.version).toBe(3);
    const repeated = await optimizer.adopt(experimentId, adoptionInput);
    expect(repeated.strategyVersion?.id).toBe(adopted.strategyVersion?.id);
    expect(repeated).toEqual(adopted);
    const diffs = await suiteScope.riskApplications.planDiffsForTargetVersion(
      adopted.strategyVersion!.id,
    );
    const primaryDiff = diffs.find(
      (item) => item.applicationId === suiteScope.primaryApplicationId,
    );
    expect(primaryDiff).toBeDefined();
    expect(primaryDiff?.diff.some((item) => item.change === 'changed')).toBe(true);
    expect(
      (await suiteScope.riskApplications.get(suiteScope.primaryApplicationId)).strategyVersionId,
    ).toBe(suiteScope.version2Id);
  });
}
