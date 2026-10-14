import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { TradeQueryService } from '../../src/ledger/trade-query.service.js';
import { JournalReviewQuery } from '../../src/journal/journal-review-query.js';

const databaseUrl = process.env.JOURNAL_REVIEW_DATABASE_URL;

describe.skipIf(!databaseUrl)('复盘依赖的原子 Trade 投影读取', () => {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl ?? '' });
  let reader: PrismaClient | undefined;
  let query: TradeQueryService;
  const accountId = randomUUID();
  const tradeId = `journal-fixture:${randomUUID()}`;
  const symbol = `JOURNAL-${randomUUID()}.US`;
  const exact = '9007199254740993.000000000000000001';
  let isolated = false;
  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    if (url.hostname !== '127.0.0.1' || url.pathname !== '/journal_review_fixture')
      throw new Error('复盘测试只允许专用本机隔离数据库');
    const rows = await prisma.$queryRaw<Array<{ name: string; owner: string }>>`
      SELECT current_database() AS name, current_user AS owner`;
    expect(rows).toEqual([{ name: 'journal_review_fixture', owner: 'fixture_owner' }]);
    isolated = true;
    const appUrl = new URL(databaseUrl!);
    appUrl.username = 'fixture_app';
    reader = new PrismaClient({ datasourceUrl: appUrl.toString() });
    query = new TradeQueryService(reader as never);
    await prisma.account.create({
      data: { id: accountId, name: '隔离复盘读取账户', type: 'securities', mode: 'actual' },
    });
    await prisma.asset.create({
      data: { symbol, name: '隔离复盘资产', market: 'US', assetType: 'STOCK', currency: 'USD' },
    });
    await prisma.accountLedgerState.create({
      data: { accountId, ledgerRevision: 7n, projectionGeneration: 7n },
    });
    await prisma.trade.create({
      data: {
        id: tradeId,
        accountId,
        accountMode: 'actual',
        symbol,
        lifecycle: 'ENDED',
        exitProgress: 'FULL',
        endEvidence: 'SELL_EXECUTION',
        sourceQuantity: exact,
        closedQuantity: exact,
        remainingQuantity: '0',
        completeness: 'COMPLETE',
        issues: [],
        costIssues: [],
        algorithmVersion: 'fixture',
        projectionFingerprint: 'generation-7',
        projectionGeneration: 7n,
      },
    });
  });
  afterAll(async () => {
    if (isolated) {
      await prisma.journalReviewSnapshot.deleteMany({ where: { accountId } });
      await prisma.journalEntry.deleteMany({ where: { accountId } });
      await prisma.tradePlan.deleteMany({ where: { accountId } });
      await prisma.trade.deleteMany({ where: { accountId } });
      await prisma.accountLedgerState.deleteMany({ where: { accountId } });
      await prisma.account.deleteMany({ where: { id: accountId } });
      await prisma.asset.deleteMany({ where: { symbol } });
    }
    await Promise.all([reader?.$disconnect(), prisma.$disconnect()]);
  });
  it('写入在两条读取之间提交时，版本和详情仍来自同一快照', async () => {
    let announceLocked!: () => void;
    const locked = new Promise<void>((resolve) => {
      announceLocked = resolve;
    });
    let releaseWriter!: () => void;
    const release = new Promise<void>((resolve) => {
      releaseWriter = resolve;
    });
    const writer = prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe('LOCK TABLE "Trade" IN ACCESS EXCLUSIVE MODE');
        announceLocked();
        await release;
        await tx.accountLedgerState.update({
          where: { accountId },
          data: { ledgerRevision: 8n, projectionGeneration: 8n },
        });
        await tx.trade.update({
          where: { id: tradeId },
          data: { projectionGeneration: 8n, projectionFingerprint: 'generation-8' },
        });
      },
      { timeout: 20000 },
    );
    await locked;
    const reading = query.readAccountProjection({ accountId, mode: 'actual' });
    try {
      await vi.waitFor(
        async () => {
          const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
          SELECT count(*) AS count FROM pg_stat_activity
          WHERE datname = 'journal_review_fixture' AND wait_event_type = 'Lock'
          AND query LIKE '%Trade%'`;
          expect(Number(rows[0]!.count)).toBeGreaterThan(0);
        },
        { timeout: 5000 },
      );
    } finally {
      releaseWriter();
      await writer;
    }
    const snapshot = await reading;
    expect(snapshot.version).toEqual({ ledgerRevision: '7', projectionGeneration: '7' });
    expect(snapshot.details[0]!.projectionGeneration).toBe('7');
    expect(snapshot.details[0]!.projectionFingerprint).toBe('generation-7');
    const current = await query.readAccountProjection({ accountId, mode: 'actual' });
    expect(current.version).toEqual({ ledgerRevision: '8', projectionGeneration: '8' });
    expect(current.details[0]!.projectionGeneration).toBe('8');
  });
  it('精确 decimal 及 nullable 时间保持，模式和标的隔离', async () => {
    const result = await query.readAccountProjection({ accountId, mode: 'actual', symbol });
    expect(result.details[0]!.sourceQuantity).toBe(exact);
    expect(result.details[0]!.openedAt).toBeNull();
    expect(result.details[0]!.closedAt).toBeNull();
    expect(result.details[0]!.netRealizedPnl).toBeNull();
    expect((await query.readAccountProjection({ accountId, mode: 'shadow' })).details).toEqual([]);
    expect(
      (await query.readAccountProjection({ accountId, mode: 'actual', symbol: 'OTHER.US' }))
        .details,
    ).toEqual([]);
  });
  it('受限应用角色读计划与快照：无关世代更新保持 CURRENT，计划修订只标记 STALE', async () => {
    const plan = await prisma.tradePlan.create({
      data: {
        accountId,
        tradeId,
        symbol,
        plannedEntry: '1234567890123456.00000001',
        thesis: '原始计划',
      },
    });
    await prisma.journalEntry.create({
      data: {
        accountId,
        entryType: 'note',
        tradePlanId: plan.id,
        symbol,
        reason: '隔离关联说明',
        notes: '仅当前计划说明',
      },
    });
    const review = new JournalReviewQuery(reader as never, query);
    const first = (await review.list({ accountId, mode: 'actual' })).items[0]!;
    expect(first.input.plan!.plannedEntry).toBe('1234567890123456.00000001');
    expect(first.input.journalEntries[0]!.notes).toBe('仅当前计划说明');
    expect(first.openedAt).toBeNull();
    expect(first.statisticsEligibility.eligible).toBe(false);
    await prisma.journalReviewSnapshot.create({
      data: {
        accountId,
        mode: 'actual',
        reviewObjectType: 'TRADE_CYCLE',
        tradeId,
        ledgerRevision: BigInt(first.input.projection.ledgerRevision),
        projectionGeneration: BigInt(first.input.projection.projectionGeneration),
        projectionFingerprint: first.input.projection.projectionFingerprint,
        factIds: first.input.projection.factIds,
        eventIds: first.input.projection.eventIds,
        inputSnapshot: JSON.parse(JSON.stringify(first.input)),
        outputSnapshot: {
          reviewObjectId: first.input.reference.reviewObjectId,
          algorithmVersion: 'fixture',
          metrics: {},
        },
      },
    });
    await prisma.$transaction([
      prisma.accountLedgerState.update({
        where: { accountId },
        data: { ledgerRevision: 9n, projectionGeneration: 9n },
      }),
      prisma.trade.update({
        where: { id: tradeId },
        data: { projectionGeneration: 9n, projectionFingerprint: 'unrelated-generation-9' },
      }),
    ]);
    const unchanged = (await review.list({ accountId })).items[0]!;
    expect(unchanged.reviewStatus).toBe('CURRENT');
    expect(unchanged.input.projection.evidenceFingerprint).toBe(
      first.input.projection.evidenceFingerprint,
    );
    await prisma.tradePlan.update({ where: { id: plan.id }, data: { thesis: '用户显式修订计划' } });
    const before = await prisma.trade.findUnique({ where: { id: tradeId } });
    const snapshotBefore = await prisma.journalReviewSnapshot.findMany({ where: { accountId } });
    const changed = (await review.list({ accountId })).items[0]!;
    expect(changed.reviewStatus).toBe('STALE');
    expect(changed.input.projection.evidenceFingerprint).not.toBe(
      first.input.projection.evidenceFingerprint,
    );
    expect(await prisma.trade.findUnique({ where: { id: tradeId } })).toEqual(before);
    expect(await prisma.journalReviewSnapshot.findMany({ where: { accountId } })).toEqual(
      snapshotBefore,
    );
    expect((await review.list({ accountId, mode: 'shadow' })).items).toEqual([]);
  });
});
