import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PerformanceTargetService } from '../../src/performance/performance-target.service.js';

const databaseUrl =
  process.env.PERFORMANCE_CORRECTNESS_DATABASE_URL ?? process.env.PORTFOLIO_VALUATION_DATABASE_URL;

describe.skipIf(!databaseUrl)('目标保存真实 PostgreSQL', () => {
  let prisma: PrismaClient;
  let targets: PerformanceTargetService;

  beforeAll(async () => {
    const url = new URL(databaseUrl ?? '');
    if (url.hostname !== '127.0.0.1' || url.pathname !== '/portfolio_valuation_fixture')
      throw new Error('仅允许目标正确性专用隔离数据库');

    prisma = new PrismaClient({ datasourceUrl: url.toString() });
    const identity = await prisma.$queryRaw<Array<{ database: string; owner: string }>>`
      SELECT current_database() AS database, current_user AS owner
    `;
    expect(identity).toEqual([{ database: 'portfolio_valuation_fixture', owner: 'fixture_owner' }]);
    targets = new PerformanceTargetService(prisma as never, {} as never);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  const createAccount = async (label: string) =>
    prisma.account.create({
      data: {
        name: `目标正确性隔离账户-${label}-${randomUUID()}`,
        type: 'securities',
        mode: 'actual',
      },
    });

  it('同一账户身份的并发保存产生连续唯一版本且始终恰有一个 active', async () => {
    const account = await createAccount('并发');
    const saved = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        targets.saveTargets(
          'account',
          index % 2 === 0 ? { stock: 0.7, cash: 0.3 } : { etf: 0.4, cash: 0.6 },
          account.id,
        ),
      ),
    );

    expect(saved.map((target) => target.version).sort((left, right) => left - right)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    const rows = await prisma.targetAllocation.findMany({
      where: { scope: 'account', accountId: account.id },
      orderBy: { version: 'asc' },
    });
    expect(rows.map((target) => target.version)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(rows.filter((target) => target.active)).toHaveLength(1);
    expect(rows.find((target) => target.active)?.version).toBe(8);
  });

  it('nullable portfolio 身份并发保存也使用同一序列化键', async () => {
    const saved = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        targets.saveTargets(
          'portfolio',
          index % 2 === 0 ? { stock: 0.6, cash: 0.4 } : { etf: 0.5, cash: 0.5 },
        ),
      ),
    );

    expect(saved.map((target) => target.version).sort((left, right) => left - right)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    const rows = await prisma.targetAllocation.findMany({
      where: { scope: 'portfolio', accountId: null },
      orderBy: { version: 'asc' },
    });
    expect(rows.map((target) => target.version)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(rows.filter((target) => target.active)).toHaveLength(1);
    expect(rows.find((target) => target.active)?.version).toBe(8);
  });

  it('不同账户和 portfolio scope 的目标互不替换', async () => {
    const accountA = await createAccount('隔离甲');
    const accountB = await createAccount('隔离乙');
    const previousPortfolioVersion =
      (
        await prisma.targetAllocation.findFirst({
          where: { scope: 'portfolio', accountId: null },
          orderBy: { version: 'desc' },
        })
      )?.version ?? 0;
    await Promise.all([
      targets.saveTargets('account', { stock: 0.6, cash: 0.4 }, accountA.id),
      targets.saveTargets('account', { etf: 0.5, cash: 0.5 }, accountB.id),
      targets.saveTargets('portfolio', { fund: 0.7, cash: 0.3 }),
    ]);
    await targets.saveTargets('account', { stock: 0.4, cash: 0.6 }, accountA.id);

    const [rowsA, rowsB, portfolioRows] = await Promise.all([
      prisma.targetAllocation.findMany({ where: { scope: 'account', accountId: accountA.id } }),
      prisma.targetAllocation.findMany({ where: { scope: 'account', accountId: accountB.id } }),
      prisma.targetAllocation.findMany({ where: { scope: 'portfolio', accountId: null } }),
    ]);
    expect(rowsA.filter((target) => target.active).map((target) => target.version)).toEqual([2]);
    expect(rowsB.filter((target) => target.active).map((target) => target.version)).toEqual([1]);
    expect(portfolioRows.filter((target) => target.active).map((target) => target.version)).toEqual(
      [previousPortfolioVersion + 1],
    );
  });

  it('新版本创建失败时回滚旧目标停用', async () => {
    const account = await createAccount('回滚');
    await targets.saveTargets('account', { stock: 0.7, cash: 0.3 }, account.id);
    const constraint = `pfc_target_rollback_${randomUUID().replaceAll('-', '')}`;
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "TargetAllocation" ADD CONSTRAINT "${constraint}" CHECK (NOT ("scope" = 'account' AND "accountId" = '${account.id}'::uuid AND "version" = 2))`,
    );
    try {
      await expect(
        targets.saveTargets('account', { etf: 0.6, cash: 0.4 }, account.id),
      ).rejects.toThrow();
    } finally {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "TargetAllocation" DROP CONSTRAINT IF EXISTS "${constraint}"`,
      );
    }

    const rows = await prisma.targetAllocation.findMany({
      where: { scope: 'account', accountId: account.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      version: 1,
      active: true,
      targets: { stock: 0.7, cash: 0.3 },
    });
  });

  it('并发读者在替换期间始终看到一个 active，不看到零 active 的中间状态', async () => {
    const account = await createAccount('并发读');
    await targets.saveTargets('account', { stock: 1 }, account.id);
    const writes = Promise.all(
      Array.from({ length: 6 }, () =>
        targets.saveTargets('account', { stock: 0.5, cash: 0.5 }, account.id),
      ),
    );
    for (let index = 0; index < 20; index += 1) {
      const visible = await prisma.targetAllocation.findMany({
        where: { scope: 'account', accountId: account.id, active: true },
      });
      expect(visible).toHaveLength(1);
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    await writes;
  });
});
