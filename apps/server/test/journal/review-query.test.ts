import { describe, expect, it, vi } from 'vitest';
import {
  Prisma,
  type JournalEntry,
  type JournalReviewSnapshot,
  type TradePlan,
} from '@prisma/client';
import type { TradeDetailResponse } from '@thesis-ledger/schemas';
import { JournalReviewQuery } from '../../src/journal/journal-review-query.js';
import type { PrismaService } from '../../src/platform/prisma.service.js';
import type { TradeQueryService } from '../../src/ledger/trade-query.service.js';
import { reviewEvidenceFixture } from './review-evidence.fixture.js';
import { reviewNoteFixture, reviewPlanFixture } from './review-association.fixture.js';

const version = { ledgerRevision: '12', projectionGeneration: '7' };
const accountId = reviewEvidenceFixture().trade.accountId;
function setup(
  input: {
    details?: TradeDetailResponse[];
    plans?: TradePlan[];
    entries?: JournalEntry[];
    snapshots?: JournalReviewSnapshot[];
    currentVersion?: typeof version;
  } = {},
) {
  const prisma = {
    tradePlan: { findMany: vi.fn().mockResolvedValue(input.plans ?? []) },
    journalEntry: { findMany: vi.fn().mockResolvedValue(input.entries ?? []) },
    journalReviewSnapshot: { findMany: vi.fn().mockResolvedValue(input.snapshots ?? []) },
    $transaction: vi.fn(
      async (queries: Promise<unknown>[], options: { isolationLevel: string }) => {
        expect(options.isolationLevel).toBe(Prisma.TransactionIsolationLevel.RepeatableRead);
        return Promise.all(queries);
      },
    ),
  };
  const trades = {
    readAccountProjection: vi
      .fn()
      .mockResolvedValue({ version, details: input.details ?? [reviewEvidenceFixture().trade] }),
    readVersion: vi.fn().mockResolvedValue(input.currentVersion ?? version),
  };
  return {
    prisma,
    trades,
    query: new JournalReviewQuery(
      prisma as unknown as PrismaService,
      trades as unknown as TradeQueryService,
    ),
  };
}

describe('复盘候选查询编排', () => {
  it('旧深链仅由服务端匹配正式引用，绑定完整父交易与账户模式', async () => {
    const { query } = setup();
    const reference = {
      accountId,
      mode: 'actual',
      reviewObjectType: 'CLOSE_SLICE',
      tradeId: 'trade-1',
      closeSliceId: 'slice-1',
    };
    expect((await query.resolveReference(reference)).input.reference.reviewObjectId).toBe(
      'CLOSE_SLICE:slice-1',
    );
    for (const changed of [
      { ...reference, tradeId: 'wrong-parent' },
      { ...reference, mode: 'shadow' },
      { ...reference, accountId: '00000000-0000-4000-8000-000000000090' },
    ])
      await expect(query.resolveReference(changed)).rejects.toMatchObject({
        response: { errorCode: 'JOURNAL_OBJECT_NOT_FOUND' },
      });
  });
  it('只消费 Ledger 原子投影，Journal 读取使用一致快照且没有写操作', async () => {
    const { query, trades, prisma } = setup({
      plans: [reviewPlanFixture()],
      entries: [reviewNoteFixture()],
    });
    const result = await query.list({ accountId, mode: 'actual', symbol: 'AAPL.US' });
    expect(trades.readAccountProjection).toHaveBeenCalledWith({
      accountId,
      mode: 'actual',
      symbol: 'AAPL.US',
    });
    expect(prisma.$transaction.mock.calls[0]![1]).toEqual({
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });
    expect(result.total).toBe(2);
    expect(result.items.map((row) => row.input.reference.reviewObjectId)).toEqual([
      'TRADE_CYCLE:trade-1',
      'CLOSE_SLICE:slice-1',
    ]);
    expect(result.items[0]!.input.plan!.plannedEntry).toBe('1234567890123456.00000001');
    expect(result.items[0]!.input.journalEntries[0]!.notes).toBe('复盘说明');
    expect(result.legacyItems).toEqual([]);
  });
  it('投影读取期间出现更新时返回可刷新冲突，不返回混合世代', async () => {
    const { query } = setup({ currentVersion: { ...version, projectionGeneration: '8' } });
    await expect(query.list({ accountId })).rejects.toMatchObject({
      response: { errorCode: 'PROJECTION_GENERATION_CONFLICT' },
    });
  });
  it('Trade 世代不匹配或指纹未就绪时明确拒绝', async () => {
    const trade = reviewEvidenceFixture().trade;
    await expect(
      setup({ details: [{ ...trade, projectionGeneration: '6' }] }).query.list({ accountId }),
    ).rejects.toMatchObject({ response: { errorCode: 'PROJECTION_GENERATION_CONFLICT' } });
    await expect(
      setup({ details: [{ ...trade, projectionFingerprint: null }] }).query.list({ accountId }),
    ).rejects.toMatchObject({ response: { errorCode: 'PROJECTION_NOT_READY' } });
  });
  it('半开窗口使用真实结束和片段成交时间，unknown openedAt 保持为空', async () => {
    const trade = reviewEvidenceFixture().trade;
    trade.openedAt = null;
    const result = await setup({ details: [trade] }).query.list({
      accountId,
      start: '2026-01-02T09:00:00Z',
      end: '2026-01-03T09:00:00Z',
    });
    expect(result.total).toBe(1);
    expect(result.items[0]!.input.reference.reviewObjectType).toBe('CLOSE_SLICE');
    expect(result.items[0]!.openedAt).toBeNull();
    expect(result.items[0]!.statisticsEligibility.eligible).toBe(true);
  });
  it('其他 SELL 的正文不进入片段，但计划关联证明和共享计划说明保留', async () => {
    const trade = reviewEvidenceFixture().trade;
    const second = structuredClone(trade.closeSlices[0]!);
    second.id = 'slice-2';
    second.eventId = '00000000-0000-4000-8000-000000000030';
    second.factId = '00000000-0000-4000-8000-000000000031';
    second.occurredAt = '2026-01-03T09:00:00Z';
    trade.closeSlices.push(second);
    const plan = reviewPlanFixture({ tradeId: null });
    const proofNote = reviewNoteFixture({ ledgerEventId: second.eventId });
    const shared = reviewNoteFixture({
      id: '00000000-0000-4000-8000-000000000021',
      ledgerEventId: null,
    });
    const own = reviewNoteFixture({
      id: '00000000-0000-4000-8000-000000000022',
      tradePlanId: null,
    });
    const list = (notes: JournalEntry[]) =>
      setup({ details: [trade], plans: [plan], entries: notes }).query.list({ accountId });
    const first = (await list([proofNote, shared, own])).items.find(
      (row) => row.input.reference.reviewObjectId === 'CLOSE_SLICE:slice-1',
    )!;
    expect(first.input.journalEntries.map((row) => row.id)).toEqual([shared.id, own.id]);
    expect(first.input.plan!.association.journalEntryIds).toEqual([proofNote.id]);
    const otherChanged = (
      await list([{ ...proofNote, notes: '其他退出正文修改' }, shared, own])
    ).items.find((row) => row.input.reference.reviewObjectId === 'CLOSE_SLICE:slice-1')!;
    expect(otherChanged.input.projection.evidenceFingerprint).toBe(
      first.input.projection.evidenceFingerprint,
    );
    const ownChanged = (
      await list([proofNote, shared, { ...own, notes: '本片段正文修改' }])
    ).items.find((row) => row.input.reference.reviewObjectId === 'CLOSE_SLICE:slice-1')!;
    expect(ownChanged.input.projection.evidenceFingerprint).not.toBe(
      first.input.projection.evidenceFingerprint,
    );
  });
  it('旧 SELL 唯一匹配落在正式片段，缺失和歧义保留原文且不参与统计', async () => {
    const trade = reviewEvidenceFixture().trade;
    const entry = reviewNoteFixture({ tradePlanId: null });
    const unique = await setup({ details: [trade], entries: [entry] }).query.list({ accountId });
    expect(unique.legacyItems).toEqual([]);
    expect(
      unique.items.find((row) => row.input.reference.reviewObjectType === 'CLOSE_SLICE')!.input
        .journalEntries[0]!.id,
    ).toBe(entry.id);
    const missing = await setup({
      details: [],
      entries: [
        entry,
        reviewNoteFixture({ id: '00000000-0000-4000-8000-000000000099', side: 'BUY' }),
      ],
    }).query.list({ accountId });
    expect(missing.legacyItems).toHaveLength(1);
    expect(missing.legacyItems[0]).toMatchObject({
      accountMode: null,
      reason: 'SELL_MAPPING_MISSING',
      journalEntry: { notes: '复盘说明' },
      statisticsEligibility: { eligible: false },
    });
    const duplicate = structuredClone(trade);
    duplicate.id = 'trade-2';
    duplicate.closeSlices[0]!.id = 'slice-2';
    const ambiguous = await setup({ details: [trade, duplicate], entries: [entry] }).query.list({
      accountId,
    });
    expect(ambiguous.legacyItems[0]!.reason).toBe('SELL_MAPPING_AMBIGUOUS');
    expect(ambiguous.legacyItems[0]!.possibleReferences.map((row) => row.reviewObjectId)).toEqual([
      'CLOSE_SLICE:slice-1',
      'CLOSE_SLICE:slice-2',
    ]);
    expect(ambiguous.items.every((row) => row.input.journalEntries.length === 0)).toBe(true);
  });
  it('entry 费用币种缺少转换证据时完整周期明确排除', async () => {
    const trade = reviewEvidenceFixture().trade;
    trade.entryLegs[0]!.charges = [{ category: 'COMMISSION', amount: '1', currency: 'CNY' }];
    const result = await setup({ details: [trade] }).query.list({ accountId });
    expect(
      result.items.find((row) => row.input.reference.reviewObjectType === 'TRADE_CYCLE')!
        .statisticsEligibility.reasons,
    ).toContain('FX_MISSING');
  });
  it('对象详情不受列表页大小限制，并拒绝跨账户、模式和错误 Trade 引用', async () => {
    const details = Array.from({ length: 130 }, (_, index) => {
      const trade = reviewEvidenceFixture().trade;
      trade.id = `trade-${index}`;
      trade.closeSlices[0]!.id = `slice-${index}`;
      return trade;
    });
    const { query } = setup({ details });
    const reference = {
      reviewObjectType: 'CLOSE_SLICE' as const,
      reviewObjectId: 'CLOSE_SLICE:slice-129',
      tradeId: 'trade-129',
      closeSliceId: 'slice-129',
    };
    expect((await query.get({ accountId, mode: 'actual', reference })).input.reference).toEqual(
      reference,
    );
    await expect(query.get({ accountId, mode: 'shadow', reference })).rejects.toMatchObject({
      response: { errorCode: 'JOURNAL_OBJECT_NOT_FOUND' },
    });
    await expect(
      query.get({ accountId: '00000000-0000-4000-8000-000000000099', mode: 'actual', reference }),
    ).rejects.toMatchObject({ response: { errorCode: 'JOURNAL_OBJECT_NOT_FOUND' } });
    await expect(
      query.get({ accountId, mode: 'actual', reference: { ...reference, tradeId: 'foreign' } }),
    ).rejects.toMatchObject({ response: { errorCode: 'JOURNAL_OBJECT_NOT_FOUND' } });
  });
});
