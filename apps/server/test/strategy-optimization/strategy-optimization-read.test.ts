import { describe, expect, it, vi } from 'vitest';
import type { ExperimentReadRow } from '../../src/strategy-optimization/strategy-optimization-common.js';
import { StrategyOptimizationReadService } from '../../src/strategy-optimization/strategy-optimization-read.service.js';
import { ResultReadPolicyService } from '../../src/platform/result-read-policy.service.js';

const uuid = (number: number) => `00000000-0000-4000-8000-${number.toString(16).padStart(12, '0')}`;

const experimentRows = Array.from(
  { length: 151 },
  (_, index) =>
    ({
      id: uuid(index + 1),
      ownerKey: 'local-user',
      name: null,
      sourceMode: 'discovery',
      discoveryScope: {
        executionInstrument: { symbol: '600519.SH', market: 'CN', assetType: 'stock' },
        primaryTimeframe: '1d',
      },
      strategySpaceVersion: 'strategy-space-v1',
      baselineStrategyVersionId: uuid(index + 1000),
      status: 'queued',
      stage: 'preparing',
      objective: {},
      allowedParameterIds: [],
      split: {},
      runConfig: {},
      dataFingerprint: `fingerprint-${index}`,
      modelConfig: [],
      budget: {},
      maxRounds: 1,
      aiCallsUsed: 0,
      backtestRunsUsed: 0,
      inputTokensUsed: 0,
      outputTokensUsed: 0,
      pausedDurationMs: 0,
      costUsed: 0,
      baselineRunRefs: {},
      baselineMetrics: {},
      frozenDataFingerprints: {},
      lockedCandidateIds: null,
      selectedCandidateId: null,
      testExposedAt: null,
      exposure: null,
      stopReason: null,
      cancelRequestedAt: null,
      leaseUntil: null,
      executionAttempt: 0,
      idempotencyKey: `idempotency-${index}`,
      createdAt: new Date('2026-09-18T00:00:00.000Z'),
      updatedAt: new Date('2026-09-18T00:00:00.000Z'),
      strategyId: null,
      strategyName: null,
      strategyVersion: null,
      strategySchemaVersion: null,
    }) as unknown as ExperimentReadRow,
);

describe('StrategyOptimizationReadService experiment pagination', () => {
  it('traverses 151 same-time experiments with a stable id tie-breaker', async () => {
    let rowPage = 0;
    let call = 0;
    const prisma = {
      $queryRaw: vi.fn(async () => {
        if (call++ % 2 === 0) {
          const start = rowPage * 100;
          rowPage += 1;
          return experimentRows.slice(start, start + 101);
        }
        return [{ count: BigInt(experimentRows.length) }];
      }),
    };
    const service = new StrategyOptimizationReadService(
      prisma as never,
      { list: () => [] } as never,
      new ResultReadPolicyService({} as never),
    );

    const first = await service.list({ limit: 100 });
    const second = await service.list({
      limit: 100,
      cursor: first.pageInfo.nextCursor ?? undefined,
    });
    const ids = [...first.items, ...second.items].map((item) => item.id);

    expect(first.items).toHaveLength(100);
    expect(second.items).toHaveLength(51);
    expect(new Set(ids).size).toBe(151);
    expect(first.totalCount).toBe(151);
    expect(second.totalCount).toBe(151);
    expect(first.items[0]?.nameSource).toBe('legacy_fallback');
    expect(first.items[0]?.source.kind).toBe('discovery');
    expect(first.items[0]?.tradingCost).toEqual({
      source: 'discovery_seed',
      commissionRate: '0',
      slippageRate: '0',
      isAssumption: true,
      zeroDoesNotMeanFree: true,
    });
  });
});

describe('StrategyOptimizationReadService AI attempt projection', () => {
  it('does not return raw model metadata from optimization detail', async () => {
    const service = new StrategyOptimizationReadService(
      {} as never,
      { list: () => [] } as never,
      new ResultReadPolicyService({} as never),
    );
    vi.spyOn(service, 'experiment').mockResolvedValue({
      ...experimentRows[0],
      costUsed: null,
      costSummary: {
        status: 'unavailable',
        currency: null,
        knownAmount: null,
        knownByCurrency: [],
        reason: 'historical_missing_metadata',
      },
      name: '从零探索实验',
      nameSource: 'legacy_fallback',
      source: { kind: 'discovery', experimentId: experimentRows[0]!.id },
      readEligibility: { state: 'readable' },
      tradingCost: {
        source: 'discovery_seed',
        commissionRate: '0',
        slippageRate: '0',
        isAssumption: true,
        zeroDoesNotMeanFree: true,
      },
    } as never);
    vi.spyOn(service, 'candidates').mockResolvedValue([]);
    vi.spyOn(service, 'attempts').mockResolvedValue([
      {
        id: uuid(9000),
        experimentId: experimentRows[0]!.id,
        modelKey: 'fixture:model',
        aiRunId: uuid(9001),
        attempt: 1,
        status: 'succeeded',
        proposal: {},
        error: null,
        startedAt: null,
        leaseUntil: null,
        completedAt: null,
        createdAt: new Date('2026-09-19T00:00:00.000Z'),
        inputTokens: 10,
        outputTokens: 5,
        cost: null,
        durationMs: 100,
        modelMetadata: {
          costStatus: 'unknown',
          costCurrency: 'USD',
          prompt: 'must-not-leak',
          credential: 'must-not-leak',
        },
      },
    ]);

    const detail = await service.get(experimentRows[0]!.id);

    expect(detail.attempts[0]).toMatchObject({
      modelMetadata: { costStatus: 'unknown', costCurrency: 'USD' },
      execution: null,
      usageCompleteness: 'legacy_unknown',
    });
    expect(JSON.stringify(detail)).not.toContain('must-not-leak');
  });
});

describe('StrategyOptimizationReadService backtest grouping', () => {
  it('can locate one exact job without broad client-side history scans', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = {
      backtestJob: { findMany },
      strategyVersion: { findMany: vi.fn().mockResolvedValue([]) },
      $queryRaw: vi.fn().mockResolvedValue([]),
    };
    const service = new StrategyOptimizationReadService(
      prisma as never,
      { list: () => [] } as never,
      { protectBacktestJobs: async (jobs: unknown) => jobs } as never,
    );

    const jobId = uuid(5000);
    const page = await service.listBacktestGroups({ jobId, limit: 1 });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: jobId }) }),
    );
    expect(page).toEqual({
      items: [],
      totalCount: 0,
      pageInfo: { hasNextPage: false, nextCursor: null },
    });
  });

  it('uses the exact stored strategy version as a searchable user-task identity', async () => {
    const jobId = uuid(6000);
    const strategyVersionId = uuid(6001);
    const backtestJob = {
      id: jobId,
      strategyVersionId,
      mode: 'V2',
      status: 'succeeded',
      stage: 'succeeded',
      progress: 100,
      periodStart: new Date('2025-01-01T00:00:00.000Z'),
      periodEnd: new Date('2025-12-31T00:00:00.000Z'),
      dataAsOf: new Date('2026-01-01T00:00:00.000Z'),
      warnings: [],
      cancelRequestedAt: null,
      executionAttempt: 1,
      dispatchedAt: new Date('2026-01-01T00:00:00.000Z'),
      errorCode: null,
      errorSummary: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      startedAt: new Date('2026-01-01T00:00:00.000Z'),
      finishedAt: new Date('2026-01-01T00:01:00.000Z'),
      engineVersion: 'engine-1',
      resultChecksum: 'checksum',
      snapshotId: 'snapshot',
      diagnostics: null,
      input: null,
    };
    const prisma = {
      backtestJob: { findMany: vi.fn().mockResolvedValue([backtestJob]) },
      strategyVersion: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: strategyVersionId,
            version: 4,
            schemaVersion: 2,
            strategy: { id: uuid(6002), name: '均线趋势策略' },
          },
        ]),
      },
      $queryRaw: vi.fn().mockResolvedValue([]),
    };
    const service = new StrategyOptimizationReadService(
      prisma as never,
      { list: () => [] } as never,
      { protectBacktestJobs: async (jobs: unknown) => jobs } as never,
    );

    const page = await service.listBacktestGroups({ search: '均线', limit: 10 });

    expect(page.items[0]).toMatchObject({
      id: jobId,
      kind: 'user',
      name: '均线趋势策略 · v4',
      source: {
        kind: 'existing',
        strategyVersionId,
        strategyName: '均线趋势策略',
        version: 4,
      },
    });
  });
});
