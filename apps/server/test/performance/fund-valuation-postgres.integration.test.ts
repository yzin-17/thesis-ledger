import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import { fundNavSchema, type FundNav } from '@thesis-ledger/schemas';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CashLedgerCommandService } from '../../src/ledger/cash-ledger-command.service.js';
import { LedgerCommandService } from '../../src/ledger/ledger-command.service.js';
import { LedgerV2Repository } from '../../src/ledger/ledger-v2.repository.js';
import { PerformanceDataService } from '../../src/performance/performance-data.service.js';
import { PerformanceSnapshotService } from '../../src/performance/performance-snapshot.service.js';
import { frozenSnapshotInputs } from '../../src/performance/performance-snapshot-inputs.js';

const databaseUrl = process.env.PORTFOLIO_VALUATION_DATABASE_URL;
const at = new Date('2026-10-20T08:00:00Z');
const point = fundNavSchema.parse({
  version: 3,
  symbol: '161725.OF',
  unitNav: 0.54,
  navDate: '2026-10-20T00:00:00Z',
  provider: 'controlled-fund-fixture',
  fetchedAt: '2026-10-20T12:00:00Z',
  freshness: 'delayed',
  servedFromCache: false,
});

describe.skipIf(!databaseUrl)('基金快照真实 PostgreSQL 与合成来源输入', () => {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl ?? '' });
  const repository = new LedgerV2Repository(prisma as never);
  const cash = new CashLedgerCommandService(repository);
  const ledger = new LedgerCommandService(repository);
  beforeAll(async () => {
    const url = new URL(databaseUrl ?? '');
    if (url.hostname !== '127.0.0.1' || url.pathname !== '/portfolio_valuation_fixture')
      throw new Error('仅允许组合估值专用隔离数据库');
    expect(
      await prisma.$queryRaw`SELECT current_database() AS database, current_user AS owner`,
    ).toEqual([{ database: 'portfolio_valuation_fixture', owner: 'fixture_owner' }]);
    await prisma.asset.upsert({
      where: { symbol: point.symbol },
      update: {},
      create: {
        symbol: point.symbol,
        name: '合成基金校准夹具',
        market: 'OF',
        assetType: 'fund',
        currency: 'CNY',
        identityStatus: 'confirmed',
      },
    });
  });
  afterAll(() => prisma.$disconnect());

  const fixture = async () => {
    const account = await prisma.account.create({
      data: { name: '独立基金校准夹具', type: 'fund', mode: 'actual', currency: 'CNY' },
    });
    const envelope = (key: string, occurredAt: string) => ({
      accountId: account.id,
      occurredAt,
      timePrecision: 'INSTANT',
      sourceTimezone: 'Asia/Shanghai',
      economicOrderKey: key,
      actorId: 'controlled-fund-fixture',
      source: {
        category: 'MANUAL',
        channel: 'controlled-fund-fixture',
        externalId: `${account.id}:${key}`,
      },
    });
    const cashCommand = (direction: 'INFLOW' | 'OUTFLOW', occurredAt: string) =>
      cash.createCashFlow({
        command: 'CREATE_CASH_FLOW',
        ...envelope(direction, occurredAt),
        payload: {
          direction,
          category: direction === 'INFLOW' ? 'DEPOSIT' : 'WITHDRAWAL',
          amount: '1000',
          currency: 'CNY',
        },
      });
    await cashCommand('INFLOW', '2026-10-20T02:00:00Z');
    const execution = (side: 'BUY' | 'SELL', occurredAt: string) =>
      ledger.createExecution({
        command: 'CREATE_EXECUTION',
        ...envelope(side, occurredAt),
        side,
        payload: {
          symbol: point.symbol,
          quantity: '100',
          price: '1.25',
          currency: 'CNY',
          capabilityVerification: 'UNVERIFIED',
          charges: [],
        },
      });
    await execution('BUY', '2026-10-20T02:01:00Z');
    const history = { points: [{ ...point, unitNav: 0.55 }] as FundNav[] };
    const readHistory = vi.fn(async () => history.points);
    const market = { getFundNav: vi.fn(async () => point), getFundNavHistory: readHistory };
    const data = new PerformanceDataService(prisma as never, market as never);
    const service = new PerformanceSnapshotService(prisma as never, market as never, data);
    const estimate = await service.capture(account.id, at);
    const original = await prisma.portfolioSnapshot.findUniqueOrThrow({
      where: { id: estimate.id },
    });
    const clear = async () => {
      await execution('SELL', '2026-10-20T09:00:00Z');
      await cashCommand('OUTFLOW', '2026-10-20T09:01:00Z');
      await prisma.account.update({ where: { id: account.id }, data: { active: false } });
    };
    return { account, service, estimate, original, history, readHistory, clear };
  };

  it.each([
    ['零值', { ...point, unitNav: 0 }],
    ['不可用', { ...point, freshness: 'unavailable' as const }],
  ] as const)('%s 的合法 V3 返回不追加正式修订，原估算逐字段不变', async (_, invalid) => {
    const f = await fixture();
    f.history.points = [fundNavSchema.parse(invalid)];
    await f.clear();
    const result = await f.service.reconcileOfficial(100, f.account.id);
    expect(result).toMatchObject({
      scanned: 1,
      reconciled: [],
      pending: [{ snapshotId: f.estimate.id, reason: expect.stringContaining('尚未齐备') }],
    });
    expect(await prisma.portfolioSnapshot.findMany({ where: { accountId: f.account.id } })).toEqual(
      [f.original],
    );
  });

  it('合格基金校准复用冻结份额、成本和现金，同值重抓幂等，保留旧估算', async () => {
    const f = await fixture();
    expect(Number(f.estimate.marketValue)).toBe(54);
    expect(Number(f.estimate.cashValue)).toBe(875);
    await f.clear();
    const result = await f.service.reconcileOfficial(100, f.account.id);
    expect(result.scanned).toBe(1);
    expect(result.pending).toEqual([]);
    const officialId = result.reconciled[0];
    if (!officialId) throw new Error('合格基金必须产生正式修订');
    const official = await prisma.portfolioSnapshot.findUniqueOrThrow({
      where: { id: officialId },
    });
    expect(official).toMatchObject({
      revision: 2,
      supersedesSnapshotId: f.estimate.id,
      valuationBasis: 'OFFICIAL',
      valuationStatus: 'COMPLETE',
    });
    expect(
      [official.marketValue, official.costValue, official.cashValue, official.totalValue].map(
        Number,
      ),
    ).toEqual([55, 125, 875, 930]);
    expect(f.readHistory).toHaveBeenCalledWith(
      point.symbol,
      { start: '2026-10-20', end: '2026-10-20', limit: 10 },
      { persistIdentity: false },
    );
    f.history.points = [{ ...f.history.points[0]!, fetchedAt: '2026-10-20T13:00:00Z' }];
    const repeated = await f.service.capture(
      f.account.id,
      at,
      'actual',
      {},
      { valuationBasis: 'OFFICIAL', valuationDate: f.estimate.valuationDate },
      frozenSnapshotInputs(f.estimate),
    );
    expect(repeated.id).toBe(official.id);
    expect(await prisma.portfolioSnapshot.count({ where: { accountId: f.account.id } })).toBe(2);
    expect(await prisma.portfolioSnapshot.findUnique({ where: { id: f.estimate.id } })).toEqual(
      f.original,
    );
  });
});
