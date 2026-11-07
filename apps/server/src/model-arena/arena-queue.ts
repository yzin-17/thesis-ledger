import { Queue, Worker } from 'bullmq';
import { z } from 'zod';
import { redisKey, type RedisService } from '../platform/redis.service.js';
const delivery = z.strictObject({ id: z.uuid(), attempt: z.number().int().positive() });
export type ArenaDelivery = z.infer<typeof delivery>;
export class ArenaQueue {
  private readonly queue: Queue<ArenaDelivery>;
  private readonly worker: Worker<ArenaDelivery>;
  private readonly connection: ReturnType<RedisService['client']['duplicate']>;
  constructor(
    redis: RedisService,
    consume: (item: ArenaDelivery) => Promise<void>,
    error: () => void,
    name: 'rounds' | 'weeklies' = 'rounds',
  ) {
    const testScope = process.env.ARENA_QUEUE_TEST_SCOPE;
    if (
      process.env.NODE_ENV === 'test' &&
      (!z.uuid().safeParse(testScope).success ||
        new URL(process.env.REDIS_URL ?? 'redis://invalid').hostname !== '127.0.0.1')
    )
      throw new Error('测试必须使用隔离队列');
    if (testScope && process.env.NODE_ENV !== 'test') throw new Error('队列测试范围只用于隔离验证');
    const prefix = redisKey('queue', testScope ? 'arena:test:' + testScope : 'arena');
    this.queue = new Queue(name, { connection: redis.client, prefix });
    this.connection = redis.client.duplicate({ maxRetriesPerRequest: null });
    this.worker = new Worker<ArenaDelivery>(name, (job) => consume(delivery.parse(job.data)), {
      connection: this.connection,
      prefix,
      concurrency: 2,
    });
    this.worker.on('error', error);
    this.queue.on('error', error);
    this.connection.on('error', () => undefined);
  }
  async ensure(row: { id: string }, attempt: number) {
    const jobId = row.id + '-' + attempt;
    // 查询异常直接退出本次轮询，下次成功确认缺失后才投递。
    const job = await this.queue.getJob(jobId);
    if (job) {
      const state = await job.getState();
      return state === 'failed' || state === 'completed' ? 'terminal' : 'present';
    }

    await this.queue.add(
      'open',
      { id: row.id, attempt },
      { jobId, attempts: 1, removeOnComplete: { age: 3600 }, removeOnFail: { age: 3600 } },
    );

    return 'added';
  }
  async close() {
    await this.worker.close();
    await this.queue.close();
    if (this.connection.status !== 'end') await this.connection.quit();
  }
}
