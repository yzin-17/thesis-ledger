import { createHash } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  quantStatsAnalytics,
  runBacktest,
  type BacktestBar,
  type BacktestStrategy,
} from '@thesis-ledger/domain';
import { backtestJobSchema, strategySchemaV1 } from '@thesis-ledger/schemas';
import { PrismaService } from '../platform/prisma.service.js';
import { explicitlyAllowsStale, hasStaleMarketData } from '../market/freshness.js';

export interface BacktestWorker {
  readonly id: string;
  run(
    input: {
      jobId: string;
      strategy: unknown;
      period: { start: string; end: string };
      dataAsOf: string;
      bars: BacktestBar[];
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

const localAnalyticsWorker: BacktestAnalyticsWorker = {
  id: 'quantstats-local-v1',
  run(input) {
    return Promise.resolve(quantStatsAnalytics(input.returns, input.periodsPerYear));
  },
};

const localWorker: BacktestWorker = {
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
      ...(input.inSampleEnd === undefined ? {} : { inSampleEnd: input.inSampleEnd }),
      engineVersion: 'thesis-ledger-engine-v1',
    });
    if (signal.aborted) throw new Error('回测已取消');
    return Promise.resolve(result);
  },
};

@Injectable()
export class BacktestService {
  private readonly activeControllers = new Map<string, AbortController>();

  constructor(private readonly prisma: PrismaService) {}

  async createStrategy(name: string, schema: unknown, description?: string) {
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
    return this.prisma.backtestJob.create({
      data: {
        id: job.id,
        strategyVersionId: job.strategyVersionId,
        status: 'queued',
        periodStart: new Date(job.period.start),
        periodEnd: new Date(job.period.end),
        dataAsOf: new Date(job.dataAsOf),
        input: job as Prisma.InputJsonValue,
        warnings: job.warnings,
      },
    });
  }

  listJobs() {
    return this.prisma.backtestJob.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
  }

  status(id: string) {
    return this.prisma.backtestJob.findUnique({ where: { id } });
  }

  async run(id: string, worker = localWorker) {
    const job = await this.prisma.backtestJob.findUnique({
      where: { id },
      include: { strategyVersion: true },
    });
    if (!job) throw new NotFoundException('回测任务不存在');
    if (['succeeded', 'failed', 'cancelled'].includes(job.status)) return job;
    const controller = new AbortController();
    this.activeControllers.set(id, controller);
    const input = (job.input ?? {}) as {
      strategy?: unknown;
      bars?: BacktestBar[];
      initialCash?: number;
      inSampleEnd?: string;
      dataVersion?: string;
      provider?: string;
      parameters?: Record<string, unknown>;
      costModel?: Record<string, unknown>;
    };
    await this.prisma.backtestJob.update({
      where: { id },
      data: { status: 'running', progress: 5, startedAt: new Date(), engineVersion: worker.id },
    });
    try {
      const result = await worker.run(
        {
          jobId: id,
          strategy: input.strategy,
          bars: input.bars ?? [],
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
      if (controller.signal.aborted || current?.status === 'cancelled') return current ?? job;
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
                costModel: input.costModel,
              },
            }
          : result;
      const resultChecksum = createHash('sha256')
        .update(JSON.stringify(enrichedResult))
        .digest('hex');
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
      if (current?.status === 'cancelled') return current;
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

  async cancel(id: string) {
    const job = await this.prisma.backtestJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('回测任务不存在');
    if (['succeeded', 'failed', 'cancelled'].includes(job.status)) return job;
    this.activeControllers.get(id)?.abort();
    return this.prisma.backtestJob.update({
      where: { id },
      data: { status: 'cancelled', cancelRequestedAt: new Date(), finishedAt: new Date() },
    });
  }
}
