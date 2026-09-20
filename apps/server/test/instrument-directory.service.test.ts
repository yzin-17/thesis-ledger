import { describe, expect, it, vi } from 'vitest';
import { InstrumentDirectoryService } from '../src/market/instruments/instrument-directory.service.js';

const instrument = (overrides: Record<string, unknown> = {}) => ({
  id: 'instrument-1',
  canonicalCode: '159516',
  instrumentType: 'ETF',
  market: 'SZ',
  displayName: '红利低波ETF',
  generation: 3,
  active: true,
  updatedAt: new Date('2026-09-18T00:00:00.000Z'),
  ...overrides,
});

const prismaFixture = (instruments: unknown[], generation = 3) => ({
  instrument: {
    findMany: vi.fn(async () => instruments),
  },
  catalogSyncState: {
    findUnique: vi.fn(async () => ({ generation })),
  },
});

describe('InstrumentDirectoryService', () => {
  it('批量解析、去重并返回目录项', async () => {
    const prisma = prismaFixture([instrument()]);
    const service = new InstrumentDirectoryService(prisma as never);

    await expect(service.resolveSymbols(['159516.SZ', ' 159516.sz '])).resolves.toMatchObject({
      generation: 3,
      items: [
        {
          symbol: '159516.SZ',
          displayName: '红利低波ETF',
          active: true,
        },
      ],
      unresolvedSymbols: [],
    });
    expect(prisma.instrument.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.instrument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ canonicalCode: '159516', market: 'SZ' }] },
      }),
    );
  });

  it('优先 active 目录，并可回退到 inactive 目录', async () => {
    const prisma = prismaFixture([
      instrument({ id: 'old', displayName: '旧名称', generation: 9, active: false }),
      instrument({ id: 'current', displayName: '当前名称', generation: 3, active: true }),
    ]);
    const service = new InstrumentDirectoryService(prisma as never);

    await expect(service.resolveSymbols(['159516.SZ'])).resolves.toMatchObject({
      items: [{ displayName: '当前名称', active: true }],
    });

    const inactivePrisma = prismaFixture([
      instrument({ id: 'old', displayName: '旧名称', generation: 9, active: false }),
    ]);
    await expect(
      new InstrumentDirectoryService(inactivePrisma as never).resolveSymbols(['159516.SZ']),
    ).resolves.toMatchObject({ items: [{ displayName: '旧名称', active: false }] });
  });

  it('目录缺失或代码格式无法解析时只返回未解析代码', async () => {
    const prisma = prismaFixture([]);
    const service = new InstrumentDirectoryService(prisma as never);

    await expect(service.resolveSymbols(['159516.SZ', 'UNKNOWN'])).resolves.toMatchObject({
      items: [],
      unresolvedSymbols: ['159516.SZ', 'UNKNOWN'],
    });
  });

  it('目录查询失败时不把目录错误升级为业务读取失败', async () => {
    const prisma = {
      instrument: {
        findMany: vi.fn(async () => Promise.reject(new Error('database unavailable'))),
      },
      catalogSyncState: { findUnique: vi.fn(async () => ({ generation: 3 })) },
    };
    const service = new InstrumentDirectoryService(prisma as never);

    await expect(service.resolveSymbols(['159516.SZ'])).resolves.toMatchObject({
      generation: 0,
      items: [],
      unresolvedSymbols: ['159516.SZ'],
    });
  });
});
