import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { strategySchema } from '@thesis-ledger/schemas';
import { PrismaService } from '../platform/prisma.service.js';
import { ResultReadPolicyService } from '../platform/result-read-policy.service.js';
import { BacktestQueueService } from './backtest-queue.service.js';
import { requestBacktestCancellation } from './backtest-run-cancellation.js';
import { backtestJobSummarySelect, toBacktestJobSummary } from './backtest-summary.js';
import { BacktestRunService } from './backtest-run.service.js';
import type { ComparableDataFingerprintRange } from './backtest-run.service.js';
import { persistedContractVersion } from './backtest-v3-run-lifecycle.js';
import { assertCurrentRunForRead, isCurrentRunForRead } from './backtest-current-run-read.js';
import { isNavBacktestInput } from './backtest-nav-run-read.js';

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
  ) {
    if (!resultReadPolicy) throw new Error('ResultReadPolicyService is required');
  }

  async createStrategy(name: string, schema: unknown, description?: string) {
    const parsed = strategySchema.parse(schema);
    return this.prisma.strategy.create({
      data: {
        name,
        description: description ?? parsed.description ?? null,
        status: 'draft',
        schemaVersion: 2,
        versions: {
          create: {
            version: 1,
            schemaVersion: 2,
            schema: parsed as Prisma.InputJsonValue,
          },
        },
      },
      include: { versions: true },
    });
  }

  async createVersion(strategyId: string, schema: unknown) {
    const parsed = strategySchema.parse(schema);
    const owner = await this.prisma.strategy.findUnique({
      where: { id: strategyId },
      select: { schemaVersion: true },
    });
    if (!owner) throw new NotFoundException('策略不存在');
    if (owner.schemaVersion !== 2) {
      throw new ConflictException({
        code: 'UNSUPPORTED_CONTRACT_VERSION',
        message: '旧策略不支持创建现行版本',
      });
    }
    const latest = await this.prisma.strategyVersion.aggregate({
      where: { strategyId },
      _max: { version: true },
    });
    return this.prisma.strategyVersion.create({
      data: {
        strategyId,
        version: (latest._max.version ?? 0) + 1,
        schemaVersion: 2,
        schema: parsed as Prisma.InputJsonValue,
      },
    });
  }

  async createRun(input: unknown) {
    if (!this.runs) throw new BadRequestException('回测 Run 服务未配置');
    return this.runs.createRun(input);
  }

  listStrategies() {
    return this.prisma.strategy.findMany({
      where: { schemaVersion: 2, status: { not: 'experiment-only' } },
      include: { versions: { where: { schemaVersion: 2 } } },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async listCurrentRunSummaries() {
    const jobs = await this.prisma.backtestJob.findMany({
      where: { mode: 'V3' },
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
    if (persistedContractVersion(job) !== 3) {
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
    return protectedJob;
  }

  private async requireCurrentRun(id: string): Promise<void> {
    const job = await this.prisma.backtestJob.findUnique({
      where: { id },
    });
    if (!job) throw new NotFoundException('回测 Run 不存在');
    if (persistedContractVersion(job) !== 3) {
      throw new ConflictException({
        code: 'UNSUPPORTED_CONTRACT_VERSION',
        message: '旧回测记录不支持读取或操作',
      });
    }
    assertCurrentRunForRead(job);
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
    if (persistedContractVersion(job) !== 3) {
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
        cancelled?.mode === 'V3' &&
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
      if (result.job.mode === 'V3') this.runs?.abortActiveRun(id);
    }
    return result.job;
  }

  async cancelForRead(id: string) {
    const job = await this.cancel(id);
    return this.protectMutationResult(job);
  }

  private async protectMutationResult<T extends { id: string } | null>(job: T) {
    if (!job) return job;
    return this.resultReadPolicy.protectBacktestJob(job, await this.resultReadPolicy.run(job.id));
  }
}
