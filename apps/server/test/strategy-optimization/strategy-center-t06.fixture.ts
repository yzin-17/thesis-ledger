import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { expect, vi } from 'vitest';
import { runConfigSchemaV3, type RunConfigV3 } from '@thesis-ledger/schemas';
import type { PrismaService } from '../../src/platform/prisma.service.js';
import type { StrategyOptimizationReadService } from '../../src/strategy-optimization/strategy-optimization-read.service.js';
import type { ResultReadPolicyService } from '../../src/platform/result-read-policy.service.js';
import type { BacktestService } from '../../src/backtest/backtest.service.js';
import type { ExperimentRow } from '../../src/strategy-optimization/strategy-optimization-common.js';
import { completedOptimizationRun } from './strategy-optimization-postgres-run.fixture.js';
import { completeSnapshotFixture } from '../backtest/v3-complete-snapshot-fixtures.js';
export const suffix = `t06-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const split = {
  development: { start: '2026-01-01', end: '2026-04-30' },
  validation: { start: '2026-05-01', end: '2026-07-31' },
  test: { start: '2026-08-01', end: '2026-09-10' },
};

export const runConfig = {
  startDate: '2026-01-01',
  endDate: '2026-09-10',
  dataAsOf: '2026-09-11T08:00:00.000Z',
  baseCurrency: 'CNY',
  initialCash: { CNY: '100000' },
};

export const objective = { mode: 'balanced', minClosedTrades: 0 };

export const budget = {
  maxAiCalls: 5,
  maxBacktestRuns: 10,
  maxInputTokens: 100_000,
  maxOutputTokens: 10_000,
  maxDurationSeconds: 600,
};

export type FakeRun = {
  id: string;
  strategyVersionId: string;
  status: 'succeeded';
  result: Record<string, unknown>;
  fingerprint: string;
};

export type TestCase = {
  experimentId: string;
  name: string;
  candidateIds: string[];
  selectedCandidateId: string;
};

export function createT06RunPersistence(scope: {
  prisma: PrismaService;
  currentRunConfig: RunConfigV3;
  createdRunIds: string[];
  runsById: Map<string, FakeRun>;
}) {
  return async (
    strategyVersionId: string,
    experimentId: string,
    identity: string,
    fingerprint: string,
    id = randomUUID(),
  ) => {
    const current = completedOptimizationRun({
      id,
      strategyVersionId,
      idempotencyKey: `optimization:${experimentId}:${identity}`,
      runConfig: scope.currentRunConfig,
    });
    const result = current.result;
    await scope.prisma.backtestJob.create({
      data: {
        ...current,
        idempotencyKey: `optimization:${experimentId}:${identity}`,
        status: 'succeeded',
        progress: 100,
        periodStart: new Date('2026-01-01T00:00:00.000Z'),
        periodEnd: new Date('2026-09-10T00:00:00.000Z'),
        dataAsOf: new Date('2026-09-11T08:00:00.000Z'),
        input: JSON.parse(JSON.stringify(current.input)),
        runConfig: JSON.parse(JSON.stringify(current.runConfig)),
        result: result as Prisma.InputJsonValue,
        warnings: [],
        snapshotManifest: JSON.parse(JSON.stringify(current.snapshotManifest)),
        finishedAt: new Date(),
      },
    });
    const run: FakeRun = { id, strategyVersionId, status: 'succeeded', result, fingerprint };
    scope.createdRunIds.push(id);
    scope.runsById.set(id, run);
    return run;
  };
}

export function createT06RunExecution(scope: {
  primaryCandidateBId: string;
  failPrimaryCandidateB: boolean;
  invalidatePrimaryCandidateB: boolean;
  runsByIdentity: Map<string, FakeRun>;
  runsById: Map<string, FakeRun>;
  persistRun: ReturnType<typeof createT06RunPersistence>;
}) {
  return {
    executeRun: vi.fn(
      async (
        experiment: ExperimentRow,
        strategyVersionId: string,
        _splitName: string,
        identity: string,
      ) => {
        if (
          identity === `candidate-final:${scope.primaryCandidateBId}` &&
          scope.failPrimaryCandidateB
        ) {
          scope.failPrimaryCandidateB = false;
          throw new Error('受控封存测试技术失败');
        }
        const previous = scope.runsByIdentity.get(`${experiment.id}:${identity}`);
        if (previous) return previous;
        const frozenFingerprint = (experiment.frozenDataFingerprints as Record<string, unknown>)
          .test;
        let fingerprint =
          typeof frozenFingerprint === 'string' ? frozenFingerprint : 't06-frozen-fingerprint';
        if (
          identity === `candidate-final:${scope.primaryCandidateBId}` &&
          scope.invalidatePrimaryCandidateB
        )
          fingerprint = 't06-different-fingerprint';
        if (identity === `candidate-final:${scope.primaryCandidateBId}`)
          scope.invalidatePrimaryCandidateB = false;
        const run = await scope.persistRun(strategyVersionId, experiment.id, identity, fingerprint);
        scope.runsByIdentity.set(`${experiment.id}:${identity}`, run);
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
      const run = scope.runsById.get(id);
      if (!run) throw new Error(`${label}冻结 Run 不可访问`);
      return run;
    }),
  };
}

export function createT06CaseInsertion(scope: {
  prisma: PrismaService;
  baselineVersionId: string;
  createdExperimentIds: string[];
  createdCandidateIds: string[];
}) {
  return async (input: {
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
    scope.createdExperimentIds.push(experimentId);
    scope.createdCandidateIds.push(...candidateIds);
    const baselineRunRefs = input.baselineRunId ? { test: input.baselineRunId } : {};
    const baselineMetrics = input.baselineMetrics ?? {};
    const frozenDataFingerprints = input.frozenFingerprint ? { test: input.frozenFingerprint } : {};
    await scope.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "OptimizationExperiment" (
        "id", "name", "sourceMode", "baselineStrategyVersionId", "status", "stage", "objective",
        "allowedParameterIds", "split", "runConfig", "dataFingerprint", "modelConfig", "budget", "maxRounds",
        "baselineRunRefs", "baselineMetrics", "frozenDataFingerprints", "lockedCandidateIds", "selectedCandidateId",
        "testExposedAt", "exposure", "leaseUntil", "executionAttempt", "idempotencyKey"
      ) VALUES (
        ${experimentId}::uuid, ${input.name}, 'existing', ${scope.baselineVersionId}::uuid,
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
      await scope.prisma.$executeRaw(Prisma.sql`
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
}

export function createT06HiddenReadAssertion(scope: {
  reads: StrategyOptimizationReadService;
  policy: ResultReadPolicyService;
  backtests: BacktestService;
}) {
  return async (testCase: TestCase, runId: string) => {
    const detail = await scope.reads.get(testCase.experimentId);
    expect(detail.experiment.readEligibility).toMatchObject({
      state: 'restricted',
      code: 'TEST_NOT_REVEALED',
    });
    expect(detail.experiment.baselineRunRefs).not.toHaveProperty('test');
    expect(detail.experiment.baselineMetrics).not.toHaveProperty('test');
    expect(
      detail.candidates.every((candidate) => candidate.readEligibility.state === 'restricted'),
    ).toBe(true);
    expect(detail.candidates.every((candidate) => !('test' in (candidate.metrics as object)))).toBe(
      true,
    );

    const compared = await scope.reads.compare(testCase.experimentId);
    expect(compared.experiment.readEligibility).toMatchObject({
      state: 'restricted',
      code: 'TEST_NOT_REVEALED',
    });
    expect(compared.candidates.every((candidate) => candidate.validationScore === null)).toBe(true);

    const groups = await scope.reads.listBacktestGroups({ search: testCase.name });
    const group = groups.items.find((item) => item.experimentId === testCase.experimentId);
    expect(group).toBeDefined();
    expect(group?.jobs.every((job) => job.readEligibility?.state === 'restricted')).toBe(true);

    expect(await scope.policy.run(runId)).toMatchObject({
      state: 'restricted',
      code: 'TEST_NOT_REVEALED',
    });
    const direct = await scope.backtests.statusForRead(runId);
    expect(direct).toMatchObject({
      readEligibility: { state: 'restricted', code: 'TEST_NOT_REVEALED' },
    });
    expect(direct).not.toHaveProperty('result');
  };
}
export async function initializeT06Fixture(
  prisma: PrismaService,
  strategyId: string,
  state: {
    currentRunConfig: RunConfigV3;
    baselineVersionId: string;
    candidateVersionAId: string;
    candidateVersionBId: string;
    candidateVersionCId: string;
  },
) {
  const fixture = await completeSnapshotFixture();
  const model = fixture.input.runConfig.executionModel!;
  model.scope.range = { start: runConfig.startDate, end: runConfig.endDate };
  for (const segment of model.segments) segment.range = model.scope.range;
  state.currentRunConfig = runConfigSchemaV3.parse({ ...fixture.input.runConfig, ...runConfig });
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
  state.baselineVersionId = versions[0]!.id;
  state.candidateVersionAId = versions[1]!.id;
  state.candidateVersionBId = versions[2]!.id;
  state.candidateVersionCId = versions[3]!.id;
}
