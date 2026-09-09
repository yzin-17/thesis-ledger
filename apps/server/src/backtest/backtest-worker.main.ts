import { PrismaClient } from '@prisma/client';
import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { redisKey } from '../platform/redis.service.js';
import { StructuredLogger } from '../platform/structured-logger.js';
import {
  BACKTEST_MAX_ATTEMPTS,
  BACKTEST_QUEUE_NAME,
  type BacktestQueueData,
} from './backtest-bull-queue.js';
import { BACKTEST_EVENT_CHANNEL } from './backtest-event.publisher.js';
import { backtestJobSummarySelect, toBacktestJobSummary } from './backtest-summary.js';

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) throw new Error('REDIS_URL is required');

const heartbeatKey = redisKey('queue', 'backtest-worker-heartbeat');
const logger = new StructuredLogger('thesis-ledger.backtest-worker');
const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
connection.on('error', () => undefined);
const prisma = new PrismaClient();
const concurrency = Math.max(1, Number(process.env.BACKTEST_WORKER_CONCURRENCY ?? 1));
const activeSince = new Map<string, number>();

const publishJob = async (jobId: string) => {
  const summary = await prisma.backtestJob.findUnique({
    where: { id: jobId },
    select: backtestJobSummarySelect,
  });
  if (summary)
    await connection.publish(BACKTEST_EVENT_CHANNEL, JSON.stringify(toBacktestJobSummary(summary)));
};

const heartbeat = async () => {
  await connection.set(heartbeatKey, new Date().toISOString(), 'PX', 45_000);
};

const worker = new Worker<BacktestQueueData>(
  BACKTEST_QUEUE_NAME,
  new URL('./backtest.processor.js', import.meta.url),
  {
    connection,
    concurrency,
    useWorkerThreads: true,
  },
);

worker.on('ready', () => {
  logger.log({ operation: 'backtest.worker.ready', queue: BACKTEST_QUEUE_NAME, concurrency });
  void heartbeat();
});
worker.on('active', (job) => {
  activeSince.set(job.id ?? job.data.jobId, Date.now());
  logger.log({
    operation: 'backtest.worker.active',
    queue: BACKTEST_QUEUE_NAME,
    jobId: job.data.jobId,
    attempt: job.attemptsMade + 1,
  });
});
worker.on('completed', (job) => {
  const key = job.id ?? job.data.jobId;
  const startedAt = activeSince.get(key);
  activeSince.delete(key);
  logger.log({
    operation: 'backtest.worker.completed',
    queue: BACKTEST_QUEUE_NAME,
    jobId: job.data.jobId,
    attempt: job.attemptsMade,
    ...(startedAt === undefined ? {} : { durationMs: Date.now() - startedAt }),
  });
});
worker.on('failed', (job, error) => {
  if (!job) return;
  const key = job.id ?? job.data.jobId;
  const startedAt = activeSince.get(key);
  activeSince.delete(key);
  const maxAttempts = job.opts.attempts ?? BACKTEST_MAX_ATTEMPTS;
  logger.warn({
    operation: 'backtest.worker.failed',
    queue: BACKTEST_QUEUE_NAME,
    jobId: job.data.jobId,
    attempt: job.attemptsMade,
    maxAttempts,
    ...(startedAt === undefined ? {} : { durationMs: Date.now() - startedAt }),
    errorCode:
      job.attemptsMade >= maxAttempts ? 'worker_attempts_exhausted' : 'worker_attempt_failed',
    error: error.message,
  });
  if (job.attemptsMade < maxAttempts) return;
  void prisma.backtestJob
    .updateMany({
      where: { id: job.data.jobId, status: { in: ['queued', 'running'] } },
      data: {
        status: 'failed',
        progress: 100,
        finishedAt: new Date(),
        errorCode: 'worker_attempts_exhausted',
        errorSummary: error.message.slice(0, 500),
      },
    })
    .then(() => publishJob(job.data.jobId))
    .catch(() => undefined);
});
worker.on('error', (error) =>
  logger.error({
    operation: 'backtest.worker.error',
    queue: BACKTEST_QUEUE_NAME,
    error: error.message,
  }),
);

const heartbeatTimer = setInterval(() => void heartbeat().catch(() => undefined), 15_000);
heartbeatTimer.unref?.();

let closing = false;
const shutdown = async () => {
  if (closing) return;
  closing = true;
  clearInterval(heartbeatTimer);
  await worker.close();
  await connection.del(heartbeatKey).catch(() => undefined);
  await connection.quit();
  await prisma.$disconnect();
};

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
