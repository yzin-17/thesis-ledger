import { describe, expect, it, vi } from 'vitest';
import { JournalService } from '../../src/journal/journal.service.js';

describe('Journal 与行为复盘', () => {
  it('按账户范围查询日志/计划，并输出反事实和周期复盘', async () => {
    const prisma = {
      journalEntry: {
        findMany: vi.fn(async () => [{ id: 'entry', accountId: 'a' }]),
        create: vi.fn(async ({ data }: { data: object }) => data),
        findUnique: vi.fn(async () => ({ id: 'entry' })),
        update: vi.fn(async ({ data }: { data: object }) => data),
      },
      tradePlan: {
        findMany: vi.fn(async () => [{ id: 'plan', accountId: 'a' }]),
        create: vi.fn(async ({ data }: { data: object }) => data),
      },
    };
    const service = new JournalService(prisma as never);
    await expect(service.listEntries(undefined, 'a')).resolves.toEqual([
      { id: 'entry', accountId: 'a' },
    ]);
    await expect(service.listPlans(undefined, 'a')).resolves.toEqual([
      { id: 'plan', accountId: 'a' },
    ]);
    await expect(
      service.counterfactual({
        trades: [
          {
            symbol: '600519.SH',
            entryAt: '2025-01-01',
            exitAt: '2025-01-03',
            pnl: -10,
            entryPrice: 10,
          },
        ],
        enforceStop: true,
        stopPrice: 9.5,
      }),
    ).toMatchObject({ counterfactualPnl: -0.5 });
    const planned = service.plannedVsActual({
      symbol: '600519.SH',
      entryAt: '2025-01-01',
      exitAt: '2025-01-03',
      pnl: -10,
      plannedEntry: 10,
      entryPrice: 10.2,
      plannedExit: 11,
      exitPrice: 10.5,
      plannedHoldingDays: 1,
    });
    expect(planned.entryDeviation).toBeCloseTo(0.2);
    expect(planned.exitDeviation).toBeCloseTo(-0.5);
    expect(
      service.review({
        trades: [
          {
            symbol: '600519.SH',
            entryAt: '2025-01-01',
            exitAt: '2025-01-03',
            pnl: -10,
          },
        ],
        start: '2025-01-01',
        end: '2025-01-04',
      }),
    ).toMatchObject({ tradeCount: 1, behavior: { winRate: 0 } });
  });
});
