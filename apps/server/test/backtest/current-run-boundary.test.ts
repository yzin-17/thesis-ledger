import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { deterministicResultChecksum } from '@thesis-ledger/domain';
import type { BacktestResultV3, BacktestSnapshotManifestV3 } from '@thesis-ledger/schemas';
import { BacktestService } from '../../src/backtest/backtest.service.js';
import { StrategyOptimizationRunService } from '../../src/strategy-optimization/strategy-optimization-run.service.js';
import { hashCanonicalManifest } from '../../src/backtest/backtest-snapshot.js';
import { testResultReadPolicy } from './test-result-read-policy.js';
import { runConfig, runConfigV3 } from './v2-execution.fixtures.js';

const currentConfig = runConfigV3(runConfig, 'raw-events');
const snapshot = JSON.parse(
  readFileSync(
    new URL(
      '../../../../packages/schemas/fixtures/backtest-snapshot-v3.manifest.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as BacktestSnapshotManifestV3;
const currentManifest = {
  ...snapshot,
  runId: 'succeeded-run',
  strategyVersionId: 'strategy-version',
  runConfigChecksum: hashCanonicalManifest(currentConfig),
  dataAsOf: currentConfig.dataAsOf,
  dateRange: {
    ...snapshot.dateRange,
    startDate: currentConfig.startDate,
    endDate: currentConfig.endDate,
  },
  executionPriceProtocol: currentConfig.executionPriceProtocol,
  actualSources: snapshot.actualSources.map((source) => ({
    ...source,
    routeKey:
      source.routeKey.kind === 'bar'
        ? { ...source.routeKey, adjustment: 'none' as const }
        : source.routeKey,
  })),
  contentHash: 'a'.repeat(64),
};
currentManifest.contentHash = hashCanonicalManifest(currentManifest);
const currentResult: BacktestResultV3 = {
  source: 'BACKTEST',
  runId: 'succeeded-run',
  strategyVersionId: 'strategy-version',
  snapshotId: currentManifest.contentHash,
  engineVersion: 'engine',
  schemaVersion: '3',
  snapshotVersion: 'snapshot-manifest-v3',
  marketRuleVersion: 'rules',
  calendarVersion: currentManifest.calendarVersion,
  aggregationVersion: currentManifest.aggregationVersion,
  contentHash: currentManifest.contentHash,
  resultChecksum: '2'.repeat(64),
  completeness: 'complete',
  executionPriceProtocol: currentManifest.executionPriceProtocol,
  comparableDataFingerprint: currentManifest.comparableDataFingerprint!,
  actualSources: currentManifest.actualSources,
  warnings: [],
  rejectedOrders: [],
  simulationFills: [],
  trades: [],
  equityCurve: [],
  metrics: {},
};
currentResult.marketRuleVersion = currentManifest.marketRuleVersion;
const { resultChecksum: placeholder, ...resultPayload } = currentResult;
void placeholder;
currentResult.resultChecksum = deterministicResultChecksum(resultPayload);

const currentJob = () => ({
  id: currentManifest.runId,
  strategyVersionId: currentManifest.strategyVersionId,
  mode: 'V3',
  status: 'succeeded',
  input: {
    contractVersion: 3,
    schemaVersion: '3',
    runConfig: currentConfig,
    snapshotId: currentManifest.contentHash,
    snapshotVersion: currentManifest.manifestVersion,
  },
  runConfig: currentConfig,
  snapshotId: currentManifest.contentHash,
  snapshotManifest: currentManifest,
  resultChecksum: currentResult.resultChecksum,
  result: currentResult,
});

const oldRun = {
  id: 'old-run',
  mode: 'V2',
  input: { schemaVersion: '2' },
  status: 'queued',
};

describe('现行 Run 入口', () => {
  it('列表只公开完整的现行合同记录', async () => {
    const findMany = vi.fn(async () => [
      {
        id: 'current-run',
        mode: 'V3',
        status: 'queued',
        input: { contractVersion: 3, schemaVersion: '3', runConfig: currentConfig },
        runConfig: currentConfig,
        snapshotId: null,
        snapshotManifest: null,
        result: null,
      },
      {
        id: 'damaged-run',
        mode: 'V3',
        status: 'queued',
        input: { contractVersion: 3 },
        result: null,
      },
      {
        id: 'old-result',
        mode: 'V3',
        status: 'succeeded',
        input: { contractVersion: 3, schemaVersion: '3', runConfig: currentConfig },
        result: { schemaVersion: '2' },
      },
      currentJob(),
    ]);
    const service = new BacktestService(
      { backtestJob: { findMany } } as never,
      undefined,
      undefined,
      testResultReadPolicy(),
    );
    await expect(service.listCurrentRunSummaries()).resolves.toMatchObject([
      { id: 'current-run' },
      { id: 'succeeded-run' },
    ]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { mode: 'V3' } }));
  });

  it.each([
    'currentRunForRead',
    'runCurrentRunForRead',
    'retryCurrentRunForRead',
    'cancelCurrentRunForRead',
  ] as const)('%s 在旧记录上拒绝且不触发执行或取消', async (operation) => {
    const queue = { cancel: vi.fn() };
    const runs = { runV2: vi.fn(), retryRun: vi.fn() };
    const prisma = { backtestJob: { findUnique: vi.fn(async () => oldRun) } };
    const service = new BacktestService(
      prisma as never,
      queue as never,
      runs as never,
      testResultReadPolicy(),
    );

    await expect(service[operation](oldRun.id)).rejects.toMatchObject({
      response: { code: 'UNSUPPORTED_CONTRACT_VERSION' },
    });
    expect(prisma.backtestJob.findUnique).toHaveBeenCalledOnce();
    expect(queue.cancel).not.toHaveBeenCalled();
    expect(runs.runV2).not.toHaveBeenCalled();
    expect(runs.retryRun).not.toHaveBeenCalled();
  });

  it.each(['runCurrentRunForRead', 'retryCurrentRunForRead', 'cancelCurrentRunForRead'] as const)(
    '%s 在当前模式但旧配置的记录上拒绝且不触发队列或执行',
    async (operation) => {
      const queue = { ensureEnqueued: vi.fn(), cancel: vi.fn() };
      const runs = { runCurrent: vi.fn(), retryRun: vi.fn() };
      const prisma = {
        backtestJob: {
          findUnique: vi.fn(async () => ({
            id: 'damaged-run',
            mode: 'V3',
            status: 'queued',
            input: { contractVersion: 3, schemaVersion: '3', runConfig: currentConfig },
            runConfig: { schemaVersion: '2' },
            snapshotId: null,
            snapshotManifest: null,
            result: null,
          })),
        },
      };
      const service = new BacktestService(
        prisma as never,
        queue as never,
        runs as never,
        testResultReadPolicy(),
      );
      await expect(service[operation]('damaged-run')).rejects.toMatchObject({
        response: { code: 'UNSUPPORTED_CONTRACT_VERSION' },
      });
      expect(prisma.backtestJob.findUnique).toHaveBeenCalledOnce();
      expect(queue.ensureEnqueued).not.toHaveBeenCalled();
      expect(queue.cancel).not.toHaveBeenCalled();
      expect(runs.runCurrent).not.toHaveBeenCalled();
      expect(runs.retryRun).not.toHaveBeenCalled();
    },
  );

  it('读取当前记录时继续执行结果授权', async () => {
    const current = {
      ...oldRun,
      id: 'current-run',
      mode: 'V3',
      input: { contractVersion: 3, schemaVersion: '3', runConfig: currentConfig },
      runConfig: currentConfig,
      snapshotId: null,
      snapshotManifest: null,
    };
    const service = new BacktestService(
      { backtestJob: { findUnique: vi.fn(async () => current) } } as never,
      undefined,
      undefined,
      testResultReadPolicy(),
    );
    await expect(service.currentRunForRead(current.id)).resolves.toMatchObject({
      id: current.id,
      readEligibility: { state: 'readable' },
    });
  });

  it('读取一致的当前 Snapshot 和结果时保留完整成功响应', async () => {
    const current = {
      id: 'succeeded-run',
      strategyVersionId: 'strategy-version',
      mode: 'V3',
      status: 'succeeded',
      input: {
        contractVersion: 3,
        schemaVersion: '3',
        runConfig: currentConfig,
        snapshotId: currentManifest.contentHash,
        snapshotVersion: currentManifest.manifestVersion,
      },
      runConfig: currentConfig,
      snapshotId: currentManifest.contentHash,
      snapshotManifest: currentManifest,
      resultChecksum: currentResult.resultChecksum,
      result: currentResult,
    };
    const service = new BacktestService(
      { backtestJob: { findUnique: vi.fn(async () => current) } } as never,
      undefined,
      undefined,
      testResultReadPolicy(),
    );
    await expect(service.currentRunForRead(current.id)).resolves.toMatchObject({
      id: current.id,
      result: currentResult,
      readEligibility: { state: 'readable' },
    });
  });

  it.each([
    { contractVersion: 3 },
    { schemaVersion: '3' },
    { contractVersion: 2, schemaVersion: '3' },
  ])('模式正确但输入版本不完整时拒绝读取：%j', async (input) => {
    const service = new BacktestService(
      {
        backtestJob: { findUnique: vi.fn(async () => ({ id: 'damaged-run', mode: 'V3', input })) },
      } as never,
      undefined,
      undefined,
      testResultReadPolicy(),
    );
    await expect(service.currentRunForRead('damaged-run')).rejects.toMatchObject({
      response: { code: 'UNSUPPORTED_CONTRACT_VERSION' },
    });
  });

  it.each([
    { status: 'succeeded', result: { schemaVersion: '2' } },
    {
      status: 'queued',
      snapshotId: 'old-snapshot',
      snapshotManifest: { manifestVersion: 'snapshot-manifest-v2' },
    },
    { status: 'queued', runConfig: runConfig },
  ])('当前模式记录带旧结果、旧 Snapshot 或旧配置时拒绝读取：%j', async (override) => {
    const current: Record<string, unknown> & { id: string } = {
      id: 'damaged-run',
      mode: 'V3',
      status: 'queued',
      input: { contractVersion: 3, schemaVersion: '3', runConfig: currentConfig },
      runConfig: currentConfig,
      snapshotId: null,
      snapshotManifest: null,
      result: null,
    };
    Object.assign(current, override);
    const service = new BacktestService(
      { backtestJob: { findUnique: vi.fn(async () => current) } } as never,
      undefined,
      undefined,
      testResultReadPolicy(),
    );
    await expect(service.currentRunForRead(current.id)).rejects.toMatchObject({
      response: { code: 'UNSUPPORTED_CONTRACT_VERSION' },
    });
  });
});

describe('当前冻结内容摘要与归属', () => {
  it.each([
    [
      '结果字段篡改',
      (job: ReturnType<typeof currentJob>) => {
        job.result.warnings = ['伪造指标披露'];
      },
    ],
    [
      'manifest 字段篡改',
      (job: ReturnType<typeof currentJob>) => {
        job.snapshotManifest.calendarVersion = 'forged-calendar';
      },
    ],
    [
      '结果与快照内容身份错配',
      (job: ReturnType<typeof currentJob>) => {
        job.result.contentHash = 'f'.repeat(64);
        const { resultChecksum, ...payload } = job.result;
        void resultChecksum;
        job.resultChecksum = job.result.resultChecksum = deterministicResultChecksum(payload);
      },
    ],
    [
      '重新签名但规则版本错配',
      (job: ReturnType<typeof currentJob>) => {
        job.result.marketRuleVersion = 'forged-rules';
        const { resultChecksum, ...payload } = job.result;
        void resultChecksum;
        job.resultChecksum = job.result.resultChecksum = deterministicResultChecksum(payload);
      },
    ],
  ] as const)('%s 在列表和读取/重试/取消前拒绝且不写入', async (_label, mutate) => {
    const job = structuredClone(currentJob());
    mutate(job);
    const queue = { ensureEnqueued: vi.fn(), cancel: vi.fn() };
    const runs = { retryRun: vi.fn() };
    const prisma = {
      backtestJob: {
        findMany: vi.fn(async () => [job]),
        findUnique: vi.fn(async () => job),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
    };
    const service = new BacktestService(
      prisma as never,
      queue as never,
      runs as never,
      testResultReadPolicy(),
    );
    await expect(service.listCurrentRunSummaries()).resolves.toEqual([]);
    for (const method of [
      'currentRunForRead',
      'runCurrentRunForRead',
      'retryCurrentRunForRead',
      'cancelCurrentRunForRead',
    ] as const) {
      await expect(service[method](job.id)).rejects.toMatchObject({
        response: { code: 'UNSUPPORTED_CONTRACT_VERSION' },
      });
    }
    expect(queue.ensureEnqueued).not.toHaveBeenCalled();
    expect(queue.cancel).not.toHaveBeenCalled();
    expect(runs.retryRun).not.toHaveBeenCalled();
    expect(prisma.backtestJob.update).not.toHaveBeenCalled();
    expect(prisma.backtestJob.updateMany).not.toHaveBeenCalled();
    expect(() =>
      StrategyOptimizationRunService.prototype.evaluateResult.call(
        {} as StrategyOptimizationRunService,
        job as never,
        {},
      ),
    ).toThrow('回测记录不符合现行读取合同');
  });
});
