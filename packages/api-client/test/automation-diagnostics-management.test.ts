import { describe, expect, it, vi } from 'vitest';
import { ThesisLedgerApiClient, ThesisLedgerContractError } from '../src/index.js';
const id = '7b355ed2-bcb7-4234-af08-10441ab20e34';
const job = {
  id,
  name: 'B5 受控任务',
  type: 'provider-health',
  cron: '0 9 * * 1-5',
  timezone: 'Asia/Shanghai',
  enabled: false,
  nextRunAt: null,
  managed: false,
};
function setup(value: unknown) {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => new Response(JSON.stringify(value)));
  return { api: new ThesisLedgerApiClient('https://fixture.test/api/v1', fetcher), fetcher };
}
describe('自动化与诊断共享合同', () => {
  it('创建合同拒绝托管字段，更新不能改写任务类型、重试或锁', () => {
    const { api, fetcher } = setup(job);
    expect(() => api.automations.create({ ...job, systemKey: 'system' } as never)).toThrow();
    expect(() => api.automations.update(id, { type: 'backup' } as never)).toThrow();
    expect(() => api.automations.update(id, { lockTtlMs: 1 } as never)).toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('立即运行仅发一次请求，保留锁跳过和结果不确定的事实', async () => {
    const { api, fetcher } = setup({ skipped: true, reason: '锁已占用' });
    await expect(api.automations.run(id)).resolves.toEqual({ skipped: true, reason: '锁已占用' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[1]?.method).toBe('POST');
    await expect(setup({ status: 'succeeded' }).api.automations.run(id)).rejects.toBeInstanceOf(
      ThesisLedgerContractError,
    );
  });
  it('更新和删除核对任务归属，保留 managed 状态供 UI 限制', async () => {
    await expect(setup({ ...job, managed: true }).api.automations.list()).rejects.toBeInstanceOf(
      ThesisLedgerContractError,
    );
    await expect(setup([{ ...job, managed: true }]).api.automations.list()).resolves.toEqual([
      { ...job, managed: true },
    ]);
    await expect(
      setup({ ...job, id: 'other' }).api.automations.update(id, { name: '修改' }),
    ).rejects.toBeInstanceOf(ThesisLedgerContractError);
  });
  it('历史携带分页、任务过滤和取消信号，保留当前页收缩', async () => {
    const value = { items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 };
    const { api, fetcher } = setup(value);
    const signal = new AbortController().signal;
    await expect(api.automations.history(3, id, signal)).resolves.toEqual(value);
    expect(String(fetcher.mock.calls[0]?.[0])).toContain(`page=3&pageSize=20&jobId=${id}`);
    expect(fetcher.mock.calls[0]?.[1]?.signal).toBe(signal);
  });
  it('诊断非法响应与网络错误保持错误，合法旧数组明确归一化', async () => {
    await expect(setup({ items: [] }).api.diagnostics.healthHistory()).rejects.toBeInstanceOf(
      ThesisLedgerContractError,
    );
    await expect(setup([]).api.diagnostics.healthHistory()).resolves.toEqual({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
    });
    await expect(setup({}).api.diagnostics.notificationFailures()).rejects.toBeInstanceOf(
      ThesisLedgerContractError,
    );
  });
});
