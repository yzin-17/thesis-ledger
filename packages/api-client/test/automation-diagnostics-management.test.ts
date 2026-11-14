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
  it('健康历史保留当前验证身份、过程状态及操作事件，拒绝旧详情', async () => {
    const validation = {
      kind: 'ai_provider_validation',
      operationId: '93d88c31-91e9-4014-a727-c6fd03734f78',
      requestId: 'ba72dbf0-958d-4c88-8cb6-03b7a6f9592f',
      fingerprint: 'route-fingerprint',
      model: 'model',
      purpose: 'research',
      mode: 'native_schema',
      status: 'pending',
      usage: { status: 'unknown', inputTokens: null, outputTokens: null },
    };
    const record = {
      provider: 'controlled',
      state: 'degraded',
      latencyMs: 0,
      checkedAt: '2026-11-12T10:00:00Z',
    };
    const page = {
      page: 1,
      pageSize: 20,
      total: 2,
      totalPages: 1,
      items: [
        { ...record, details: validation },
        {
          ...record,
          details: {
            kind: 'ai_provider_validation_operation',
            planFingerprint: 'plan',
            status: 'running',
          },
        },
      ],
    };
    expect(await setup(page).api.diagnostics.healthHistory()).toEqual(page);
    await expect(
      setup({
        ...page,
        items: [{ ...record, details: { kind: 'ai_provider_test' } }],
      }).api.diagnostics.healthHistory(),
    ).rejects.toBeInstanceOf(ThesisLedgerContractError);
  });
  it('质量诊断读取全部未关闭问题并保留发现时间', async () => {
    const detectedAt = '2026-11-09T01:00:00Z';
    const { api, fetcher } = setup([
      {
        id: 'quality',
        provider: 'dsa',
        symbol: '600519.SH',
        severity: 'error',
        code: 'response_schema_invalid',
        status: 'acknowledged',
        detectedAt,
        details: { occurrences: 2 },
      },
    ]);
    expect((await api.diagnostics.issues())[0]).toMatchObject({
      status: 'acknowledged',
      detectedAt,
      details: { occurrences: 2 },
    });
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('status=unresolved');
  });
  it('诊断从服务端读取异常分页，保留顶层错误码并支持取消', async () => {
    const value = {
      items: [
        {
          provider: 'dsa',
          state: 'down',
          errorCode: 'timeout',
          latencyMs: 120,
          checkedAt: '2026-11-09T01:00:00Z',
        },
      ],
      page: 2,
      pageSize: 20,
      total: 21,
      totalPages: 2,
    };
    const { api, fetcher } = setup(value);
    const signal = new AbortController().signal;
    expect((await api.diagnostics.healthFailures(2, signal)).items[0]?.errorCode).toBe('timeout');
    expect(String(fetcher.mock.calls[0]?.[0])).toContain(
      '/providers/health/issues?page=2&pageSize=20',
    );
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ signal, cache: 'no-store' });
    const automation = setup({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 });
    await automation.api.diagnostics.automationFailures();
    expect(String(automation.fetcher.mock.calls[0]?.[0])).toContain('/automations/issues?page=1');
    const notifications = setup([]);
    await notifications.api.diagnostics.notificationFailures();
    expect(String(notifications.fetcher.mock.calls[0]?.[0])).toContain('status=failed,retrying');
    expect(() => api.diagnostics.healthFailures(0)).toThrow('页码');
    expect(() => api.diagnostics.automationFailures(-1)).toThrow('页码');
  });
  it('异常合同拒绝混入健康、成功及过程记录的 HTTP 200 响应', async () => {
    const page = { page: 1, pageSize: 20, total: 928, totalPages: 47 };
    const check = {
      provider: 'dsa',
      state: 'degraded',
      latencyMs: 10,
      checkedAt: '2026-11-09T01:00:00Z',
    };
    for (const item of [
      { ...check, state: 'healthy' },
      { ...check, errorCode: 'pending' },
      { ...check, errorCode: 'operation_authorized' },
      { ...check, errorCode: 'validation_cancelled' },
    ]) {
      await expect(
        setup({
          ...page,
          items: [{ ...check, errorCode: 'timeout' }, item],
        }).api.diagnostics.healthFailures(),
      ).rejects.toBeInstanceOf(ThesisLedgerContractError);
    }
    const run = {
      id,
      jobId: id,
      status: 'succeeded',
      startedAt: '2026-11-09T01:00:00Z',
      error: null,
    };
    await expect(
      setup({ ...page, items: [run] }).api.diagnostics.automationFailures(),
    ).rejects.toBeInstanceOf(ThesisLedgerContractError);
    await expect(
      setup({ ...page, items: [{ ...check, errorCode: null }] }).api.diagnostics.healthFailures(),
    ).resolves.toMatchObject({ total: 928 });
  });
  it('旧服务不支持异常接口时保留 404 错误，不回退为普通历史', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(
        async () => new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 }),
      );
    const api = new ThesisLedgerApiClient('https://fixture.test/api/v1', fetcher);
    await expect(api.diagnostics.healthFailures()).rejects.toThrow();
    await expect(api.diagnostics.automationFailures()).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.every(([url]) => String(url).includes('/issues?'))).toBe(true);
  });
});

describe('自动化任务管理与监测结果', () => {
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
  it('保留监测来源、未开始时间、部分失败和来源读取缺口', async () => {
    const monitor = {
      ...job,
      id: 'rule-source-monitor',
      type: 'rule-source-monitor',
      managed: true,
      enabled: null,
      source: 'rule-monitor',
      readError: 'rule_monitor_unavailable',
      scheduleLabel: '每24小时检查一次',
    };
    expect((await setup([monitor]).api.automations.list())[0]).toMatchObject(monitor);
    const value = {
      items: [
        {
          id: 'rule-source-monitor:run',
          jobId: 'rule-source-monitor',
          jobName: '收费资料更新检查',
          status: 'partial',
          startedAt: null,
          createdAt: '2026-11-09T00:00:00Z',
          error: '收费通告：资料网站返回错误',
          summary: '自动检查；1份暂不可读',
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
      sourceWarnings: [{ source: 'rule-monitor', code: 'rule_monitor_unavailable' }],
    };
    expect(await setup(value).api.diagnostics.automationFailures()).toMatchObject(value);
    expect(await setup(value).api.automations.history()).toMatchObject(value);
  });
});
