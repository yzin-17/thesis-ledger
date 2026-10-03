import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ close: vi.fn(), disconnect: vi.fn() }));
vi.mock('bullmq', () => ({ Queue: class { close = mocks.close; } }));
vi.mock('ioredis', () => ({ Redis: class { on = vi.fn(); disconnect = mocks.disconnect; } }));
vi.mock('../../src/platform/config.js', () => ({
  loadConfig: () => ({ redisUrl: 'redis://127.0.0.1:16379' }),
}));
import { BacktestBullQueue } from '../../src/backtest/backtest-bull-queue.js';

beforeEach(() => { vi.resetAllMocks(); });

it('关闭队列后释放适配器拥有的连接', async () => {
  mocks.close.mockResolvedValue(undefined);
  await new BacktestBullQueue().onModuleDestroy();
  expect(mocks.close).toHaveBeenCalledOnce();
  expect(mocks.disconnect).toHaveBeenCalledOnce();
  expect(mocks.close.mock.invocationCallOrder[0]).toBeLessThan(mocks.disconnect.mock.invocationCallOrder[0]!);
});

it('关闭失败仍释放连接并保留原异常', async () => {
  const failure = new Error('queue close failed');
  mocks.close.mockRejectedValue(failure);
  await expect(new BacktestBullQueue().onModuleDestroy()).rejects.toBe(failure);
  expect(mocks.disconnect).toHaveBeenCalledOnce();
});
