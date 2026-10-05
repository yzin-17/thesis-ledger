import { describe, expect, it } from 'vitest';
import {
  JOURNAL_REVIEW_OBJECT_TYPES,
  JOURNAL_STATISTICS_EXCLUSION_REASONS,
} from '@thesis-ledger/domain';
import {
  journalReviewObjectReferenceSchema,
  journalStatisticsExclusionReasonSchema,
  journalStatisticsEligibilitySchema,
  journalReviewEvidenceInputSchema,
  journalReviewCandidateContractSchema,
  journalReviewSnapshotContractSchema,
  journalReviewSnapshotRequestSchema,
  journalDecimalMetricSchema,
} from '../src/index.js';

const accountId = '00000000-0000-4000-8000-000000000001';
const factId = '00000000-0000-4000-8000-000000000002';
const eventId = '00000000-0000-4000-8000-000000000003';
const exact = '9007199254740993.000000000000000001';
const trade = {
  id: 'trade-1',
  accountId,
  accountMode: 'actual',
  symbol: 'AAPL.US',
  lifecycle: 'ENDED',
  exitProgress: 'FULL',
  endEvidence: 'SELL_EXECUTION',
  openedAt: null,
  closedAt: '2026-01-03T09:00:00Z',
  earliestEvidenceAt: '2026-01-01T09:00:00Z',
  sourceQuantity: exact,
  closedQuantity: exact,
  remainingQuantity: '0',
  grossRealizedPnl: exact,
  netRealizedPnl: null,
  realizedNetReturnRate: null,
  costEstimated: false,
  completeness: 'COMPLETE',
  issues: [],
  costIssues: [],
  algorithmVersion: 'fixture',
  projectionFingerprint: 'projection-1',
  projectionGeneration: '7',
  excludedReasons: [],
  entryLegs: [],
  baselineComponents: [],
  corporateActions: [],
  closeSlices: [
    {
      id: 'slice-1',
      eventId,
      factId,
      occurredAt: '2026-01-02T09:00:00Z',
      currency: 'USD',
      price: exact,
      quantity: '1.000000000000000001',
      remainingQuantityAfter: '1',
      charges: [],
      grossRealizedPnl: exact,
      netRealizedPnl: null,
      realizedNetReturnRate: null,
      costEstimated: false,
      allocations: [
        {
          id: 'allocation-1',
          source: 'ENTRY_LEG',
          sourceEventId: eventId,
          sourceFactId: factId,
          quantity: '1.000000000000000001',
          originalCost: exact,
          allocatedBuyCharges: [],
        },
      ],
    },
  ],
  dividendAttributions: [],
  evidenceSources: [],
};
const reference = {
  reviewObjectType: 'TRADE_CYCLE',
  reviewObjectId: 'TRADE_CYCLE:trade-1',
  tradeId: 'trade-1',
};
const input = {
  reference,
  trade,
  plan: null,
  fxEvidence: [],
  projection: {
    ledgerRevision: '12',
    projectionGeneration: '7',
    projectionFingerprint: 'projection-1',
    evidenceFingerprint: 'object-1',
    factIds: [factId],
    eventIds: [eventId],
    fxEvidenceVersion: null,
    conversionFingerprint: null,
  },
};
const eligibility = { eligible: false, reasons: ['UNKNOWN_OPENED_AT'] };
const candidate = {
  input,
  openedAt: null,
  effectiveClosedAt: trade.closedAt,
  executedAt: null,
  statisticsEligibility: eligibility,
  reviewStatus: 'CURRENT',
  missingEvidence: [],
};

describe('复盘 decimal 与对象证据合同', () => {
  it('排除原因与 domain 一致，两个正式对象类型可解析', () => {
    expect(journalStatisticsExclusionReasonSchema.options).toEqual([
      ...JOURNAL_STATISTICS_EXCLUSION_REASONS,
    ]);
    for (const type of JOURNAL_REVIEW_OBJECT_TYPES)
      expect(
        journalReviewObjectReferenceSchema.safeParse(
          type === 'TRADE_CYCLE'
            ? reference
            : {
                reviewObjectType: type,
                reviewObjectId: 'CLOSE_SLICE:slice-1',
                tradeId: 'trade-1',
                closeSliceId: 'slice-1',
              },
        ).success,
      ).toBe(true);
  });
  it('权威原始数量、价格、成本和收益字符串不近似', () => {
    const parsed = journalReviewEvidenceInputSchema.parse(input);
    expect(parsed.trade.sourceQuantity).toBe(exact);
    expect(parsed.trade.grossRealizedPnl).toBe(exact);
    expect(parsed.trade.closeSlices[0]!.price).toBe(exact);
    expect(parsed.trade.closeSlices[0]!.allocations[0]!.originalCost).toBe(exact);
    expect(parsed.trade.netRealizedPnl).toBeNull();
  });
  it('拒绝 number 事实及 unknown 数值的零填充', () => {
    expect(
      journalReviewEvidenceInputSchema.safeParse({
        ...input,
        trade: { ...trade, sourceQuantity: Number(exact) },
      }).success,
    ).toBe(false);
    expect(
      journalDecimalMetricSchema.safeParse({
        status: 'INSUFFICIENT_EVIDENCE',
        value: '0',
        unit: 'AMOUNT',
        currency: 'USD',
        missingEvidence: ['COST_MISSING'],
      }).success,
    ).toBe(false);
  });
  it('未知 openedAt 可作为正式候选，不能借用 earliestEvidenceAt', () => {
    expect(journalReviewCandidateContractSchema.parse(candidate).openedAt).toBeNull();
    expect(
      journalReviewCandidateContractSchema.safeParse({
        ...candidate,
        openedAt: trade.earliestEvidenceAt,
      }).success,
    ).toBe(false);
  });
  it('ACTIVE 周期不能伪造结束时间，片段使用自身成交时间', () => {
    const activeInput = { ...input, trade: { ...trade, lifecycle: 'ACTIVE' } };
    expect(
      journalReviewCandidateContractSchema.safeParse({ ...candidate, input: activeInput }).success,
    ).toBe(false);
    const sliceInput = {
      ...activeInput,
      reference: {
        reviewObjectType: 'CLOSE_SLICE',
        reviewObjectId: 'CLOSE_SLICE:slice-1',
        tradeId: 'trade-1',
        closeSliceId: 'slice-1',
      },
    };
    expect(
      journalReviewCandidateContractSchema.safeParse({
        ...candidate,
        input: sliceInput,
        effectiveClosedAt: null,
        executedAt: trade.closeSlices[0]!.occurredAt,
      }).success,
    ).toBe(true);
  });
  it('拒绝不匹配 ID、跨 Trade 片段和未分粒度的 legacy 引用', () => {
    expect(
      journalReviewObjectReferenceSchema.safeParse({ ...reference, reviewObjectId: 'trade-1' })
        .success,
    ).toBe(false);
    expect(
      journalReviewObjectReferenceSchema.safeParse({
        ...reference,
        reviewObjectId: 'legacy:trade-1',
      }).success,
    ).toBe(false);
    expect(
      journalReviewEvidenceInputSchema.safeParse({
        ...input,
        reference: {
          reviewObjectType: 'CLOSE_SLICE',
          reviewObjectId: 'CLOSE_SLICE:foreign',
          tradeId: 'trade-1',
          closeSliceId: 'foreign',
        },
      }).success,
    ).toBe(false);
    expect(
      journalReviewObjectReferenceSchema.safeParse({ ...reference, reviewObjectType: 'JSON' })
        .success,
    ).toBe(false);
  });
  it('拒绝资格与 reasons 的矛盾和陌生原因', () => {
    expect(
      journalStatisticsEligibilitySchema.safeParse({ eligible: true, reasons: ['ESTIMATED_COST'] })
        .success,
    ).toBe(false);
    expect(
      journalStatisticsEligibilitySchema.safeParse({ eligible: false, reasons: [] }).success,
    ).toBe(false);
    expect(
      journalStatisticsEligibilitySchema.safeParse({ eligible: false, reasons: ['UNKNOWN_REASON'] })
        .success,
    ).toBe(false);
  });
  it('输入投影版本必须对应 Trade', () => {
    expect(
      journalReviewEvidenceInputSchema.safeParse({
        ...input,
        projection: {
          ...input.projection,
          projectionGeneration: '8',
        },
      }).success,
    ).toBe(false);
  });
  it('计划只按账户与 Trade 显式关联，金额保留 decimal', () => {
    const plan = {
      id: factId,
      accountId,
      tradeId: 'trade-1',
      plannedEntry: exact,
      symbol: trade.symbol,
      side: 'BUY',
      plannedExit: null,
      stopLoss: null,
      takeProfit: null,
      targetWeight: null,
      expectedHoldingDays: null,
      plannedEntryAt: null,
      plannedExitAt: null,
      reason: null,
      thesis: null,
      status: 'active',
    };
    expect(journalReviewEvidenceInputSchema.parse({ ...input, plan }).plan!.plannedEntry).toBe(
      exact,
    );
    expect(
      journalReviewEvidenceInputSchema.safeParse({
        ...input,
        plan: { ...plan, tradeId: 'foreign' },
      }).success,
    ).toBe(false);
  });
});

describe('正式 Snapshot 保存与历史输入合同', () => {
  const output = {
    reviewObjectId: reference.reviewObjectId,
    algorithmVersion: 'journal-decimal-1',
    statisticsEligibility: eligibility,
    metrics: {
      netPnl: {
        status: 'INSUFFICIENT_EVIDENCE',
        value: null,
        unit: 'AMOUNT',
        currency: 'USD',
        missingEvidence: ['COST_MISSING'],
      },
    },
    behaviorNotes: [],
    rounding: { mode: 'HALF_UP', amountFractionDigits: 8, ratioFractionDigits: 12 },
  };
  const snapshot = {
    id: eventId,
    inputSnapshot: input,
    outputSnapshot: output,
    status: 'STALE',
    createdAt: trade.closedAt,
  };
  it('STALE 仍保留原始 decimal 输入和确定性输出', () => {
    const parsed = journalReviewSnapshotContractSchema.parse(snapshot);
    expect(parsed.status).toBe('STALE');
    expect(parsed.inputSnapshot.trade.sourceQuantity).toBe(exact);
    expect(parsed.outputSnapshot.metrics.netPnl!.value).toBeNull();
  });
  it('拒绝任意 JSON 结果和跨对象输出', () => {
    expect(
      journalReviewSnapshotContractSchema.safeParse({ ...snapshot, outputSnapshot: {} }).success,
    ).toBe(false);
    expect(
      journalReviewSnapshotContractSchema.safeParse({
        ...snapshot,
        outputSnapshot: { ...output, reviewObjectId: 'TRADE_CYCLE:foreign' },
      }).success,
    ).toBe(false);
  });
  it('保存请求只带稳定对象及预期指纹，不接受客户端伪造输入输出', () => {
    const request = { accountId, mode: 'actual', reference, evidenceFingerprint: 'object-1' };
    expect(journalReviewSnapshotRequestSchema.safeParse(request).success).toBe(true);
    expect(
      journalReviewSnapshotRequestSchema.safeParse({ ...request, outputSnapshot: output }).success,
    ).toBe(false);
  });
});
