import { describe, expect, it, vi } from 'vitest';
import {
  ThesisLedgerApiClient,
  ThesisLedgerApiError,
  ThesisLedgerContractError,
} from '../../src/index.js';
const id = '00000000-0000-4000-8000-000000000001';
const time = '2026-10-23T01:00:00Z';
const rule = {
  id,
  version: 3,
  kind: 'drawdown',
  scope: 'portfolio',
  severity: 'warning',
  threshold: '0.15',
  enabled: false,
  needsRepair: false,
  repairReason: null,
  archivedAt: null,
  symbol: null,
  accountId: null,
  effectiveAt: time,
};
const contexts = [
  {
    symbol: '510300.SH',
    accountId: id,
    mode: 'shadow',
    marketTime: time,
    price: 3,
    dataQuality: { portfolio: 'fresh' },
  },
];
describe('C05 风险与通知共享请求', () => {
  it('读取保留取消与归档参数，Decimal 阈值归一为有限数值', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json([rule]));
    const api = new ThesisLedgerApiClient('https://ledger.test/api/v1', fetcher);
    const signal = new AbortController().signal;
    expect((await api.risk.getRules({ includeArchived: true }, signal))[0]?.threshold).toBe(0.15);
    expect(String(fetcher.mock.calls[0]![0])).toContain('includeArchived=true');
    expect(fetcher.mock.calls[0]![1].signal).toBe(signal);
  });
  it('试算与扫描保持不同端点及副作用边界，扫描标识不更换', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json([{ triggered: false, message: '未触发' }]))
      .mockResolvedValueOnce(Response.json({ traceId: id, scanId: id, results: [] }));
    const api = new ThesisLedgerApiClient('https://ledger.test/api/v1', fetcher);
    await api.risk.testRule(id, contexts);
    await api.risk.scan({ security: contexts, scanId: id, allowStale: false });
    expect(fetcher.mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual([
      `/api/v1/risk/rules/${id}/test`,
      '/api/v1/risk/scan',
    ]);
    expect(JSON.parse(fetcher.mock.calls[0]![1].body)[0].mode).toBe('shadow');
    expect(JSON.parse(fetcher.mock.calls[1]![1].body)).toMatchObject({
      scanId: id,
      allowStale: false,
    });
  });
  it('规则更新与归档/恢复保留规则身份、版本；409 不重试', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ ...rule, id: '00000000-0000-4000-8000-000000000002' }))
      .mockResolvedValueOnce(
        Response.json({ error: 'Conflict', message: '规则冲突' }, { status: 409 }),
      );
    const api = new ThesisLedgerApiClient('https://ledger.test/api/v1', fetcher);
    await expect(api.risk.patchRule(id, { enabled: false })).rejects.toBeInstanceOf(
      ThesisLedgerContractError,
    );
    await expect(api.risk.archiveRule(id)).rejects.toBeInstanceOf(ThesisLedgerApiError);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('通知读取失败不能伪装为空或未配置路由', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ routes: [] }))
      .mockResolvedValueOnce(
        Response.json({ error: 'Unavailable', message: '通知读取失败' }, { status: 503 }),
      );
    const api = new ThesisLedgerApiClient('https://ledger.test/api/v1', fetcher);
    expect(await api.risk.getRouting()).toEqual({ routes: [] });
    await expect(api.risk.getNotifications()).rejects.toBeInstanceOf(ThesisLedgerApiError);
  });
});
