import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { loadConfig } from '../platform/config.js';
import type { BacktestQueueTransport } from './backtest-queue.service.js';

export const BACKTEST_QUEUE_NAME = 'backtest-v1';
export const BACKTEST_JOB_NAME = 'run';
export const BACKTEST_MAX_ATTEMPTS = 3;

export interface BacktestQueueData {
  jobId: string;
}

@Injectable()
export class BacktestBullQueue implements BacktestQueueTransport, OnModuleDestroy {
  private readonly connection = new Redis(loadConfig().redisUrl, {
    lazyConnect: true,
    connectTimeout: 1_000,
    maxRetriesPerRequest: 1,
  });
  private readonly queue = new Queue<BacktestQueueData>(BACKTEST_QUEUE_NAME, {
    connection: this.connection,
  });

  constructor() {
    this.connection.on('error', () => undefined);
  }

  add(jobId: string) {
    return this.queue.add(
      BACKTEST_JOB_NAME,
      { jobId },
      {
        jobId,
        attempts: BACKTEST_MAX_ATTEMPTS,
        backoff: { type: 'exponential', delay: 2_000 },
        removeOnComplete: { age: 86_400, count: 1_000 },
        removeOnFail: { age: 604_800, count: 1_000 },
      },
    );
  }

  async getState(jobId: string) {
    const job = await this.queue.getJob(jobId);
    return job ? job.getState() : null;
  }

  async remove(jobId: string) {
    const job = await this.queue.getJob(jobId);
    if (job) await job.remove();
  }

  async onModuleDestroy() {
    await this.queue.close();
  }
}
