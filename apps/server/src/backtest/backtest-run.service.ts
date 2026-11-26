import {
  BadRequestException,
  Inject,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma, type BacktestJob } from '@prisma/client';
import { PrismaService } from '../platform/prisma.service.js';
import { BacktestQueueService } from './backtest-queue.service.js';
import { LocalSnapshotStore } from './backtest-snapshot.js';
import { fingerprintBacktestRunData, type ComparableDataFingerprintRange } from './backtest-comparable-run-data.js';
import { runBacktestAttempt } from './backtest-run-attempt.js';
import { backtestRunnerIdentity, backtestHasExecutionHistory } from './backtest-indicator-engine-version.js';
import type {
  BacktestSnapshotV3BuildInput,
  BacktestSnapshotV3BuildResult,
} from './backtest-snapshot-v3-builder.js';
import {
  BacktestSnapshotUnavailableError,
  BacktestV3RunLifecycle,
  persistedRunContract,
} from './backtest-v3-run-lifecycle.js';
import { prepareBacktestManualRetry } from './backtest-retry-budget.js';
import {
  executeBacktestV3Run,
  loadVerifiedBacktestV3Snapshot,
  stockSnapshotStoreForJob,
} from './backtest-v3-run-execution.js';
import { BACKTEST_V3_RUNNER, type BacktestV3Runner } from './backtest-v3-runner.js';
import { BacktestCreationGuardService } from './backtest-creation-guard.service.js';
import { BacktestNavRunExecution } from './backtest-nav-run-execution.js';
import { isNavBacktestInput } from './backtest-nav-run-read.js';
import { verifyBacktestRunRetrySnapshot } from './backtest-nav-run-retry.js';
import { classifyBacktestRunFailure } from './backtest-run-failure.js';
import { materializeStockBacktest } from './backtest-stock-materialization.js';
import { advanceBacktestStage } from './backtest-materialization-publication.js';
import { createBacktestRunnerReplay, materializeStockRunnerReplay } from './backtest-runner-replay.js';

export interface BacktestSnapshotBuilder {
  buildV3(input: BacktestSnapshotV3BuildInput, snapshots?: LocalSnapshotStore): Promise<BacktestSnapshotV3BuildResult>;
}

export const BACKTEST_SNAPSHOT_BUILDER = Symbol('BACKTEST_SNAPSHOT_BUILDER');

export interface BacktestExecutionAttempt {
  attempt: number;
  maxAttempts: number;
}

export type { ComparableDataFingerprintRange } from './backtest-comparable-run-data.js';

export class BacktestRunService {
  private readonly activeControllers = new Map<string, AbortController>();

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() @Inject(BacktestQueueService) private readonly queueService?: BacktestQueueService,
    @Optional() @Inject(LocalSnapshotStore) private readonly snapshotStore?: LocalSnapshotStore,
    @Optional()
    @Inject(BACKTEST_SNAPSHOT_BUILDER)
    private readonly snapshotBuilder?: BacktestSnapshotBuilder,
    @Optional()
    @Inject(BACKTEST_V3_RUNNER)
    private readonly defaultV3Runner?: BacktestV3Runner,
    @Optional()
    @Inject(BacktestCreationGuardService)
    private readonly creationGuard?: BacktestCreationGuardService,
    @Optional()
    @Inject(BacktestNavRunExecution)
    private readonly navExecution?: BacktestNavRunExecution,
  ) {}

  private snapshotStoreForRun(): LocalSnapshotStore {
    return (
      this.snapshotStore ??
      new LocalSnapshotStore(process.env.BACKTEST_SNAPSHOT_ROOT ?? 'var/backtest')
    );
  }

  abortActiveRun(id: string): boolean {
    const controller = this.activeControllers.get(id);
    if (!controller) return false;
    controller.abort();
    return true;
  }

  async createRun(input: unknown) {
    const request =
      input !== null && typeof input === 'object' && !Array.isArray(input)
        ? (input as Record<string, unknown>)
        : undefined;
    if (request?.contractVersion !== 1) {
      throw new BadRequestException({
        code: 'UNSUPPORTED_CONTRACT_VERSION',
        message: '只支持现行回测合同',
      });
    }
    return new BacktestV3RunLifecycle(
      this.prisma,
      this.snapshotBuilder,
      this.queueService,
      this.defaultV3Runner !== undefined,
      this.creationGuard,
    ).create(input);
  }

  async runCurrent(id: string, execution?: BacktestExecutionAttempt) {
    const job = await this.prisma.backtestJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('回测 Run 不存在');
    if (job.errorCode === 'PREPARATION_FAILED')
      throw new BadRequestException('准备阶段失败，请返回原策略重新创建回测。');
    if (!persistedRunContract(job))
      throw new BadRequestException('旧 Run 持久化合同拒绝执行');
    return runBacktestAttempt({
      prisma: this.prisma,
      job,
      ...(execution ? { execution } : {}),
      runnerId: isNavBacktestInput(job.input) ? this.navExecution?.runner.navId : this.defaultV3Runner?.id,
      activeControllers: this.activeControllers,
      execute: async (attemptJob, signal) => {
        if (!persistedRunContract(attemptJob))
          throw new BadRequestException('旧 Run 持久化合同拒绝执行');
        if (isNavBacktestInput(attemptJob.input)) {
          if (!this.navExecution) throw new BacktestSnapshotUnavailableError('NAV Runner 未配置');
          return this.navExecution.execute(attemptJob, signal);
        }
        if (!this.defaultV3Runner) {
          throw new BacktestSnapshotUnavailableError('现行 Runner 未配置，Run 未进入执行');
        }
        const replayed = await materializeStockRunnerReplay({ prisma: this.prisma, job: attemptJob,
          snapshots: this.snapshotStoreForRun(), signal });
        const materialized = await materializeStockBacktest({ prisma: this.prisma, job: replayed,
          snapshots: this.snapshotStoreForRun(), builder: this.snapshotBuilder, guard: this.creationGuard, signal });
        return executeBacktestV3Run({
          job: materialized,
          runner: this.defaultV3Runner,
          snapshots: this.snapshotStoreForRun(),
          signal,
          onStage: (stage) => advanceBacktestStage(this.prisma, materialized, signal, stage),
        });
      },
      classifyFailure: (error) => classifyBacktestRunFailure(error, execution),
    });
  }

  async retryRun(id: string) {
    const job = await this.prisma.backtestJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('回测 Run 不存在');
    if (job.errorCode === 'PREPARATION_FAILED')
      throw new BadRequestException('准备阶段失败，请返回原策略重新创建回测。');
    if (!persistedRunContract(job))
      throw new BadRequestException('旧 Run 持久化合同拒绝重试');
    if (!['succeeded', 'failed'].includes(job.status)) throw new BadRequestException('只有失败或已完成的Run可以重试');
    const identity = backtestRunnerIdentity(job.engineVersion, this.runnerIdentityFor(job), backtestHasExecutionHistory(job));
    if (identity !== 'same' && identity !== 'unbound-new')
      return createBacktestRunnerReplay({ prisma: this.prisma, job, runnerId: this.runnerIdentityFor(job),
        snapshots: this.snapshotStoreForRun(), navExecution: this.navExecution, queue: this.queueService });
    if (job.status === 'succeeded') return job;
    await verifyBacktestRunRetrySnapshot({
      job,
      prisma: this.prisma,
      snapshotBuilder: this.snapshotBuilder,
      snapshotStore: this.snapshotStoreForRun(),
      queueService: this.queueService,
      navExecution: this.navExecution,
      defaultV3RunnerAvailable: this.defaultV3Runner !== undefined,
    });
    let retry: ReturnType<typeof prepareBacktestManualRetry>;
    try {
      retry = prepareBacktestManualRetry(job.input, job.executionAttempt);
    } catch {
      throw new BadRequestException('回测重试预算无效');
    }
    const changed = await this.prisma.backtestJob.updateMany({
      where: { id, mode: 'frozen', status: 'failed', executionAttempt: job.executionAttempt },
      data: {
        status: 'queued',
        stage: 'queued',
        progress: 0,
        executionAttempt: retry.executionAttempt,
        input: retry.input,
        cancelRequestedAt: null,
        startedAt: null,
        finishedAt: null,
        errorCode: null,
        errorSummary: null,
        diagnostics: Prisma.JsonNull,
      },
    });
    if (changed.count !== 1) {
      const current = await this.prisma.backtestJob.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('回测 Run 不存在');
      if (current.status === 'succeeded') return current;
      throw new BadRequestException('只有 failed Run 可以 retry');
    }
    const retried = await this.prisma.backtestJob.findUnique({ where: { id } });
    return this.queueService?.ensureEnqueued(id) ?? retried;
  }

  private runnerIdentityFor(job: Pick<BacktestJob, 'input'>): string {
    const identity = isNavBacktestInput(job.input) ? this.navExecution?.runner.navId : this.defaultV3Runner?.id;
    if (!identity) throw new BadRequestException({ code: 'BACKTEST_RUNNER_UNAVAILABLE', message: '当前资产的回测执行器未装配，不能绑定或重试。' });
    return identity;
  }

  async comparableDataFingerprint(
    runId: string,
    range: ComparableDataFingerprintRange,
  ): Promise<string> {
    const job = await this.prisma.backtestJob.findUnique({ where: { id: runId } });
    if (!job) throw new NotFoundException('回测 Run 不存在');
    if (!persistedRunContract(job))
      throw new BadRequestException('旧 Run 持久化合同拒绝比较');
    const snapshot = await loadVerifiedBacktestV3Snapshot(job, this.snapshotStoreForRun());
    if (!snapshot) throw new BadRequestException('Run Snapshot 不存在');
    if (snapshot.status !== 'finalized')
      throw new BadRequestException('Run Snapshot 尚未 finalized');
    return fingerprintBacktestRunData(
      runId,
      range,
      snapshot,
      stockSnapshotStoreForJob(job, this.snapshotStoreForRun()).artifacts,
    );
  }
}
