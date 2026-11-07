import {
  Inject,
  Injectable,
  Logger,
  type OnModuleInit,
  type OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from '../platform/prisma.service.js';
import { RedisService } from '../platform/redis.service.js';
import { ArenaQueue } from './arena-queue.js';
import { ArenaWeekStore } from './arena-week-store.js';
@Injectable()
export class ArenaWeekWorker implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(ArenaWeekWorker.name);
  private queue?: ArenaQueue;
  private timer?: ReturnType<typeof setInterval>;
  private active: Promise<void> | undefined;
  private nextDiscovery = 0;
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(RedisService) private readonly redis: RedisService,
    @Inject(ArenaWeekStore) private readonly weeks: ArenaWeekStore,
  ) {}
  onModuleInit() {
    if (process.env.NODE_ENV !== 'test') this.start();
  }
  start() {
    if (this.queue) return;
    const error = () => this.log.warn('模型周报队列等待恢复');
    this.queue = new ArenaQueue(this.redis, (item) => this.weeks.execute(item), error, 'weeklies');
    const tick = () => void this.run().catch(error);
    this.timer = setInterval(tick, 15000);
    this.timer.unref();
    tick();
  }
  run() {
    return (this.active ??= this.poll().finally(() => {
      this.active = undefined;
    }));
  }
  private async poll() {
    if (!this.queue) return;
    const now = new Date();
    if (now.getTime() >= this.nextDiscovery) {
      await this.weeks.discover(now);
      this.nextDiscovery = now.getTime() + 300000;
    }
    const expired = await this.db.arenaWeek.findMany({
      where: { state: 'running', leaseUntil: { lte: now } },
      take: 100,
    });
    for (const r of expired) await this.weeks.retry(r.id, r.attempt, 'lease_expired');
    const jobs = await this.db.arenaWeek.findMany({
      where: { state: 'scheduled', cutoff: { lte: now } },
      orderBy: [{ cutoff: 'asc' }, { id: 'asc' }],
      take: 100,
    });
    for (const job of jobs) {
      const attempt = job.attempt + 1;
      if ((await this.queue.ensure(job, attempt)) === 'terminal')
        await this.db.arenaWeek.updateMany({
          where: { id: job.id, state: 'scheduled', attempt: job.attempt },
          data: {
            attempt,
            state: attempt >= job.attemptBase + 3 ? 'failed' : 'scheduled',
            reason: 'delivery_ended_before_claim',
          },
        });
    }
  }
  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.active;
    await this.queue?.close();
  }
}
