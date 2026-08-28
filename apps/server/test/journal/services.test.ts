import { describe, expect, it, vi } from 'vitest';
import type { TradeDetailResponseV2 } from '@thesis-ledger/schemas';
import { JournalService } from '../../src/journal/journal.service.js';

const accountId = '11111111-1111-4111-8111-111111111111';
const buyId = '22222222-2222-4222-8222-222222222222';
const buyFactId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const sellId = '33333333-3333-4333-8333-333333333333';
const sellFactId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const journalId = '44444444-4444-4444-8444-444444444444';
const planId = '55555555-5555-4555-8555-555555555555';

const makeDetail = (overrides: Partial<TradeDetailResponseV2> = {}): TradeDetailResponseV2 => ({
  id: 'trade:test:600519.SH:1',
  accountId,
  accountMode: 'actual',
  symbol: '600519.SH',
  lifecycle: 'ENDED',
  exitProgress: 'FULL',
  endEvidence: 'SELL_EXECUTION',
  openedAt: '2025-01-01T09:30:00.000Z',
  closedAt: '2025-01-03T09:30:00.000Z',
  earliestEvidenceAt: '2025-01-01T09:30:00.000Z',
  sourceQuantity: '100',
  closedQuantity: '100',
  remainingQuantity: '0',
  grossRealizedPnl: '200',
  netRealizedPnl: '187',
  realizedNetReturnRate: '0.18',
  costEstimated: false,
  completeness: 'COMPLETE',
  issues: [],
  costIssues: [],
  algorithmVersion: 'trade-projection-v1',
  projectionFingerprint: 'fingerprint-1',
  projectionGeneration: '7',
  excludedReasons: [],
  entryLegs: [
    {
      id: 'entry-leg-1',
      eventId: buyId,
      factId: buyFactId,
      occurredAt: '2025-01-01T09:30:00.000Z',
      currency: 'CNY',
      price: '10',
      originalQuantity: '100',
      quantity: '100',
      remainingQuantity: '0',
      rawCost: '1000',
      remainingCost: '0',
      rawCostEstimated: false,
      charges: [],
    },
  ],
  baselineComponents: [],
  corporateActions: [],
  closeSlices: [
    {
      id: 'trade:test:600519.SH:1:close:1',
      eventId: sellId,
      factId: sellFactId,
      occurredAt: '2025-01-03T09:30:00.000Z',
      currency: 'CNY',
      price: '12',
      quantity: '100',
      remainingQuantityAfter: '0',
      charges: [],
      grossRealizedPnl: '200',
      netRealizedPnl: '187',
      realizedNetReturnRate: '0.18',
      costEstimated: false,
      allocations: [
        {
          id: 'allocation-1',
          source: 'ENTRY_LEG',
          sourceEventId: buyId,
          sourceFactId: buyFactId,
          quantity: '100',
          originalCost: '1000',
          allocatedBuyCharges: [],
        },
      ],
    },
  ],
  dividendAttributions: [],
  evidenceSources: [
    {
      id: 'evidence-buy',
      kind: 'EXECUTION',
      eventId: buyId,
      factId: buyFactId,
      source: { category: 'MANUAL', channel: 'test' },
    },
    {
      id: 'evidence-sell',
      kind: 'EXECUTION',
      eventId: sellId,
      factId: sellFactId,
      source: { category: 'MANUAL', channel: 'test' },
    },
  ],
  ...overrides,
});

const makeTradeQuery = (detail: TradeDetailResponseV2) => ({
  listDetails: vi.fn(async () => [detail]),
  readVersion: vi.fn(async () => ({ ledgerRevision: '9', projectionGeneration: '7' })),
  get: vi.fn(async () => detail),
});

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
    const service = new JournalService(prisma as never, {} as never);
    await expect(service.listEntries(undefined, 'a')).resolves.toEqual([
      { id: 'entry', accountId: 'a' },
    ]);
    await expect(service.listPlans(undefined, 'a')).resolves.toEqual([
      { id: 'plan', accountId: 'a' },
    ]);
    expect(
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

  it('从统一 Trade Projection 返回 Trade Cycle 与 Close Slice，且不读取 LedgerEvent', async () => {
    const detail = makeDetail();
    const tradeQuery = makeTradeQuery(detail);
    const prisma = {
      tradePlan: {
        findMany: vi.fn(async () => [
          {
            id: planId,
            accountId,
            tradeId: detail.id,
            symbol: detail.symbol,
            plannedEntry: 10,
            plannedExit: 13,
            stopLoss: 9,
            takeProfit: 13,
            targetWeight: 0.1,
            expectedHoldingDays: 2,
            plannedEntryAt: new Date(detail.openedAt!),
            plannedExitAt: new Date(detail.closedAt!),
            status: 'executed',
            createdAt: new Date('2025-01-01T08:00:00.000Z'),
          },
        ]),
      },
      journalEntry: {
        findMany: vi.fn(async () => [
          {
            id: journalId,
            ledgerEventId: sellId,
            tradePlanId: planId,
            symbol: detail.symbol,
            side: 'sell',
          },
        ]),
      },
      journalReviewSnapshot: {
        findMany: vi.fn(async () => []),
      },
    };
    const service = new JournalService(prisma as never, tradeQuery as never);

    const result = await service.listReviewCandidates({ accountId, limit: 10 });

    expect(result).toMatchObject({ total: 2, nextCursor: null, legacyItems: [] });
    expect(result.items.find((item) => item.reviewObjectType === 'TRADE_CYCLE')).toMatchObject({
      accountId,
      symbol: '600519.SH',
      pnl: 187,
      statisticsEligible: true,
      evidenceCompleteness: 'complete',
      missingEvidence: [],
      plan: { id: planId, plannedEntry: 10, stopLoss: 9 },
      sources: { entryEventIds: [buyId], exitEventIds: [sellId], planId },
    });
    expect(result.items.find((item) => item.reviewObjectType === 'CLOSE_SLICE')).toMatchObject({
      reviewObjectType: 'CLOSE_SLICE',
      closeSliceId: detail.closeSlices[0]!.id,
      pnl: 187,
      statisticsEligible: false,
      excludedReasons: ['CLOSE_SLICE_SEPARATE_STATISTICS'],
    });
    expect(tradeQuery.listDetails).toHaveBeenCalledWith({ accountId, mode: 'actual' });
    expect(prisma.journalEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { accountId } }),
    );
  });

  it('按 projection fingerprint 标记旧快照，并将无法映射的 Journal 引用保留为 legacy', async () => {
    const detail = makeDetail();
    const tradeQuery = makeTradeQuery(detail);
    const legacyJournalId = '66666666-6666-4666-8666-666666666666';
    const legacyEventId = '77777777-7777-4777-8777-777777777777';
    const prisma = {
      tradePlan: { findMany: vi.fn(async () => []) },
      journalEntry: {
        findMany: vi.fn(async () => [
          {
            id: legacyJournalId,
            ledgerEventId: legacyEventId,
            tradePlanId: null,
            symbol: detail.symbol,
            side: 'sell',
          },
        ]),
      },
      journalReviewSnapshot: {
        findMany: vi.fn(async () => [
          {
            tradeId: detail.id,
            closeSliceId: detail.closeSlices[0]!.id,
            projectionFingerprint: 'old-fingerprint',
            projectionGeneration: BigInt(6),
            createdAt: new Date('2025-01-04T00:00:00.000Z'),
          },
        ]),
      },
    };
    const service = new JournalService(prisma as never, tradeQuery as never);

    const result = await service.listReviewCandidates({ accountId, limit: 10 });
    const slice = result.items.find((item) => item.reviewObjectType === 'CLOSE_SLICE');

    expect(slice).toMatchObject({ reviewStatus: 'STALE', stale: true });
    expect(slice?.excludedReasons).toContain('STALE_REVIEW_SNAPSHOT');
    expect(result.legacyItems).toEqual([
      expect.objectContaining({
        accountId,
        journalEntryId: legacyJournalId,
        ledgerEventId: legacyEventId,
        reviewStatus: 'LEGACY_REVIEW_NEEDS_CONFIRMATION',
        tradeId: null,
        closeSliceId: null,
      }),
    ]);
  });

  it('保存统一 Trade/Close Slice 快照并固定账本与投影版本', async () => {
    const detail = makeDetail();
    const tradeQuery = makeTradeQuery(detail);
    const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: '88888888-8888-4888-8888-888888888888',
      accountId: data.accountId,
      mode: data.mode,
      reviewObjectType: data.reviewObjectType,
      tradeId: data.tradeId,
      closeSliceId: data.closeSliceId,
      fxEvidenceVersion: data.fxEvidenceVersion,
      conversionFingerprint: data.conversionFingerprint,
      ledgerRevision: data.ledgerRevision,
      projectionGeneration: data.projectionGeneration,
      projectionFingerprint: data.projectionFingerprint,
      inputSnapshot: data.inputSnapshot,
      outputSnapshot: data.outputSnapshot,
      status: data.status,
      createdAt: new Date('2025-01-04T00:00:00.000Z'),
    }));
    const prisma = { journalReviewSnapshot: { create } };
    const service = new JournalService(prisma as never, tradeQuery as never);

    const result = await service.saveReviewSnapshot({
      accountId,
      mode: 'actual',
      reviewObjectType: 'CLOSE_SLICE',
      tradeId: detail.id,
      closeSliceId: detail.closeSlices[0]!.id,
      inputSnapshot: { source: 'test' },
      outputSnapshot: { pnl: 187 },
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        accountId,
        mode: 'actual',
        reviewObjectType: 'CLOSE_SLICE',
        tradeId: detail.id,
        closeSliceId: detail.closeSlices[0]!.id,
        ledgerRevision: BigInt(9),
        projectionGeneration: BigInt(7),
        projectionFingerprint: 'fingerprint-1',
        status: 'CURRENT',
      }),
    });
    expect(result).toMatchObject({
      accountId,
      reviewObjectType: 'CLOSE_SLICE',
      tradeId: detail.id,
      closeSliceId: detail.closeSlices[0]!.id,
      ledgerRevision: '9',
      projectionGeneration: '7',
      projectionFingerprint: 'fingerprint-1',
      inputSnapshot: { source: 'test' },
      outputSnapshot: { pnl: 187 },
      status: 'CURRENT',
    });
  });

  it('账户级投影代数变化但 Trade 指纹未变时不使复盘过期', async () => {
    const detail = makeDetail();
    const tradeQuery = {
      ...makeTradeQuery(detail),
      readVersion: vi.fn(async () => ({ ledgerRevision: '10', projectionGeneration: '8' })),
    };
    const prisma = {
      tradePlan: { findMany: vi.fn(async () => []) },
      journalEntry: { findMany: vi.fn(async () => []) },
      journalReviewSnapshot: {
        findMany: vi.fn(async () => [
          {
            tradeId: detail.id,
            closeSliceId: null,
            projectionFingerprint: detail.projectionFingerprint,
            projectionGeneration: BigInt(7),
            createdAt: new Date('2025-01-04T00:00:00.000Z'),
          },
        ]),
      },
    };
    const service = new JournalService(prisma as never, tradeQuery as never);

    const result = await service.listReviewCandidates({ accountId, limit: 10 });

    expect(result.items.every((item) => item.stale === false)).toBe(true);
    expect(
      result.items.every((item) => !item.excludedReasons.includes('STALE_REVIEW_SNAPSHOT')),
    ).toBe(true);
  });
});
