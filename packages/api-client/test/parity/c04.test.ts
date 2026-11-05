import { describe, expect, it, vi } from 'vitest';
import {
  ThesisLedgerApiClient,
  ThesisLedgerApiError,
  ThesisLedgerContractError,
} from '../../src/index.js';
const accountId = '00000000-0000-4000-8000-000000000001';
const summary = {
  accountId,
  snapshots: [],
  ttwror: null,
  xirr: null,
  ttwrorReason: '快照不足',
  xirrReason: '快照不足',
};
describe('C04 收益请求合同', () => {
  it('完整范围、日期与汇率参数以及取消信号保真', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(summary));
    const api = new ThesisLedgerApiClient('https://ledger.test/api/v1', fetcher);
    const signal = new AbortController().signal;
    await api.performance.getSummary(
      {
        mode: 'shadow',
        accountId,
        start: '2026-01-01',
        end: '2026-10-23',
        fxMerge: true,
        baseCurrency: 'USD',
      },
      signal,
    );
    const url = new URL(String(fetcher.mock.calls[0]![0]));
    expect(Object.fromEntries(url.searchParams)).toEqual({
      mode: 'shadow',
      accountId,
      start: '2026-01-01',
      end: '2026-10-23',
      fxMerge: 'true',
      baseCurrency: 'USD',
    });
    expect(fetcher.mock.calls[0]![1].signal).toBe(signal);
    expect(() => api.performance.getHistory({ start: '2026-10-23', end: '2026-01-01' })).toThrow();
  });
  it('错误数据与错账户目标不能退化为零或空集', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json([{ capturedAt: '2026-01-01', marketValue: 'bad' }]))
      .mockResolvedValueOnce(Response.json({ scope: 'portfolio', accountId: null, targets: {} }));
    const api = new ThesisLedgerApiClient('https://ledger.test/api/v1', fetcher);
    await expect(api.performance.getHistory()).rejects.toBeInstanceOf(ThesisLedgerContractError);
    await expect(api.performance.getTargets({ accountId })).rejects.toBeInstanceOf(
      ThesisLedgerContractError,
    );
  });
  it('走势保留来源、质量、覆盖率和粒度，拒绝返回错误区间', async () => {
    const series = {
      range: '1Y',
      interval: '1d',
      currency: 'CNY',
      availableIntervals: ['1d'],
      defaultInterval: '1d',
      dataQuality: 'LOW_COVERAGE',
      historyStart: null,
      points: [
        {
          at: '2026-01-01T00:00:00Z',
          value: '100.25',
          currency: 'CNY',
          valuationBasis: 'ESTIMATED',
          disclosureCoverage: 0.2,
          pricedCoverage: 0.3,
          dataQuality: 'LOW_COVERAGE',
          sourceSnapshotId: 'snapshot-1',
        },
      ],
    };
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json(series))
      .mockResolvedValueOnce(Response.json({ ...series, range: '1D' }));
    const api = new ThesisLedgerApiClient('https://ledger.test/api/v1', fetcher);
    expect(
      (await api.performance.getSeries({ range: '1Y', interval: '1d' })).points[0],
    ).toMatchObject({ value: 100.25, sourceSnapshotId: 'snapshot-1', dataQuality: 'LOW_COVERAGE' });
    await expect(api.performance.getSeries({ range: '1Y', interval: '1d' })).rejects.toBeInstanceOf(
      ThesisLedgerContractError,
    );
  });
  it('目标保存保持现行请求语义，409 只传播一次', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json({ error: 'Conflict', message: '保存冲突' }, { status: 409 }),
      );
    const api = new ThesisLedgerApiClient('https://ledger.test/api/v1', fetcher);
    const input = { scope: 'account' as const, accountId, targets: { stock: 0.5, cash: 0.5 } };
    await expect(api.performance.saveTargets(input)).rejects.toBeInstanceOf(ThesisLedgerApiError);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toEqual(input);
  });
});
