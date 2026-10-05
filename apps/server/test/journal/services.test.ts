import { describe, expect, it, vi } from 'vitest';
import { JournalService } from '../../src/journal/journal.service.js';
import { JournalLegacyAnalysis } from '../../src/journal/journal-legacy-analysis.js';

describe('Journal 原始说明与计划', () => {
  const setup = () => {
    const prisma = {
      journalEntry: {
        findMany: vi.fn().mockResolvedValue([{ id: 'entry', accountId: 'a' }]),
        create: vi.fn().mockResolvedValue({ id: 'created' }),
        findUnique: vi.fn().mockResolvedValue(null),
        update: vi.fn(),
      },
      tradePlan: {
        findMany: vi.fn().mockResolvedValue([{ id: 'plan', accountId: 'a' }]),
        create: vi.fn().mockResolvedValue({ id: 'created-plan' }),
      },
    };
    return { prisma, service: new JournalService(prisma as never) };
  };
  it('日志与计划显式按账户/标的读取，保留原始行', async () => {
    const { service, prisma } = setup();
    expect(await service.listEntries('AAPL.US', 'a')).toEqual([{ id: 'entry', accountId: 'a' }]);
    expect(await service.listPlans('AAPL.US', 'a')).toEqual([{ id: 'plan', accountId: 'a' }]);
    for (const query of [prisma.journalEntry.findMany, prisma.tradePlan.findMany])
      expect(query).toHaveBeenCalledWith({
        where: { accountId: 'a', symbol: 'AAPL.US' },
        orderBy: { createdAt: 'desc' },
      });
    expect(prisma.journalEntry.create).not.toHaveBeenCalled();
    expect(prisma.tradePlan.create).not.toHaveBeenCalled();
  });
  it('修改不存在的说明拒绝写入，导出保留说明原始数据', async () => {
    const { service, prisma } = setup();
    await expect(service.updateEntry('missing', { notes: '修订' })).rejects.toThrow(
      '交易日志不存在',
    );
    expect(prisma.journalEntry.update).not.toHaveBeenCalled();
    expect(await service.exportEntries(undefined, 'a')).toMatchObject({
      scope: { accountId: 'a' },
      entries: [{ id: 'entry', accountId: 'a' }],
    });
  });
});

describe('显式 number 兼容分析', () => {
  it('仅计算旧输入，保留历史反事实及周期口径', () => {
    const legacy = new JournalLegacyAnalysis();
    const trade = {
      symbol: 'AAPL.US',
      entryAt: '2026-01-01T00:00:00Z',
      exitAt: '2026-01-03T00:00:00Z',
      pnl: -2,
      plannedStop: 9,
      actualExit: 8,
    };
    expect(legacy.counterfactual({ trades: [trade], enforceStop: true })).toHaveProperty(
      'counterfactualPnl',
    );
    expect(
      legacy.review({
        trades: [trade],
        start: '2026-01-01T00:00:00Z',
        end: '2026-01-04T00:00:00Z',
      }),
    ).toMatchObject({ tradeCount: 1, start: '2026-01-01T00:00:00Z', end: '2026-01-04T00:00:00Z' });
  });
});
