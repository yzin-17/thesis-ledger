import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { interval, map, merge, Observable, Subject } from 'rxjs';
import { RedisService } from '../platform/redis.service.js';
import { BACKTEST_EVENT_CHANNEL } from './backtest-event.publisher.js';
import type { BacktestJobSummary } from './backtest-summary.js';

export type BacktestServerEvent =
  | { type: 'backtest.job.updated'; data: BacktestJobSummary; retry: 10_000 }
  | { type: 'heartbeat'; data: { at: string }; retry: 10_000 };

@Injectable()
export class BacktestEventService implements OnModuleInit, OnModuleDestroy {
  private readonly updates = new Subject<BacktestJobSummary>();
  private readonly subscriber;

  constructor(private readonly redis: RedisService) {
    this.subscriber = redis.client.duplicate({ lazyConnect: true, maxRetriesPerRequest: null });
    this.subscriber.on('error', () => undefined);
  }

  onModuleInit() {
    this.subscriber.on('message', (_channel, payload) => {
      try {
        this.updates.next(JSON.parse(payload) as BacktestJobSummary);
      } catch {
        // Invalid Pub/Sub payloads are ignored; the periodic summary read remains authoritative.
      }
    });
    void this.subscriber.subscribe(BACKTEST_EVENT_CHANNEL).catch(() => undefined);
  }

  stream(): Observable<BacktestServerEvent> {
    const updates = this.updates.pipe(
      map((data) => ({ type: 'backtest.job.updated' as const, data, retry: 10_000 as const })),
    );
    const heartbeats = interval(20_000).pipe(
      map(() => ({
        type: 'heartbeat' as const,
        data: { at: new Date().toISOString() },
        retry: 10_000 as const,
      })),
    );
    return merge(updates, heartbeats);
  }

  async onModuleDestroy() {
    this.updates.complete();
    if (this.subscriber.status !== 'end') await this.subscriber.quit();
  }
}
