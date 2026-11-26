import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../platform/prisma.service.js';
import { ResultReadPolicyService } from '../platform/result-read-policy.service.js';
import { BacktestQueueService } from './backtest-queue.service.js';
import { requestBacktestCancellation } from './backtest-run-cancellation.js';
import { backtestJobSummarySelect, toBacktestJobSummary } from './backtest-summary.js';
import { BacktestRunService } from './backtest-run.service.js';
import type { ComparableDataFingerprintRange } from './backtest-run.service.js';
import { persistedRunContract } from './backtest-v3-run-lifecycle.js';
import { assertCurrentRunForRead, isCurrentRunForRead } from './backtest-current-run-read.js';
import { withBacktestModelDisclosure } from './backtest-model-disclosure.js';
import { isNavBacktestInput } from './backtest-nav-run-read.js';
import { visibleStrategyOwners } from './strategy-access.service.js';
import { StrategyCreationService } from './strategy-creation.service.js';
import { InstrumentDisplayService } from '../market/instruments/instrument-display.service.js';
import { nameStrategyVersions } from './strategy-instrument-display.js';
import { publishManualStrategyVersion } from './strategy-version-publication.js';

export type { BacktestSnapshotBuilder } from './backtest-run.service.js';

export interface BacktestExecutionAttempt {
  attempt: number;
  maxAttempts: number;
}

type ReadableBacktestJob = { input?: unknown } & Record<string, unknown>;

@Injectable()
export class BacktestService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(BacktestQueueService)
    private readonly queueService: BacktestQueueService | undefined,
    @Optional()
    @Inject(BacktestRunService)
    private readonly runs: BacktestRunService | undefined,
    private readonly resultReadPolicy: ResultReadPolicyService,
    @Optional() private readonly creation?: StrategyCreationService,
    @Optional() private readonly display: InstrumentDisplayService = new InstrumentDisplayService(prisma),
  ) {
    if (!resultReadPolicy) throw new Error('ResultReadPolicyService is required');
  }

  async createStrategy(name: string, schema: unknown, description?: string, ownerId?: string | null) {
    const strategy = await (this.creation ?? new StrategyCreationService()).createInTransaction(this.prisma,
      { name, description, definition: schema, ownerId: ownerId ?? null, source: { kind: 'manual' } });
    return { ...strategy, versions: await nameStrategyVersions(strategy.versions, this.display) };
  }

  async createVersion(strategyId: string, schema: unknown) {
    const version = await publishManualStrategyVersion(this.prisma, strategyId, schema);
    return (await nameStrategyVersions([version], this.display))[0]!;
  }

  async createRun(input: unknown) {
    if (!this.runs) throw new BadRequestException('回测 Run 服务未配置');
    return this.runs.createRun(input);
  }

  async listStrategies(ownerId?: string | null) {
    const strategies = await this.prisma.strategy.findMany({
      where: { schemaVersion: 1, status: { not: 'experiment-only' }, ...visibleStrategyOwners(ownerId) },
      include: { versions: { where: { schemaVersion: 1 } } },
      orderBy: { updatedAt: 'desc' },
    });
    const versions = await nameStrategyVersions(strategies.flatMap((row) => row.versions), this.display);
    const byId = new Map(versions.map((version) => [version.id, version]));
    return strategies.map((row) => ({ ...row, versions: row.versions.map((version) => byId.get(version.id)!) }));
  }

  async listCurrentRunSummaries(ownerId?: string | null) {
    const jobs = await this.prisma.backtestJob.findMany({
      where: { mode: 'frozen', strategyVersion: { strategy: visibleStrategyOwners(ownerId) } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: backtestJobSummarySelect,
    });
    return this.resultReadPolicy.protectBacktestJobs(
      jobs.filter(isCurrentRunForRead).map(toBacktestJobSummary),
    );
  }

  status(id: string) {
    return this.prisma.backtestJob.findUnique({ where: { id } });
  }

  async statusForRead(id: string): Promise<ReadableBacktestJob | null> {
    const job = await this.status(id);
    if (!job) return job;
    if (!persistedRunContract(job)) {
      throw new ConflictException({
        code: 'UNSUPPORTED_CONTRACT_VERSION',
        message: '旧回测记录不支持读取或操作',
      });
    }
    assertCurrentRunForRead(job);
    const protectedJob = this.resultReadPolicy.protectBacktestJob(
      job,
      await this.resultReadPolicy.run(id),
    );
    return withBacktestModelDisclosure(protectedJob);
  }

  private async requireCurrentRun(id: string): Promise<void> {
    const job = await this.prisma.backtestJob.findUnique({
      where: { id },
    });
    if (!job) throw new NotFoundException('回测 Run 不存在');
    if (!persistedRunContract(job)) {
      throw new ConflictException({
        code: 'UNSUPPORTED_CONTRACT_VERSION',
        message: '旧回测记录不支持读取或操作',
      });
    }
    assertCurrentRunForRead(job);
    if (job.errorCode === 'PREPARATION_FAILED')
      throw new ConflictException('准备阶段失败，请返回原策略重新创建回测。');
  }

  async currentRunForRead(id: string) {
    return this.statusForRead(id);
  }

  async runCurrentRunForRead(id: string) {
    await this.requireCurrentRun(id);
    if (!this.queueService) throw new ConflictException('回测队列未配置');
    return this.protectMutationResult(await this.queueService.ensureEnqueued(id));
  }

  async retryCurrentRunForRead(id: string) {
    await this.requireCurrentRun(id);
    return this.retryRunForRead(id);
  }

  async cancelCurrentRunForRead(id: string) {
    await this.requireCurrentRun(id);
    return this.cancelForRead(id);
  }

  async runCurrent(id: string, execution?: BacktestExecutionAttempt) {
    const job = await this.prisma.backtestJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('回测 Run 不存在');
    if (!persistedRunContract(job)) {
      throw new ConflictException({
        code: 'UNSUPPORTED_CONTRACT_VERSION',
        message: '旧回测记录不支持读取或操作',
      });
    }
    if (!isNavBacktestInput(job.input)) assertCurrentRunForRead(job);
    if (!this.runs) throw new BadRequestException('回测 Run 服务未配置');
    return this.runs.runCurrent(id, execution);
  }

  async retryRun(id: string) {
    await this.requireCurrentRun(id);
    if (!this.runs) throw new BadRequestException('回测 Run 服务未配置');
    return this.runs.retryRun(id);
  }

  async retryRunForRead(id: string) {
    const job = await this.retryRun(id);
    return this.protectMutationResult(job);
  }

  async comparableDataFingerprint(runId: string, range: ComparableDataFingerprintRange) {
    if (!this.runs) throw new BadRequestException('回测 Run 服务未配置');
    return this.runs.comparableDataFingerprint(runId, range);
  }

  async cancel(id: string) {
    await this.requireCurrentRun(id);
    if (this.queueService) {
      const cancelled = await this.queueService.cancel(id);
      if (
        cancelled?.mode === 'frozen' &&
        cancelled.status === 'running' &&
        cancelled.cancelRequestedAt
      ) {
        this.runs?.abortActiveRun(id);
      }
      return cancelled;
    }
    const result = await requestBacktestCancellation(this.prisma, id);
    if (!result.job) throw new NotFoundException('回测任务不存在');
    if (result.job.status === 'running' && result.job.cancelRequestedAt) {
      if (result.job.mode === 'frozen') this.runs?.abortActiveRun(id);
    }
    return result.job;
  }

  async cancelForRead(id: string) {
    const job = await this.cancel(id);
    return this.protectMutationResult(job);
  }

  private async protectMutationResult<T extends { id: string; input?: unknown } | null>(job: T) {
    if (!job) return job;
    return withBacktestModelDisclosure(this.resultReadPolicy.protectBacktestJob(job, await this.resultReadPolicy.run(job.id)));
  }
}
