import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { redisKey } from '../platform/redis.service.js';
import { StructuredLogger } from '../platform/structured-logger.js';
import {
  BACKTEST_MAX_ATTEMPTS,
  BACKTEST_QUEUE_NAME,
  type BacktestQueueData,
} from './backtest-bull-queue.js';

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) throw new Error('REDIS_URL is required');

const heartbeatKey = redisKey('queue', 'backtest-worker-heartbeat');
const logger = new StructuredLogger('thesis-ledger.backtest-worker');
const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
connection.on('error', () => undefined);
const concurrency = Math.max(1, Number(process.env.BACKTEST_WORKER_CONCURRENCY ?? 1));
const activeSince = new Map<string, number>();

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
    transportAttempt: job.attemptsMade + 1,
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
    transportAttempt: job.attemptsMade,
    ...(startedAt === undefined ? {} : { durationMs: Date.now() - startedAt }),
  });
});
worker.on('failed', (job, error) => {
  if (!job) return;
  const key = job.id ?? job.data.jobId;
  const startedAt = activeSince.get(key);
  activeSince.delete(key);
  const maxTransportAttempts = job.opts.attempts ?? BACKTEST_MAX_ATTEMPTS;
  logger.warn({
    operation: 'backtest.worker.failed',
    queue: BACKTEST_QUEUE_NAME,
    jobId: job.data.jobId,
    transportAttempt: job.attemptsMade,
    maxTransportAttempts,
    ...(startedAt === undefined ? {} : { durationMs: Date.now() - startedAt }),
    errorCode:
      job.attemptsMade >= maxTransportAttempts ? 'worker_transport_exhausted' : 'worker_transport_failed',
    error: error.message,
  });
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
};

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
