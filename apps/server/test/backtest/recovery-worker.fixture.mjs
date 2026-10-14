import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

// 只改变专属 transport 前缀；生产 processor、默认锁和停滞策略不变。
const build = resolve(process.env.BACKTEST_RECOVERY_BUILD_ROOT);
const { assertBacktestWorkerDatabaseReady } = await import(
  pathToFileURL(resolve(build, 'src/backtest/backtest-worker-startup.js'))
);
await assertBacktestWorkerDatabaseReady();
const connection = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
connection.on('error', () => undefined);
const worker = new Worker(
  'backtest-run',
  pathToFileURL(resolve(build, 'src/backtest/backtest.processor.js')),
  {
    connection,
    concurrency: 1,
    useWorkerThreads: true,
    prefix: process.env.BACKTEST_RECOVERY_QUEUE_PREFIX,
  },
);
worker.on('ready', () => console.log(JSON.stringify({ event: 'ready', pid: process.pid })));
for (const event of ['active', 'completed', 'stalled']) {
  worker.on(event, (job) =>
    console.log(
      JSON.stringify({
        event,
        pid: process.pid,
        jobId: typeof job === 'string' ? job : job?.id,
        attemptsMade: typeof job === 'string' ? undefined : job?.attemptsMade,
      }),
    ),
  );
}
worker.on('failed', (job, error) =>
  console.error(JSON.stringify({ event: 'failed', jobId: job?.id, error: error.message })),
);
worker.on('error', (error) => console.error(error.message));
process.once(
  'SIGTERM',
  () =>
    void worker
      .close()
      .then(() => connection.quit())
      .then(() => process.exit(0)),
);
