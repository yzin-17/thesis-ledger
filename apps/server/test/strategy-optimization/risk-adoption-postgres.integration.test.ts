import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../src/platform/prisma.service.js';
import { StrategyRiskContextService } from '../../src/risk/strategy-risk-context.service.js';
import { StrategyRiskApplicationService } from '../../src/strategy-optimization/strategy-risk-application.service.js';
import { StrategyRiskApplicationStoreService } from '../../src/strategy-optimization/strategy-risk-application-store.service.js';
import { createStrategyFixture } from './strategy-optimization-postgres-fixtures.js';

const databaseUrl = process.env.RISK_ADOPTION_TEST_DATABASE_URL;
if (databaseUrl) {
  const url = new URL(databaseUrl);
  if (
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    url.pathname !== '/risk_adoption_fixture'
  ) {
    throw new Error('风险采纳测试仅允许专用本地隔离数据库');
  }
}

(databaseUrl ? describe : describe.skip)('真实持仓成本风险采纳 PostgreSQL 组合', () => {
  const prisma = new PrismaService({
    datasources: { db: { url: databaseUrl ?? 'postgresql://localhost/risk_adoption_fixture' } },
  });
  const bars = {
    read: vi.fn(async () => ({
      provenance: { providerId: 'fixture' },
      points: [
        {
          timestamp: '2026-09-08T00:00:00Z',
          availableAt: '2026-09-08T07:00:00Z',
          open: '184',
          high: '184',
          low: '184',
          close: '184',
          volume: '100',
          amount: '18400',
        },
      ],
    })),
  };
  const contexts = new StrategyRiskContextService(prisma, bars as never);
  const store = new StrategyRiskApplicationStoreService(prisma);
  const service = new StrategyRiskApplicationService(prisma, contexts, store, {} as never);
  const accountId = randomUUID();
  const shadowAccountId = randomUUID();
  const symbol = '600519.SH';
  let strategyVersionId: string;
  const witness = () =>
    Promise.all(
      [
        'Account',
        'Position',
        'LedgerEvent',
        'Trade',
        'AccountLedgerState',
        'TradeEntryLeg',
        'TradeBaselineComponent',
        'TradeCorporateActionAdjustment',
        'TradeCloseSlice',
        'TradeCloseAllocation',
        'TradeDividendAttribution',
        'TradeEvidenceSource',
        'PortfolioSnapshot',
        'JournalEntry',
        'JournalReviewSnapshot',
        'TradePlan',
      ].map(async (table) =>
        prisma.$queryRawUnsafe(
          `SELECT count(*)::text AS count, md5(coalesce(string_agg(row_to_json(t)::text, '' ORDER BY row_to_json(t)::text), '')) AS digest FROM "${table}" t`,
        ),
      ),
    );

  beforeAll(async () => {
    vi.stubEnv('STRATEGY_RISK_APPLICATIONS_ENABLED', 'true');
    await prisma.$connect();
    expect(await prisma.$queryRaw`SELECT current_database() AS name`).toEqual([
      { name: 'risk_adoption_fixture' },
    ]);
    await prisma.account.create({
      data: {
        id: accountId,
        name: '真实持仓哨兵',
        type: 'broker',
        mode: 'actual',
        currency: 'CNY',
        active: true,
      },
    });
    await prisma.asset.create({
      data: { symbol, name: '隔离样本', market: 'CN', assetType: 'stock', currency: 'CNY' },
    });
    await prisma.position.create({
      data: { accountId, symbol, quantity: '10', costPrice: '200', source: 'fixture' },
    });
    await prisma.journalEntry.create({
      data: { accountId, symbol, reason: '隔离哨兵', content: '已有真实记录' },
    });
    await prisma.portfolioSnapshot.create({
      data: {
        accountId,
        scope: 'account',
        mode: 'actual',
        slotKey: 'fixture',
        capturedAt: new Date('2026-09-08T08:00:00Z'),
        valuationDate: new Date('2026-09-08'),
        source: 'SYSTEM',
        valuationBasis: 'OFFICIAL',
        valuationStatus: 'COMPLETE',
        marketValue: '1840',
        costValue: '2000',
        cashValue: '100',
        totalValue: '1940',
        baseCurrency: 'CNY',
        idempotencyKey: randomUUID(),
        payload: {},
      },
    });
    await prisma.account.create({
      data: {
        id: shadowAccountId,
        name: '影子账户隔离哨兵',
        type: 'broker',
        mode: 'shadow',
        currency: 'CNY',
        active: true,
      },
    });
    await prisma.position.create({
      data: {
        accountId: shadowAccountId,
        symbol,
        quantity: '900',
        costPrice: '1.5',
        source: 'fixture',
      },
    });
    const schema = createStrategyFixture(symbol, '真实成本')('0.08');
    schema.exit = {
      type: 'compare',
      operator: 'lte',
      left: { type: 'series', sourceId: 'price', field: 'close' },
      right: { type: 'constant', value: '1.5' },
    };
    schema.sizing = { type: 'fixedQuantity', quantity: '1000000' };
    const strategy = await prisma.strategy.create({
      data: { name: '采纳组合验证', status: 'active', schemaVersion: 2 },
    });
    const version = await prisma.strategyVersion.create({
      data: {
        strategyId: strategy.id,
        version: 1,
        schemaVersion: 2,
        schema: schema as Prisma.InputJsonValue,
      },
    });
    strategyVersionId = version.id;
  });
  afterAll(async () => {
    await prisma.$disconnect();
    vi.unstubAllEnvs();
  });

  it('以实际成本评价并持久化百分比规则，不改写真实持仓和账本', async () => {
    const before = await witness();
    const input = { accountId, symbol, strategyVersionId, cycleMode: 'existingAndFuture' };
    const preview = await service.preview(input);
    expect(preview.evaluations).toEqual([
      expect.objectContaining({ state: 'triggered', value: '-0.08' }),
    ]);
    expect(preview.plan.rules).toHaveLength(1);
    expect(preview.plan.rules[0]).toMatchObject({
      metric: 'priceToAverageCostReturn',
      threshold: '-0.08',
    });
    const application = await service.create({
      ...input,
      previewHash: preview.previewHash,
      idempotencyKey: randomUUID(),
      enabled: false,
      notification: { enabled: false, cooldownMinutes: 60, severity: 'warning', channels: [] },
    });
    expect((await store.get(application.id)).plan).toEqual(preview.plan);
    const rules = await prisma.riskRule.findMany({ where: { accountId } });
    expect(rules).toHaveLength(1);
    expect(rules[0]!.threshold.toString()).toBe('-0.08');
    expect(JSON.stringify(rules)).not.toContain('1000000');
    expect(await witness()).toEqual(before);
    expect(bars.read).toHaveBeenCalledWith(
      expect.objectContaining({ identity: expect.objectContaining({ adjustment: 'none' }) }),
    );
  });

  it('真实成本变化使旧预览失效，拒绝新增或覆盖既有规则', async () => {
    const input = { accountId, symbol, strategyVersionId, cycleMode: 'nextPositionCycle' };
    const preview = await service.preview(input);
    const rules = await prisma.riskRule.findMany({ orderBy: { id: 'asc' } });
    await prisma.position.update({
      where: { accountId_symbol: { accountId, symbol } },
      data: { costPrice: '100' },
    });
    try {
      const before = await witness();
      await expect(
        service.create({
          ...input,
          previewHash: preview.previewHash,
          idempotencyKey: randomUUID(),
          enabled: false,
          notification: { enabled: false, cooldownMinutes: 60, severity: 'warning', channels: [] },
        }),
      ).rejects.toThrow('风险规则预览已经过期');
      const refreshed = await service.preview(input);
      expect(refreshed.previewHash).not.toBe(preview.previewHash);
      expect(refreshed.evaluations).toEqual([expect.objectContaining({ value: '0.84' })]);
      expect(await prisma.riskRule.findMany({ orderBy: { id: 'asc' } })).toEqual(rules);
      expect(await witness()).toEqual(before);
    } finally {
      await prisma.position.update({
        where: { accountId_symbol: { accountId, symbol } },
        data: { costPrice: '200' },
      });
    }
  });

  it('日线应用启用时仍仅写风险配置，不写入模拟事实', async () => {
    const input = { accountId, symbol, strategyVersionId, cycleMode: 'nextPositionCycle' };
    const preview = await service.preview(input);
    const before = await witness();
    const created = await service.create({
      ...input,
      previewHash: preview.previewHash,
      idempotencyKey: randomUUID(),
      enabled: true,
      notification: { enabled: false, cooldownMinutes: 60, severity: 'warning', channels: [] },
    });
    expect(created.enabled).toBe(true);
    const rules = await prisma.riskRule.findMany({ where: { accountId, enabled: true } });
    expect(rules).toHaveLength(1);
    expect(rules[0]!.threshold.toString()).toBe('-0.08');
    expect(await witness()).toEqual(before);
  });

  it.each([
    { type: 'absoluteStopPrice', price: '1.5' },
    { type: 'fixedStop', percent: '0.08', price: '1.5' },
    { type: 'fixedQuantity', quantity: '1000000' },
  ])('直接提交非法风险 $type 时在落库前拒绝', async (risk) => {
    const original = await prisma.strategyVersion.findUniqueOrThrow({
      where: { id: strategyVersionId },
    });
    const schema = { ...(original.schema as Prisma.JsonObject), risk: [risk] };
    const invalid = await prisma.strategyVersion.create({
      data: {
        strategyId: original.strategyId,
        version: 10 + (await prisma.strategyVersion.count()),
        schemaVersion: 2,
        schema: schema as Prisma.InputJsonValue,
      },
    });
    const before = await witness();
    const rules = await prisma.riskRule.findMany({ orderBy: { id: 'asc' } });
    await expect(
      service.create({
        accountId,
        symbol,
        strategyVersionId: invalid.id,
        cycleMode: 'existingAndFuture',
        previewHash: 'invalid-preview',
        idempotencyKey: randomUUID(),
        enabled: false,
        notification: { enabled: false, cooldownMinutes: 60, severity: 'warning', channels: [] },
      }),
    ).rejects.toThrow();
    expect(await prisma.riskRule.findMany({ orderBy: { id: 'asc' } })).toEqual(rules);
    expect(await witness()).toEqual(before);
  });
});
