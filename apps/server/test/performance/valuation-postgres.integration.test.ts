import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AutomationRuntimeHandlers } from '../../src/automation/automation-runtime.service.js';
import { AutomationScheduler } from '../../src/automation/automation.scheduler.js';
import { AutomationService } from '../../src/automation/automation.service.js';
import { PerformanceDataService } from '../../src/performance/performance-data.service.js';
import { PerformanceLayerService } from '../../src/performance/performance-layer.service.js';
import { PerformanceSnapshotService } from '../../src/performance/performance-snapshot.service.js';
import { frozenSnapshotInputs } from '../../src/performance/performance-snapshot-inputs.js';
import { PerformanceValuationSeriesService } from '../../src/performance/performance-valuation-series.service.js';

const databaseUrl = process.env.PORTFOLIO_VALUATION_DATABASE_URL;
const intradayId = '00000000-0000-4000-8000-000000000011';
const managedSystemKeys = [
  'valuation-intraday-sample',
  'snapshot-close-estimate',
  'snapshot-official-reconcile',
];

async function createValuationFixture() {
  const market = {
    getQuote: async () => ({ price: 12, provider: 'isolated-fixture', stale: false }),
  };

  const url = new URL(databaseUrl ?? '');
  if (url.hostname !== '127.0.0.1' || url.pathname !== '/portfolio_valuation_fixture')
    throw new Error('仅允许组合估值专用隔离数据库');
  const prisma = new PrismaClient({ datasourceUrl: url.toString() });
  const identity = await prisma.$queryRaw<Array<{ database: string; owner: string }>>`
      SELECT current_database() AS database, current_user AS owner
    `;
  expect(identity).toEqual([{ database: 'portfolio_valuation_fixture', owner: 'fixture_owner' }]);
  await prisma.automationJob.updateMany({ data: { enabled: false } });
  const data = new PerformanceDataService(prisma as never, market as never);
  const layers = new PerformanceLayerService(prisma as never, market as never, data);
  const snapshots = new PerformanceSnapshotService(prisma as never, market as never, data);
  const series = new PerformanceValuationSeriesService(
    prisma as never,
    layers,
    snapshots,
    market as never,
  );
  const automations = new AutomationService(
    prisma as never,
    {} as never,
    {
      enqueue: async () => [],
    } as never,
  );
  const handlers = new AutomationRuntimeHandlers(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    series,
    snapshots,
  );
  const scheduler = new AutomationScheduler(prisma as never, automations, handlers);
  const cnAccount = (
    await prisma.account.create({
      data: { name: '组合估值隔离证券', type: 'securities', mode: 'actual' },
    })
  ).id;
  const cashAccount = (
    await prisma.account.create({
      data: { name: '组合估值隔离现金', type: 'cash', mode: 'actual' },
    })
  ).id;
  await prisma.asset.create({
    data: {
      symbol: '600519.SH',
      name: '隔离价格证券',
      market: 'CN',
      assetType: 'stock',
      currency: 'CNY',
    },
  });
  await prisma.position.create({
    data: {
      accountId: cnAccount,
      symbol: '600519.SH',
      quantity: 10,
      costPrice: 10,
      source: 'isolated-fixture',
    },
  });
  return { prisma, automations, snapshots, series, handlers, scheduler, cnAccount, cashAccount };
}

describe.skipIf(!databaseUrl)('组合估值真实 PostgreSQL', () => {
  let prisma: PrismaClient;
  let automations: AutomationService;
  let snapshots: PerformanceSnapshotService;
  let series: PerformanceValuationSeriesService;
  let handlers: AutomationRuntimeHandlers;
  let scheduler: AutomationScheduler;
  let cnAccount: string;
  let cashAccount: string;
  beforeAll(async () => {
    ({ prisma, automations, snapshots, series, handlers, scheduler, cnAccount, cashAccount } =
      await createValuationFixture());
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('并发 provision 不复制三个 systemKey，保留用户启停和计划', async () => {
    await Promise.all(Array.from({ length: 4 }, () => automations.ensureManagedValuationJobs()));
    const jobs = await prisma.automationJob.findMany({
      where: {
        managed: true,
        systemKey: { in: managedSystemKeys },
      },
    });
    expect(jobs).toHaveLength(3);
    await automations.update(intradayId, { enabled: false, cron: '*/5 * * * *' });
    await automations.ensureManagedValuationJobs();
    expect(
      await prisma.automationJob.findUniqueOrThrow({ where: { id: intradayId } }),
    ).toMatchObject({ enabled: false, cron: '*/5 * * * *', managed: true });
    await expect(automations.update(intradayId, { name: '改名' })).rejects.toThrow();
    await expect(automations.delete(intradayId)).rejects.toThrow('不能删除');
    await prisma.automationJob.updateMany({ data: { enabled: false } });
  });

  it('真实 Scheduler 在开放美股但仅有中国持仓时不创建历史和点位', async () => {
    const due = new Date('2026-09-08T17:04:00Z');
    await prisma.automationJob.update({
      where: { id: intradayId },
      data: { enabled: true, cron: '* * * * *', nextRunAt: due },
    });
    const result = await scheduler.runDue(new Date('2026-09-08T17:04:06Z'));
    expect(result.jobs).toContainEqual({
      jobId: intradayId,
      status: 'skipped',
      reason: '当前开放市场（US）没有实际持仓',
    });
    expect(await prisma.automationRun.count({ where: { jobId: intradayId } })).toBe(0);
    expect(await prisma.accountValuationPoint.count()).toBe(0);
    expect(
      (
        await prisma.automationJob.findUniqueOrThrow({ where: { id: intradayId } })
      ).nextRunAt?.getTime(),
    ).toBeGreaterThan(due.getTime());
  });

  it('真实 Scheduler 为开放中国持仓写点，重复轮询不重复执行', async () => {
    const due = new Date('2026-09-09T02:00:00Z');
    await prisma.automationJob.update({ where: { id: intradayId }, data: { nextRunAt: due } });
    const result = await scheduler.runDue(new Date('2026-09-09T02:00:06Z'));
    expect(result.jobs).toContainEqual({ jobId: intradayId, status: 'succeeded' });
    await scheduler.runDue(new Date('2026-09-09T02:00:06Z'));
    expect(await prisma.automationRun.count({ where: { jobId: intradayId } })).toBe(1);
    expect(await prisma.accountValuationPoint.findMany()).toMatchObject([
      { accountId: cnAccount, totalValue: expect.anything(), dataQuality: 'COMPLETE' },
    ]);
    expect(Number((await prisma.accountValuationPoint.findFirstOrThrow()).totalValue)).toBe(120);
  });

  it('停用任务立即运行绕过周末门禁，分钟 upsert 和现金账户隔离成立', async () => {
    await automations.update(intradayId, { enabled: false });
    const at = new Date('2026-10-04T02:00:17Z');
    const output = await automations.execute(
      intradayId,
      handlers.for('valuation-intraday-sample'),
      at,
    );
    expect(output).toMatchObject({ skipped: false, output: { sampled: 1 } });
    await Promise.all([series.sample(at), series.sample(at)]);
    expect(
      await prisma.accountValuationPoint.count({
        where: { accountId: cnAccount, at: new Date('2026-10-04T02:00:00Z') },
      }),
    ).toBe(1);
    expect(await prisma.accountValuationPoint.count({ where: { accountId: cashAccount } })).toBe(0);
  });

  it('同一估值幂等键并发创建只产生一条快照', async () => {
    const at = new Date();
    const results = await Promise.all(
      Array.from({ length: 8 }, () => snapshots.capture(cnAccount, at)),
    );
    expect(new Set(results.map((row) => row.id)).size).toBe(1);
    expect(await prisma.portfolioSnapshot.count({ where: { accountId: cnAccount } })).toBe(1);
  });

  it('正式修订并发恰好一次，晚到估算不能覆盖，详情保留修订链', async () => {
    const at = new Date();
    // 无持仓的新账户可在没有外部行情的情况下证明修订存储语义。
    const account = await prisma.account.create({
      data: { name: '隔离修订账户', type: 'securities', mode: 'actual' },
    });
    const estimate = await snapshots.capture(account.id, at);
    const officials = await Promise.all(
      Array.from({ length: 8 }, () =>
        snapshots.capture(account.id, at, 'actual', {}, { valuationBasis: 'OFFICIAL' }),
      ),
    );
    expect(new Set(officials.map((row) => row.id)).size).toBe(1);
    expect(officials[0]).toMatchObject({ revision: 2, supersedesSnapshotId: estimate.id });
    const late = await snapshots.capture(
      account.id,
      at,
      'actual',
      {},
      { idempotencyKey: `late:${account.id}` },
    );
    expect(late.id).toBe(officials[0]?.id);
    expect(await snapshots.detail(estimate.id)).toMatchObject({
      revisions: [{ revision: 1 }, { revision: 2 }],
    });
    expect(await snapshots.list({ accountId: account.id })).toMatchObject([
      { revision: 2, valuationBasis: 'OFFICIAL' },
    ]);
    const daily = await series.series({
      scope: 'account',
      accountId: account.id,
      range: '1M',
      interval: '1d',
      mode: 'actual',
      baseCurrency: 'CNY',
    });
    expect(daily.points).toHaveLength(1);
    expect(daily.points[0]).toMatchObject({
      sourceSnapshotId: officials[0]?.id,
      valuationBasis: 'OFFICIAL',
    });
  });

  it('缺行情保留已知金额和覆盖率，正式校准失败保留待补齐估算', async () => {
    const data = new PerformanceDataService(prisma as never, {} as never);
    const unavailable = new PerformanceSnapshotService(prisma as never, {} as never, data);
    const account = await prisma.account.create({
      data: { name: '隔离缺价账户', type: 'securities', mode: 'actual' },
    });
    await prisma.position.create({
      data: {
        accountId: account.id,
        symbol: '600519.SH',
        quantity: 10,
        costPrice: 10,
        source: 'isolated-fixture',
      },
    });
    const at = new Date();
    const estimate = await unavailable.capture(account.id, at);
    expect(estimate).toMatchObject({ valuationStatus: 'UNAVAILABLE' });
    expect(Number(estimate.pricedCoverage)).toBe(0);
    expect(Number(estimate.totalValue)).toBe(0);
    const daily = await series.series({
      scope: 'account',
      accountId: account.id,
      range: '1M',
      interval: '1d',
      mode: 'actual',
      baseCurrency: 'CNY',
    });
    expect(daily.points[0]?.dataQuality).toBe('UNAVAILABLE');
    await expect(
      unavailable.capture(account.id, at, 'actual', {}, { valuationBasis: 'OFFICIAL' }),
    ).rejects.toThrow('尚未齐备');
    expect((await unavailable.detail(estimate.id))?.revisions).toHaveLength(1);
  });

  it('后续买卖不污染旧日校准，正式证据并发幂等并允许更正', async () => {
    const at = new Date('2026-09-28T08:00:00Z');
    const account = await prisma.account.create({
      data: { name: '隔离冻结经济输入', type: 'securities', mode: 'actual' },
    });
    await prisma.position.create({ data: { accountId: account.id, symbol: '600519.SH',
      quantity: 2, costPrice: 80, source: 'isolated-fixture' } });
    const market = { getQuote: async () => ({ price: 100, provider: 'isolated-fixture', stale: false }) };
    let officialPrice = 101;
    const bars = { readV3: async () => ({ status: 'selected', selection: { response: {
      bars: [{ timestamp: '2026-09-28T07:00:00Z', close: officialPrice, completionStatus: 'complete' }],
      provenance: { providerId: 'isolated-fixture', upstreamSource: 'fixture-explicit' },
    } } }) };
    const data = new PerformanceDataService(prisma as never, market as never);
    const service = new PerformanceSnapshotService(prisma as never, market as never, data, bars as never);
    const estimate = await service.capture(account.id, at);
    const original = JSON.stringify(estimate);
    await prisma.position.update({ where: { accountId_symbol: { accountId: account.id, symbol: '600519.SH' } },
      data: { quantity: 20, costPrice: 95 } });
    await prisma.account.update({ where: { id: account.id }, data: { active: false } });
    const first = await service.reconcileOfficial(100, account.id);
    expect(first.scanned).toBe(1);
    expect(first.pending.find(row => row.snapshotId === estimate.id)).toBeUndefined();
    const detail = await service.detail(estimate.id);
    expect(detail?.revisions).toHaveLength(2);
    const initialOfficial = detail!.revisions[1]!;
    expect(Number(initialOfficial.marketValue)).toBe(202);
    expect(Number(initialOfficial.costValue)).toBe(160);
    expect(JSON.stringify(await prisma.portfolioSnapshot.findUnique({ where: { id: estimate.id } }))).toBe(original);
    const frozen = frozenSnapshotInputs(estimate);
    const capture = () => service.capture(account.id, at, 'actual', {}, {
      valuationBasis: 'OFFICIAL', valuationDate: estimate.valuationDate,
    }, frozen);
    const repeated = await Promise.all(Array.from({ length: 8 }, capture));
    expect(new Set(repeated.map(row => row.id))).toEqual(new Set([initialOfficial.id]));
    officialPrice = 103;
    const corrected = await Promise.all(Array.from({ length: 8 }, capture));
    expect(new Set(corrected.map(row => row.id)).size).toBe(1);
    expect(corrected[0]).toMatchObject({ revision: 3, supersedesSnapshotId: initialOfficial.id });
    expect(Number(corrected[0]!.marketValue)).toBe(206);
    expect((await service.detail(estimate.id))?.revisions).toHaveLength(3);
    expect(await service.list({ accountId: account.id })).toMatchObject([{ id: corrected[0]!.id }]);
  });

  it('组合分钟点保留低覆盖质量，不混入现金、模拟或异币种点', async () => {
    const at = new Date();
    at.setUTCSeconds(0, 0);
    const other = await prisma.account.create({
      data: { name: '隔离第二投资账户', type: 'securities', mode: 'actual' },
    });
    const shadow = await prisma.account.create({
      data: { name: '隔离模拟账户', type: 'securities', mode: 'shadow' },
    });
    for (const [accountId, mode, baseCurrency, totalValue, dataQuality] of [
      [cnAccount, 'actual', 'CNY', 120, 'LOW_COVERAGE'],
      [other.id, 'actual', 'CNY', 80, 'COMPLETE'],
      [cashAccount, 'actual', 'CNY', 5000, 'COMPLETE'],
      [shadow.id, 'shadow', 'CNY', 10000, 'COMPLETE'],
      [cnAccount, 'actual', 'USD', 20000, 'COMPLETE'],
    ] as const) {
      await prisma.accountValuationPoint.create({
        data: {
          accountId,
          mode,
          at,
          baseCurrency,
          marketValue: totalValue,
          cashValue: 0,
          totalValue,
          valuationBasis: 'ESTIMATED',
          disclosureCoverage: 0.14,
          pricedCoverage: 0.08,
          dataQuality,
          evidence: {},
        },
      });
    }
    const result = await series.series({
      scope: 'portfolio',
      range: '1D',
      interval: '1min',
      mode: 'actual',
      baseCurrency: 'CNY',
    });
    expect(result.points.at(-1)).toMatchObject({
      value: 200,
      dataQuality: 'LOW_COVERAGE',
      disclosureCoverage: 0.14,
      pricedCoverage: 0.08,
    });
    expect(result.dataQuality).toBe('LOW_COVERAGE');
  });
});
