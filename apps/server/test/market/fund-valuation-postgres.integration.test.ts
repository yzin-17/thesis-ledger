import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fundValuationSchema } from '@thesis-ledger/schemas';
import { FundValuationPointRepository } from '../../src/market/fund-valuation-point.repository.js';

const url = process.env.PORTFOLIO_VALUATION_DATABASE_URL;
const prisma = new PrismaClient({ datasourceUrl: url ?? 'postgresql://unused:unused@127.0.0.1:1/unused' });
const repository = new FundValuationPointRepository(prisma as never);
const point = (at: string, estimatedNav: number | null) => fundValuationSchema.parse({
  version: 1, symbol: '999991.OF', marketState: 'open',
  quality: estimatedNav === null ? 'unavailable' : 'low_coverage', estimatedNav,
  changePercent: estimatedNav === null ? null : (estimatedNav - 1) * 100,
  anchor: { unitNav: 1, navDate: '2026-11-03T00:00:00Z' },
  estimatedAt: estimatedNav === null ? null : at,
  oldestPriceAt: estimatedNav === null ? null : at,
  disclosureCoverage: 0.25, pricedCoverage: estimatedNav === null ? 0 : 0.25,
  reasons: [estimatedNav === null ? 'prices_unavailable' : 'low_coverage'], method: 'disclosed-holdings-qfq-v1',
});

describe.skipIf(!url)('基金分钟事实 PostgreSQL', () => {
  beforeAll(async () => {
    const identity = await prisma.$queryRaw<Array<{ database: string; owner: string }>>`SELECT current_database() AS database, current_user AS owner`;
    expect(identity).toEqual([{ database: 'portfolio_valuation_fixture', owner: 'fixture_owner' }]);
    const head = await prisma.schemaVersion.findUniqueOrThrow({ where: { id: 1 } });
    expect(head.version).toBe('20261104010000_fund_intraday_valuation');
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it('同一分钟只有一个事实，晚到旧计算不能覆盖较新结果', async () => {
    const older = '2026-11-04T06:00:10Z';
    const newer = '2026-11-04T06:00:20Z';
    await Promise.all([
      repository.record(point(newer, 1.025), new Date(newer), { source: 'controlled-newer' }),
      repository.record(point(older, 1.01), new Date(older), { source: 'controlled-older' }),
    ]);
    expect(await prisma.fundValuationPoint.count({ where: { symbol: '999991.OF' } })).toBe(1);
    const latest = await repository.latest('999991.OF', new Date('2026-11-04T13:00:00Z'));
    expect(latest?.estimatedNav).toBe(1.025);
    expect(latest?.estimatedAt).toBe(newer);
  });
  it('今日按上海日期隔离并保留不可用分钟，最后有效值不被缺价替代', async () => {
    const missing = '2026-11-04T06:01:00Z';
    const tomorrow = '2026-11-05T06:00:00Z';
    await repository.record(point(missing, null), new Date(missing));
    await repository.record(point(tomorrow, 1.03), new Date(tomorrow));
    const rows = await repository.today('999991.OF', new Date('2026-11-04T13:00:00Z'));
    expect(rows.map((row) => row.at)).toEqual(['2026-11-04T06:00:00.000Z', '2026-11-04T06:01:00.000Z']);
    expect(rows[1]?.valuation.estimatedNav).toBeNull();
    expect((await repository.latest('999991.OF', new Date('2026-11-04T13:00:00Z')))?.estimatedNav).toBe(1.025);
    expect(await repository.today('999992.OF', new Date('2026-11-04T13:00:00Z'))).toEqual([]);
  });
  it('拒绝休市造点和计算时钟不一致', async () => {
    const at = new Date('2026-11-04T06:02:00Z');
    await expect(repository.record({ ...point(at.toISOString(), 1.02), marketState: 'closed' }, at)).rejects.toThrow('休市');
    await expect(repository.record(point('2026-11-04T06:01:00Z', 1.02), at)).rejects.toThrow('采样时间不一致');
  });
  it('同分钟新失败保留缺口，晚到的更早成功只补最后有效值', async () => {
    const failed = '2026-11-04T06:02:20Z';
    const success = '2026-11-04T06:02:10Z';
    await repository.record(point(failed, null), new Date(failed));
    await repository.record(point(success, 1.04), new Date(success));
    const today = await repository.today('999991.OF', new Date('2026-11-04T13:00:00Z'));
    expect(today.at(-1)?.valuation.estimatedNav).toBeNull();
    expect((await repository.latest('999991.OF', new Date('2026-11-04T13:00:00Z')))?.estimatedNav).toBe(1.04);
    expect((await repository.latest('999991.OF', new Date('2026-11-04T06:02:05Z')))?.estimatedNav).toBe(1.025);
  });
});
