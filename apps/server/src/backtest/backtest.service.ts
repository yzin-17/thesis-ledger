import { createHash } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  quantStatsAnalytics,
  runBacktest,
  type BacktestBar,
  type BacktestStrategy,
} from '@thesis-ledger/domain';
import { backtestJobSchema, strategySchemaV1, strategySchemaV2 } from '@thesis-ledger/schemas';
import { PrismaService } from '../platform/prisma.service.js';
import { explicitlyAllowsStale, hasStaleMarketData } from '../market/freshness.js';
import { BacktestQueueService } from './backtest-queue.service.js';
import { backtestJobSummarySelect, toBacktestJobSummary } from './backtest-summary.js';
import { BacktestV2RunService } from './backtest-v2-run.js';
import type { BacktestV2Runner } from './backtest-v2-run.js';

export interface BacktestWorker {
  readonly id: string;
  run(
    input: {
      jobId: string;
      strategy: unknown;
      period: { start: string; end: string };
      dataAsOf: string;
      bars: BacktestBar[];
      benchmarkBars?: BacktestBar[];
      initialCash: number;
      inSampleEnd?: string;
    },
    signal: AbortSignal,
  ): Promise<unknown>;
}

export interface BacktestAnalyticsWorker {
  readonly id: string;
  run(input: { returns: number[]; periodsPerYear?: number }): Promise<unknown>;
}

/** V2 Runner boundary: no bars, strategy object, or online data provider is exposed. */
export type { BacktestV2Runner, BacktestV2SnapshotBuilder } from './backtest-v2-run.js';

export interface BacktestExecutionAttempt {
  attempt: number;
  maxAttempts: number;
}

const localAnalyticsWorker: BacktestAnalyticsWorker = {
  id: 'quantstats-local-v1',
  run(input) {
    return Promise.resolve(quantStatsAnalytics(input.returns, input.periodsPerYear));
  },
};

export const localWorker: BacktestWorker = {
  id: 'thesis-ledger-engine-v1',
  run(input, signal) {
    if (signal.aborted) throw new Error('回测已取消');
    const result = runBacktest({
      strategy: input.strategy as BacktestStrategy,
      bars: input.bars,
      start: input.period.start,
      end: input.period.end,
      dataAsOf: input.dataAsOf,
      initialCash: input.initialCash,
      ...(input.benchmarkBars === undefined ? {} : { benchmarkBars: input.benchmarkBars }),
      ...(input.inSampleEnd === undefined ? {} : { inSampleEnd: input.inSampleEnd }),
      engineVersion: 'thesis-ledger-engine-v1',
    });
    if (signal.aborted) throw new Error('回测已取消');
    return Promise.resolve(result);
  },
};

const normalizeBacktestBars = (value: unknown): BacktestBar[] => {
  if (!Array.isArray(value)) return [];
  return value.map((bar) => {
    if (!bar || typeof bar !== 'object' || Array.isArray(bar)) return bar as BacktestBar;
    const record = bar as Record<string, unknown>;
    if (typeof record.date === 'string' || typeof record.timestamp !== 'string') {
      return record as unknown as BacktestBar;
    }
    return { ...record, date: record.timestamp.slice(0, 10) } as unknown as BacktestBar;
  });
};

@Injectable()
export class BacktestService {
  private readonly activeControllers = new Map<string, AbortController>();

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly queueService?: BacktestQueueService,
    @Optional() private readonly v2Runs?: BacktestV2RunService,
  ) {}

  private static isV2Strategy(value: unknown): boolean {
    return Boolean(
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      (value as Record<string, unknown>).schemaVersion === '2',
    );
  }

  async createStrategy(name: string, schema: unknown, description?: string) {
    if (BacktestService.isV2Strategy(schema)) {
      const parsed = strategySchemaV2.parse(schema);
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
    const parsed = strategySchemaV1.parse(schema);
    return this.prisma.strategy.create({
      data: {
        name,
        description: description ?? parsed.description ?? null,
        status: parsed.status,
        schemaVersion: parsed.version,
        versions: {
          create: {
            version: 1,
            schemaVersion: parsed.version,
            schema: parsed as Prisma.InputJsonValue,
          },
        },
      },
      include: { versions: true },
    });
  }

  async createVersion(strategyId: string, schema: unknown) {
    if (BacktestService.isV2Strategy(schema)) {
      const parsed = strategySchemaV2.parse(schema);
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
    const parsed = strategySchemaV1.parse(schema);
    const latest = await this.prisma.strategyVersion.aggregate({
      where: { strategyId },
      _max: { version: true },
    });
    return this.prisma.strategyVersion.create({
      data: {
        strategyId,
        version: (latest._max.version ?? 0) + 1,
        schemaVersion: parsed.version,
        schema: parsed as Prisma.InputJsonValue,
      },
    });
  }

  async createRun(input: unknown) {
    if (!this.v2Runs) throw new BadRequestException('V2 Run 服务未配置');
    return this.v2Runs.createRun(input);
  }

  listStrategies() {
    return this.prisma.strategy.findMany({
      include: { versions: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async queue(input: unknown) {
    const job = backtestJobSchema.parse(input);
    if (hasStaleMarketData(job) && !explicitlyAllowsStale(input))
      throw new BadRequestException('回测默认拒绝陈旧或部分市场数据，请显式允许后重试');
    const persistedInput = { ...(job as Record<string, unknown>) };
    delete persistedInput.strategy;
    if (Array.isArray(persistedInput.bars)) {
      persistedInput.bars = normalizeBacktestBars(persistedInput.bars);
    }
    if (Array.isArray(persistedInput.benchmarkBars)) {
      persistedInput.benchmarkBars = normalizeBacktestBars(persistedInput.benchmarkBars);
    }
    const strategyVersionRepository = (
      this.prisma as unknown as {
        strategyVersion?: {
          findUnique?: (args: { where: { id: string } }) => Promise<{ schema?: unknown } | null>;
        };
      }
    ).strategyVersion;
    const selectedVersion = await strategyVersionRepository?.findUnique?.({
      where: { id: job.strategyVersionId },
    });
    let dataAsOf = job.dataAsOf;
    if (selectedVersion?.schema !== undefined) {
      const parsedSchema = strategySchemaV1.parse(selectedVersion.schema);
      dataAsOf = parsedSchema.universe.asOf;
    }
    const created = await this.prisma.backtestJob.create({
      data: {
        id: job.id,
        strategyVersionId: job.strategyVersionId,
        status: 'queued',
        periodStart: new Date(job.period.start),
        periodEnd: new Date(job.period.end),
        dataAsOf: new Date(dataAsOf),
        input: { ...persistedInput, dataAsOf },
        warnings: job.warnings,
      },
    });
    return this.queueService?.ensureEnqueued(created.id) ?? created;
  }

  listJobs() {
    return this.prisma.backtestJob.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
  }

  async listJobSummaries() {
    const jobs = await this.prisma.backtestJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: backtestJobSummarySelect,
    });
    return jobs.map(toBacktestJobSummary);
  }

  status(id: string) {
    return this.prisma.backtestJob.findUnique({ where: { id } });
  }

  async run(id: string, worker?: BacktestWorker, execution?: BacktestExecutionAttempt) {
    if (!worker && this.queueService) return this.queueService.ensureEnqueued(id);
    if (execution) {
      const modeProbe = await this.prisma.backtestJob.findUnique({
        where: { id },
        select: { mode: true },
      });
      if (modeProbe?.mode === 'V2') return this.runV2(id, undefined, execution);
    }
    const selectedWorker = worker ?? localWorker;
    const job = await this.prisma.backtestJob.findUnique({
      where: { id },
      include: { strategyVersion: true },
    });
    if (!job) throw new NotFoundException('回测任务不存在');
    if (['succeeded', 'failed', 'cancelled'].includes(job.status)) return job;
    if (!execution && job.status !== 'queued') return job;
    if (execution && job.cancelRequestedAt) {
      return this.prisma.backtestJob.update({
        where: { id },
        data: { status: 'cancelled', progress: 100, finishedAt: new Date() },
      });
    }

    const input = (job.input ?? {}) as {
      bars?: BacktestBar[];
      initialCash?: number;
      inSampleEnd?: string;
      dataVersion?: string;
      provider?: string;
      parameters?: Record<string, unknown>;
      benchmarkBars?: BacktestBar[];
    };
    if (execution) {
      const claimed = await this.prisma.backtestJob.updateMany({
        where: {
          id,
          status: { in: ['queued', 'running'] },
          executionAttempt: { lt: execution.attempt },
          cancelRequestedAt: null,
        },
        data: {
          status: 'running',
          progress: 5,
          executionAttempt: execution.attempt,
          startedAt: job.startedAt ?? new Date(),
          engineVersion: selectedWorker.id,
          errorCode: null,
          errorSummary: null,
        },
      });
      if (claimed.count !== 1) return this.prisma.backtestJob.findUnique({ where: { id } });
    } else
      try {
        await this.prisma.backtestJob.update({
          where: { id, status: 'queued' },
          data: {
            status: 'running',
            progress: 5,
            startedAt: new Date(),
            engineVersion: selectedWorker.id,
          },
        });
      } catch (error) {
        const current = await this.prisma.backtestJob.findUnique({ where: { id } });
        if (current && current.status !== 'queued') return current;
        throw error;
      }

    const controller = new AbortController();
    this.activeControllers.set(id, controller);
    try {
      const versionedStrategy =
        job.strategyVersion && 'schema' in job.strategyVersion
          ? strategySchemaV1.parse(job.strategyVersion.schema)
          : undefined;
      if (!versionedStrategy && selectedWorker === localWorker) {
        throw new BadRequestException('策略版本缺少可执行 schema');
      }
      const result = await selectedWorker.run(
        {
          jobId: id,
          strategy: versionedStrategy,
          bars: normalizeBacktestBars(input.bars),
          ...(input.benchmarkBars === undefined
            ? {}
            : { benchmarkBars: normalizeBacktestBars(input.benchmarkBars) }),
          initialCash: input.initialCash ?? 100_000,
          period: {
            start: job.periodStart.toISOString().slice(0, 10),
            end: job.periodEnd.toISOString().slice(0, 10),
          },
          dataAsOf: job.dataAsOf.toISOString(),
          ...(input.inSampleEnd === undefined ? {} : { inSampleEnd: input.inSampleEnd }),
        },
        controller.signal,
      );
      const current = await this.prisma.backtestJob.findUnique({ where: { id } });
      if (
        controller.signal.aborted ||
        current?.status === 'cancelled' ||
        current?.cancelRequestedAt
      ) {
        if (!current || current.status === 'cancelled') return current ?? job;
        return this.prisma.backtestJob.update({
          where: { id },
          data: { status: 'cancelled', progress: 100, finishedAt: new Date() },
        });
      }
      const enrichedResult =
        result && typeof result === 'object'
          ? {
              ...(result as Record<string, unknown>),
              ...((result as { analytics?: unknown }).analytics !== undefined
                ? { analytics: (result as { analytics: unknown }).analytics }
                : Array.isArray((result as { returns?: unknown }).returns)
                  ? {
                      analytics: await localAnalyticsWorker.run({
                        returns: (result as { returns: number[] }).returns,
                      }),
                    }
                  : {}),
              metadata: {
                ...((result as { metadata?: Record<string, unknown> }).metadata ?? {}),
                strategyVersionId: job.strategyVersionId,
                strategyVersion: job.strategyVersion?.version,
                schemaVersion: job.strategyVersion?.schemaVersion,
                dataVersion: input.dataVersion,
                provider: input.provider,
                parameters: input.parameters,
                ...(versionedStrategy ? { costModel: versionedStrategy.cost } : {}),
              },
            }
          : result;
      const resultChecksum = createHash('sha256')
        .update(JSON.stringify(enrichedResult))
        .digest('hex');
      if (execution) {
        const committed = await this.prisma.backtestJob.updateMany({
          where: {
            id,
            status: 'running',
            executionAttempt: execution.attempt,
            cancelRequestedAt: null,
          },
          data: {
            status: 'succeeded',
            progress: 100,
            finishedAt: new Date(),
            result: enrichedResult as object,
            resultChecksum,
          },
        });
        if (committed.count === 0) {
          const latest = await this.prisma.backtestJob.findUnique({ where: { id } });
          if (
            latest?.status === 'running' &&
            latest.executionAttempt === execution.attempt &&
            latest.cancelRequestedAt
          ) {
            await this.prisma.backtestJob.updateMany({
              where: {
                id,
                status: 'running',
                executionAttempt: execution.attempt,
                cancelRequestedAt: { not: null },
              },
              data: { status: 'cancelled', progress: 100, finishedAt: new Date() },
            });
          }
        }
        return this.prisma.backtestJob.findUnique({ where: { id } });
      }
      return this.prisma.backtestJob.update({
        where: { id },
        data: {
          status: 'succeeded',
          progress: 100,
          finishedAt: new Date(),
          result: enrichedResult as object,
          resultChecksum,
        },
      });
    } catch (error) {
      const current = await this.prisma.backtestJob.findUnique({ where: { id } });
      if (current?.status === 'cancelled' || current?.cancelRequestedAt) {
        if (current.status === 'cancelled') return current;
        return this.prisma.backtestJob.update({
          where: { id },
          data: { status: 'cancelled', progress: 100, finishedAt: new Date() },
        });
      }
      const deterministicInputError =
        error instanceof BadRequestException ||
        (error instanceof Error && error.name === 'ZodError');
      if (execution && deterministicInputError) {
        const errorSummary = '回测任务的策略版本或输入不再可执行。';
        await this.prisma.backtestJob.updateMany({
          where: { id, status: 'running', executionAttempt: execution.attempt },
          data: {
            status: 'failed',
            progress: 100,
            finishedAt: new Date(),
            errorCode: 'backtest_input_invalid',
            errorSummary,
          },
        });
        throw Object.assign(new Error(errorSummary), { unrecoverable: true });
      }
      if (execution && execution.attempt < execution.maxAttempts) {
        await this.prisma.backtestJob.updateMany({
          where: { id, status: 'running', executionAttempt: execution.attempt },
          data: {
            status: 'queued',
            progress: 0,
            errorCode: 'worker_attempt_failed',
            errorSummary:
              error instanceof Error ? error.message.slice(0, 500) : '回测 Worker 执行失败',
          },
        });
        throw error;
      }
      if (execution) {
        await this.prisma.backtestJob.updateMany({
          where: { id, status: 'running', executionAttempt: execution.attempt },
          data: {
            status: 'failed',
            progress: 100,
            finishedAt: new Date(),
            errorCode: 'worker_attempts_exhausted',
            errorSummary:
              error instanceof Error ? error.message.slice(0, 500) : '回测 Worker 执行失败',
          },
        });
        throw error;
      }
      return this.prisma.backtestJob.update({
        where: { id },
        data: {
          status: 'failed',
          progress: 100,
          finishedAt: new Date(),
          warnings: [error instanceof Error ? error.message : '回测失败'],
        },
      });
    } finally {
      this.activeControllers.delete(id);
    }
  }

  async runV2(id: string, runner?: BacktestV2Runner, execution?: BacktestExecutionAttempt) {
    if (!this.v2Runs) throw new BadRequestException('V2 Run 服务未配置');
    return this.v2Runs.runV2(id, runner, execution);
  }

  async retryRun(id: string) {
    if (!this.v2Runs) throw new BadRequestException('V2 Run 服务未配置');
    return this.v2Runs.retryRun(id);
  }

  async cancel(id: string) {
    const modeProbe = await this.prisma.backtestJob.findUnique({
      where: { id },
      select: { mode: true },
    });
    if (this.queueService) {
      const cancelled = await this.queueService.cancel(id);
      if (modeProbe?.mode === 'V2') this.v2Runs?.abortActiveRun(id);
      return cancelled;
    }
    const job = await this.prisma.backtestJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('回测任务不存在');
    if (['succeeded', 'failed', 'cancelled'].includes(job.status)) return job;
    this.activeControllers.get(id)?.abort();
    const cancelled = await this.prisma.backtestJob.update({
      where: { id },
      data: { status: 'cancelled', cancelRequestedAt: new Date(), finishedAt: new Date() },
    });
    if (modeProbe?.mode === 'V2') this.v2Runs?.abortActiveRun(id);
    return cancelled;
  }
}
