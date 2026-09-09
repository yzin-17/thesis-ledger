import { describe, expect, it, vi } from 'vitest';
import { BacktestController } from '../../src/backtest/backtest.controller.js';

describe('Backtest HTTP 读取契约', () => {
  it('分别暴露轻量摘要和数据库事实事件流', async () => {
    const summaries = [{ id: 'job-1', status: 'queued' }];
    const stream = { subscribe: vi.fn() };
    const service = {
      listJobSummaries: vi.fn(async () => summaries),
    };
    const events = { stream: vi.fn(() => stream) };
    const controller = new BacktestController(service as never, events as never);

    await expect(controller.jobSummaries()).resolves.toEqual(summaries);
    expect(controller.events()).toBe(stream);
  });
});
