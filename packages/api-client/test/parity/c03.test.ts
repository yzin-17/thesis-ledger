import { describe, expect, it, vi } from 'vitest';
import {
  ThesisLedgerApiClient,
  ThesisLedgerApiError,
  ThesisLedgerContractError,
} from '../../src/index.js';

const accountId = '00000000-0000-4000-8000-000000000001';
const id = '00000000-0000-4000-8000-000000000002';
const time = '2026-10-23T00:00:00Z';
const plan = {
  id,
  accountId,
  name: '模拟入账',
  expectedAmount: '100',
  currency: 'CNY',
  dayOfMonth: 23,
  timezone: 'Asia/Shanghai',
  startPeriod: '2026-10',
  status: 'ACTIVE',
  nextDueAt: time,
  version: 3,
  pausedAt: null,
  endedAt: null,
  createdAt: time,
  updatedAt: time,
};
const occurrence = {
  id,
  planId: id,
  accountId,
  periodKey: '2026-10',
  planName: '模拟入账',
  scheduledFor: time,
  expectedAmount: '100',
  currency: 'CNY',
  status: 'PENDING',
  actualAmount: null,
  occurredAt: null,
  ledgerEventId: null,
  ledgerFactId: null,
  version: 2,
  skippedReason: null,
  confirmedAt: null,
  skippedAt: null,
  createdAt: time,
  updatedAt: time,
};

describe('C03 现金与定期计划共享请求边界', () => {
  it('现金快照校验写入响应与账户，不将快照作为现金流命令', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ accountId, amount: '0', currency: 'CNY', sourceOfTruth: 'ledger' }),
      )
      .mockResolvedValueOnce(
        Response.json({ accountId: id, amount: '0', currency: 'CNY', sourceOfTruth: 'ledger' }),
      );
    const api = new ThesisLedgerApiClient('https://ledger.test/api/v1', fetcher);
    const input = {
      accountId,
      amount: '0',
      currency: 'CNY' as const,
      capturedAt: time,
      source: 'manual' as const,
    };
    await api.cash.recordBalance(input);
    expect(String(fetcher.mock.calls[0]![0])).toBe('https://ledger.test/api/v1/portfolio/cash');
    expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toEqual(input);
    await expect(api.cash.recordBalance(input)).rejects.toBeInstanceOf(ThesisLedgerContractError);
  });
  it('读取保留筛选与取消信号，并校验账户身份', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json([plan]))
      .mockResolvedValueOnce(Response.json([{ ...occurrence, accountId: id }]));
    const api = new ThesisLedgerApiClient('https://ledger.test/api/v1', fetcher);
    const signal = new AbortController().signal;
    expect(await api.cashDeposits.getPlans({ accountId, status: 'ACTIVE' }, signal)).toEqual([
      plan,
    ]);
    expect(String(fetcher.mock.calls[0]![0])).toContain(`accountId=${accountId}&status=ACTIVE`);
    expect(fetcher.mock.calls[0]![1].signal).toBe(signal);
    await expect(api.cashDeposits.getOccurrences({ accountId }, signal)).rejects.toBeInstanceOf(
      ThesisLedgerContractError,
    );
  });

  it.each(['pausePlan', 'resumePlan', 'endPlan'] as const)(
    '状态动作 %s 不更换版本或隐式重试',
    async (action) => {
      const fetcher = vi
        .fn()
        .mockResolvedValue(
          Response.json({ code: 'VERSION_CONFLICT', message: '版本冲突' }, { status: 409 }),
        );
      const api = new ThesisLedgerApiClient('https://ledger.test/api/v1', fetcher);
      await expect(api.cashDeposits[action](id, 3)).rejects.toBeInstanceOf(ThesisLedgerApiError);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toEqual({ expectedVersion: 3 });
    },
  );

  it('确认、跳过和重开使用独立发生项命令', async () => {
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(Response.json(occurrence)));
    const api = new ThesisLedgerApiClient('https://ledger.test/api/v1', fetcher);
    await api.cashDeposits.confirmOccurrence(id, {
      expectedVersion: 2,
      actualAmount: '101.25',
      occurredAt: time,
    });
    await api.cashDeposits.skipOccurrence(id, { expectedVersion: 2, reason: '本期跳过' });
    await api.cashDeposits.reopenOccurrence(id, 2);
    expect(fetcher.mock.calls.map(([url]) => String(url).split('/').at(-1))).toEqual([
      'confirm',
      'skip',
      'reopen',
    ]);
    expect(fetcher.mock.calls.map(([, init]) => JSON.parse(init.body).expectedVersion)).toEqual([
      2, 2, 2,
    ]);
    expect(JSON.parse(fetcher.mock.calls[0]![1].body).actualAmount).toBe('101.25');
  });

  it('基金确认保持日期精度、份额、净值和费用；无效输入不发请求', async () => {
    const fundOccurrence = {
      ...occurrence,
      symbol: '000001.OF',
      fundName: '测试基金',
      actualQuantity: null,
      unitPrice: null,
      commission: null,
    };
    const { actualAmount: _amount, ...response } = fundOccurrence;
    expect(_amount).toBeNull();
    const fetcher = vi.fn().mockResolvedValue(Response.json(response));
    const api = new ThesisLedgerApiClient('https://ledger.test/api/v1', fetcher);
    const input = {
      expectedVersion: 2,
      actualQuantity: '50',
      unitPrice: '2',
      commission: '1',
      occurredAt: '2026-10-23',
    };
    await api.fundInvestments.confirmOccurrence(id, input);
    expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toEqual(input);
    expect(() =>
      api.fundInvestments.confirmOccurrence(id, { ...input, occurredAt: time }),
    ).toThrow();
    expect(() =>
      api.fundInvestments.skipOccurrence(id, { expectedVersion: 0, reason: '' }),
    ).toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('错误响应不退化为空列表，取消错误原样传播', async () => {
    const aborted = new DOMException('aborted', 'AbortError');
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ items: [] }))
      .mockRejectedValueOnce(aborted);
    const api = new ThesisLedgerApiClient('https://ledger.test/api/v1', fetcher);
    await expect(api.cashDeposits.getPlans()).rejects.toBeInstanceOf(ThesisLedgerContractError);
    await expect(api.fundInvestments.getPlans()).rejects.toBe(aborted);
  });
});
