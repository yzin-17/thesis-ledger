import { describe, expect, it, vi } from 'vitest';
import { firstValueFrom, of, toArray } from 'rxjs';
import { BacktestController } from '../../src/backtest/backtest.controller.js';

describe('Backtest HTTP 读取契约', () => {
  it('权限查询延迟时仍按事实事件顺序发送运行与取消终态', async () => {
    let releaseLookup!: (allowed: boolean) => void;
    const firstLookup = new Promise<boolean>((resolve) => { releaseLookup = resolve; });
    let lookups = 0;
    const updates = [
      { type: 'status', data: { id: 'job-1', status: 'running' } },
      { type: 'status', data: { id: 'job-1', status: 'cancelled' } },
    ];
    const events = { stream: () => of(...updates) };
    const access = { canReadRun: () => (++lookups === 1 ? firstLookup : Promise.resolve(true)) };
    const controller = new BacktestController({} as never, events as never, access as never);
    const result = firstValueFrom(controller.events(null).pipe(toArray()));
    await new Promise((resolve) => setTimeout(resolve, 0));
    releaseLookup(true);
    expect(await result).toEqual(updates);
  });

  it('现行 Run 摘要和数据库事实事件流', async () => {
    const summaries = [{ id: 'job-1', status: 'queued' }];
    const stream = of({ type: 'heartbeat', data: {} }, { type: 'status', data: { id: 'job-1' } }, { type: 'status', data: { id: 'private' } });
    const service = {
      listCurrentRunSummaries: vi.fn(async () => summaries),
    };
    const events = { stream: vi.fn(() => stream) };
    const access = { canReadRun: vi.fn(async (id: string) => id === 'job-1') };
    const controller = new BacktestController(service as never, events as never, access as never);

    await expect(controller.runs(null)).resolves.toEqual(summaries);
    expect(service.listCurrentRunSummaries).toHaveBeenCalledWith(null);
    expect(await firstValueFrom(controller.events(null).pipe(toArray()))).toEqual([
      { type: 'heartbeat', data: {} }, { type: 'status', data: { id: 'job-1' } },
    ]);
    expect(access.canReadRun).toHaveBeenCalledWith('private', null);
  });
  it('已撤销会话的事件连接不继续发送私有任务', async () => {
    const access = { canReadRun: vi.fn(async () => true) };
    const identities = { requireSession: vi.fn().mockRejectedValue(new Error('会话已撤销')) };
    const controller = new BacktestController({} as never, { stream: () => of({ type: 'status', data: { id: 'private' } }) } as never, access as never, identities as never);
    expect(await firstValueFrom(controller.events('owner', 'opaque').pipe(toArray()))).toEqual([]);
    expect(access.canReadRun).not.toHaveBeenCalled();
  });
});
