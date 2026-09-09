import { firstValueFrom, filter } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { BacktestEventPublisher } from '../../src/backtest/backtest-event.publisher.js';
import { BacktestEventService } from '../../src/backtest/backtest-event.service.js';

describe('Backtest SSE 事件', () => {
  it('发布的摘要不携带 input/result，并保留列表所需初始资金', async () => {
    const publish = vi.fn(async (...messages: [string, string]) => {
      void messages;
      return 1;
    });
    const prisma = {
      backtestJob: {
        findUnique: vi.fn(async () => ({
          id: 'job-1',
          strategyVersionId: 'version-1',
          status: 'running',
          input: { initialCash: 100_000, bars: [{ close: 1 }] },
          result: { large: true },
        })),
      },
    };
    const publisher = new BacktestEventPublisher(
      prisma as never,
      {
        client: { publish },
      } as never,
    );

    await publisher.publishJob('job-1');

    const payload = JSON.parse(publish.mock.calls[0]![1]) as Record<string, unknown>;
    expect(payload).toMatchObject({ id: 'job-1', initialCash: 100_000 });
    expect(payload).not.toHaveProperty('input');
    expect(payload).not.toHaveProperty('result');
  });

  it('Redis Pub/Sub 更新转换为带 10 秒重连建议的命名 SSE', async () => {
    let messageHandler!: (channel: string, payload: string) => void;
    const subscriber = {
      status: 'ready',
      on: vi.fn((event: string, handler: typeof messageHandler) => {
        if (event === 'message') messageHandler = handler;
      }),
      subscribe: vi.fn(async () => 1),
      quit: vi.fn(async () => 'OK'),
    };
    const service = new BacktestEventService({
      client: { duplicate: vi.fn(() => subscriber) },
    } as never);
    service.onModuleInit();
    const eventPromise = firstValueFrom(
      service.stream().pipe(filter((event) => event.type === 'backtest.job.updated')),
    );

    messageHandler('channel', JSON.stringify({ id: 'job-1', status: 'running' }));

    await expect(eventPromise).resolves.toMatchObject({
      type: 'backtest.job.updated',
      retry: 10_000,
      data: { id: 'job-1', status: 'running' },
    });
    await service.onModuleDestroy();
  });
});
