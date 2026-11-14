import { afterEach, expect, it, vi } from 'vitest';
import { LiveResearchControl } from '../../src/model-arena/live/live-research-control.js';
import type { LiveDatabase } from '../../src/model-arena/live/live-storage.js';

afterEach(() => vi.useRealTimers());
function setup(deadline: Date | null = null) {
  const query = vi.fn().mockResolvedValue([{ id: 'controlled' }]);
  const control = new LiveResearchControl({ $queryRaw: query } as unknown as LiveDatabase, 'controlled', 1, deadline);
  return { control, query };
}
it('不限时研究持续续约，超过原五分钟和单次租约也不中止', async () => {
  vi.useFakeTimers();
  const { control, query } = setup();
  await control.start(); await vi.advanceTimersByTimeAsync(20 * 60 * 1000);
  expect(control.signal.aborted).toBe(false); expect(query.mock.calls.length).toBeGreaterThan(200);
  const dates = query.mock.calls.at(-1)!.filter((value) => value instanceof Date) as Date[];
  expect(dates[0]!.getTime() - Date.now()).toBe(60000);
  await control.close(); const count = query.mock.calls.length;
  await vi.advanceTimersByTimeAsync(60000); expect(query).toHaveBeenCalledTimes(count);
});
it('有限截止精确中止，不续约越过业务截止', async () => {
  vi.useFakeTimers();
  const { control } = setup(new Date(Date.now() + 12000));
  await control.start(); await vi.advanceTimersByTimeAsync(12000);
  expect(control.signal.reason).toEqual(new Error('cycle_deadline')); await control.close();
});
it('取消、失效 attempt 或已丢租约不能继续续约', async () => {
  vi.useFakeTimers();
  const { control, query } = setup(); await control.start(); query.mockResolvedValue([]);
  await vi.advanceTimersByTimeAsync(5000);
  expect(control.signal.reason).toEqual(new Error('cycle_not_active')); await control.close();
});
it('状态读取失败中止，不把失败当作缺失或延长租约', async () => {
  const { control, query } = setup(); query.mockRejectedValue(new Error('受控数据库故障'));
  await expect(control.start()).rejects.toThrow('research_control_unavailable'); await control.close();
});
it('Worker 停止向在途任务传递中止，不等待固定业务截止', async () => {
  const { control } = setup(); await control.start(); control.abort('worker_stopping');
  expect(control.signal.reason).toEqual(new Error('worker_stopping')); await control.close();
});
