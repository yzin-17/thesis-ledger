import { expect, it, vi } from 'vitest';
import { arenaProtocolSchema } from '@thesis-ledger/schemas';
import { ArenaComparisons } from '../../src/model-arena/arena-comparison.js';
const arenaId = '00000000-0000-4000-8000-000000000002';
const ownerId = '00000000-0000-4000-8000-000000000003';

function fixture() {
  const budget = { requests: 10, tokens: 10000, costMicros: 1000000 };
  const protocol = arenaProtocolSchema.parse({
    version: 1,
    title: '受控比较',
    market: 'US',
    currency: 'USD',
    timeZone: 'America/New_York',
    calendarId: 'fixture',
    calendarVersion: 'fixture',
    startsOn: '2026-11-10',
    endsOn: '2026-11-20',
    instruments: [
      {
        instrumentId: '00000000-0000-4000-8000-000000000001',
        symbol: 'AAPL.US',
        assetType: 'STOCK',
      },
    ],
    entrants: [
      {
        providerId: 'fixture',
        model: 'fixture',
        budget,
        maxInputTokens: 100,
        maxOutputTokens: 100,
      },
    ],
    initialCash: '1000',
    maxPositionBps: 10000,
    fees: { version: 'fixture', buyBps: 0, sellBps: 0, minimum: '0', slippageBps: 0 },
    benchmarks: ['cash', 'equal_weight_buy_hold'],
    decisionDeadlineMinutes: 10,
    maxInfrastructureAttempts: 2,
    budgetCurrency: 'USD',
    budget,
  });
  const db = {
    modelArena: { findFirst: vi.fn().mockResolvedValue({ protocol, entrants: [] }) },
    arenaOccurrence: { findMany: vi.fn().mockResolvedValue([]) },
    arenaRound: { findMany: vi.fn().mockResolvedValue([]) },
    arenaFill: { findMany: vi.fn().mockResolvedValue([]) },
  };
  return { service: new ArenaComparisons(db as never), db };
}

it.each([
  ['2026-11-10T02:00:00Z', '2026-11-10'],
  ['2026-11-13T02:00:00Z', '2026-11-12'],
  ['2026-11-21T12:00:00Z', '2026-11-20'],
])('默认比较范围按比赛时区与赛期截断：%s', async (at, end) => {
  const { service, db } = fixture();
  const asOf = new Date(at);
  const result = await service.read(ownerId, arenaId, {}, asOf);
  expect(result).toMatchObject({ start: '2026-11-10', end });
  expect(db.arenaOccurrence.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { arenaId, tradingDate: { lte: end }, dueAt: { lte: asOf } },
    }),
  );
});

it('明确区间按原值读取，保留记录可见时点过滤', async () => {
  const { service, db } = fixture();
  const asOf = new Date('2026-11-16T18:00:00Z');
  const result = await service.read(
    ownerId,
    arenaId,
    { start: '2026-11-11', end: '2026-11-14' },
    asOf,
  );
  expect(result).toMatchObject({ start: '2026-11-11', end: '2026-11-14' });
  expect(db.arenaFill.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        reservation: { arenaId },
        executedAt: { lte: asOf },
        recordedAt: { lte: asOf },
      },
    }),
  );
});

it.each([
  { start: '2026-11-09', end: '2026-11-14' },
  { start: '2026-11-11', end: '2026-11-21' },
  { start: '2026-11-14', end: '2026-11-11' },
])('越界或反向区间在读取明细前拒绝：%j', async (period) => {
  const { service, db } = fixture();
  await expect(
    service.read(ownerId, arenaId, period, new Date('2026-11-16T18:00:00Z')),
  ).rejects.toThrow('区间超出比赛赛期');
  expect(db.arenaOccurrence.findMany).not.toHaveBeenCalled();
  expect(db.arenaRound.findMany).not.toHaveBeenCalled();
  expect(db.arenaFill.findMany).not.toHaveBeenCalled();
});
