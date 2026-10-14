import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { RedisService, redisKey } from '../platform/redis.service.js';

export const AUTHORING_QUEUE_NAME = 'strategy-authoring';
const isolationScope = process.env.AUTHORING_TEST_SCOPE;
if (isolationScope && (process.env.NODE_ENV !== 'test' || !/^[a-f0-9-]{36}$/u.test(isolationScope)))
  throw new Error('编写队列隔离范围只允许测试入口设置');
export const AUTHORING_QUEUE_PREFIX = redisKey(
  'queue',
  isolationScope ? `authoring:test:${isolationScope}` : 'authoring',
);
export const AUTHORING_HEARTBEAT_KEY = `${AUTHORING_QUEUE_PREFIX}:worker-heartbeat`;
export type AuthoringQueueData = { operationId: string };

@Injectable()
export class AuthoringQueue implements OnModuleDestroy {
  readonly queue: Queue<AuthoringQueueData>;
  constructor(private readonly redis: RedisService) {
    this.queue = new Queue(AUTHORING_QUEUE_NAME, {
      connection: redis.client,
      prefix: AUTHORING_QUEUE_PREFIX,
    });
    this.queue.on('error', () => undefined);
  }
  async ready() {
    await this.redis.ping();
    if (!(await this.redis.client.get(AUTHORING_HEARTBEAT_KEY)))
      throw new Error('编写执行组件未就绪');
  }
  async enqueue(operationId: string) {
    await this.queue.add(
      'execute',
      { operationId },
      {
        jobId: operationId,
        attempts: 1,
        removeOnComplete: { age: 3600, count: 1000 },
        removeOnFail: { age: 86400, count: 1000 },
      },
    );
  }
  async missing(operationId: string) {
    // Failed lookup must propagate; callers cannot interpret it as a missing job.
    return (await this.queue.getJob(operationId)) === undefined;
  }
  async deliveryState(operationId: string) {
    const job = await this.queue.getJob(operationId);
    if (!job) return 'missing' as const;
    const state = await job.getState();
    if (state === 'failed' || state === 'completed') return 'finished' as const;
    return 'present' as const;
  }
  async removeFinished(operationId: string) {
    const job = await this.queue.getJob(operationId);
    if (!job) return;
    const state = await job.getState();
    if (state !== 'failed' && state !== 'completed') throw new Error('投递状态已变化');
    await job.remove();
  }
  async onModuleDestroy() {
    await this.queue.close();
  }
}
