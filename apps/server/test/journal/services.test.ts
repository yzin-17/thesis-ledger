import { describe, expect, it, vi } from 'vitest';
import { JournalService } from '../../src/journal/journal.service.js';

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
