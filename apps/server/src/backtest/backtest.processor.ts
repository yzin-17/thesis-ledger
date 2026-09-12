import { NestFactory } from '@nestjs/core';
import { UnrecoverableError, type Job } from 'bullmq';
import { PrismaService } from '../platform/prisma.service.js';
import { BACKTEST_MAX_ATTEMPTS, type BacktestQueueData } from './backtest-bull-queue.js';
import { prepareBacktestExecution } from './backtest-execution-owner.js';
import { BacktestEventPublisher } from './backtest-event.publisher.js';
import { BacktestProcessorModule } from './backtest-processor.module.js';
import { BacktestService } from './backtest.service.js';

let contextPromise: ReturnType<typeof NestFactory.createApplicationContext> | undefined;

const context = () => {
  contextPromise ??= NestFactory.createApplicationContext(BacktestProcessorModule, {
    logger: ['error', 'warn', 'log'],
  });
  return contextPromise;
};

export default async function processBacktest(job: Job<BacktestQueueData>) {
  const application = await context();
  const prisma = application.get(PrismaService);
  const service = application.get(BacktestService);
  const events = application.get(BacktestEventPublisher);
  const prepared = await prepareBacktestExecution(prisma, job.data.jobId, BACKTEST_MAX_ATTEMPTS);

  if (prepared.action !== 'run') {
    await events.publishJob(job.data.jobId).catch(() => undefined);
    return service.status(job.data.jobId);
  }

  try {
    return await service.run(job.data.jobId, undefined, {
      attempt: prepared.ownerAttempt,
      maxAttempts: BACKTEST_MAX_ATTEMPTS,
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'unrecoverable' in error) {
      throw new UnrecoverableError(error instanceof Error ? error.message : '回测输入不可执行');
    }
    throw error;
  } finally {
    await events.publishJob(job.data.jobId).catch(() => undefined);
  }
}
