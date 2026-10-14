import { describe, expect, it } from 'vitest';
import {
  journalReviewEvidenceFingerprint,
  journalReviewEvidenceReferences,
} from '../../src/journal/journal-review-evidence.js';
import { reviewEvidenceFixture } from './review-evidence.fixture.js';

const sliceInput = () => ({
  ...reviewEvidenceFixture(),
  reference: {
    reviewObjectType: 'CLOSE_SLICE' as const,
    reviewObjectId: 'CLOSE_SLICE:slice-1',
    tradeId: 'trade-1',
    closeSliceId: 'slice-1',
  },
});

describe('Journal 对象级证据指纹', () => {
  it('片段来源只引用实际成本源及该 SELL，不引用未分配的事实', () => {
    const input = sliceInput();
    const expected = journalReviewEvidenceReferences(input);
    input.trade.entryLegs.push({
      ...input.trade.entryLegs[0]!,
      id: 'unused-entry',
      eventId: '00000000-0000-4000-8000-000000000098',
      factId: '00000000-0000-4000-8000-000000000099',
    });
    input.projection.factIds = [];
    input.projection.eventIds = [];
    expect(journalReviewEvidenceReferences(input)).toEqual(expected);
    expect(expected.factIds).toEqual(
      [input.trade.entryLegs[0]!.factId, input.trade.closeSlices[0]!.factId].sort(),
    );
  });
  it('周期来源保留基线对账及分配的事实引用', () => {
    const input = reviewEvidenceFixture();
    input.trade.closeSlices[0]!.allocations[0]!.sourceFactId =
      '00000000-0000-4000-8000-000000000099';
    expect(journalReviewEvidenceReferences(input).factIds).toContain(
      '00000000-0000-4000-8000-000000000099',
    );
  });
  it('无关整体投影、世代、ledger revision 与展示名变化不使对象过期', () => {
    const input = reviewEvidenceFixture();
    const original = journalReviewEvidenceFingerprint(input);
    input.projection.ledgerRevision = '900';
    input.projection.projectionGeneration = input.trade.projectionGeneration = '901';
    input.projection.projectionFingerprint = input.trade.projectionFingerprint = 'unrelated-asset';
    input.projection.evidenceFingerprint = 'previous-object';
    input.trade.assetName = '名称更新';
    expect(journalReviewEvidenceFingerprint(input)).toBe(original);
  });
  it('输入反序、存储行 ID 重建不改变实际对象证据', () => {
    const input = reviewEvidenceFixture();
    const original = journalReviewEvidenceFingerprint(input);
    input.trade.evidenceSources.reverse();
    input.trade.evidenceSources[0]!.id = 'rebuilt-source-row';
    input.trade.entryLegs[0]!.id = 'rebuilt-entry-row';
    input.trade.closeSlices[0]!.allocations[0]!.id = 'rebuilt-allocation-row';
    expect(journalReviewEvidenceFingerprint(input)).toBe(original);
  });
  it('周期实际价格、成本分配、来源更正均改变对象指纹', () => {
    const input = reviewEvidenceFixture();
    const original = journalReviewEvidenceFingerprint(input);
    input.trade.closeSlices[0]!.price = '13';
    expect(journalReviewEvidenceFingerprint(input)).not.toBe(original);
    const cost = reviewEvidenceFixture();
    cost.trade.closeSlices[0]!.allocations[0]!.originalCost = '10.000000000000000001';
    expect(journalReviewEvidenceFingerprint(cost)).not.toBe(original);
    const source = reviewEvidenceFixture();
    source.trade.evidenceSources[0]!.source.channel = 'corrected';
    expect(journalReviewEvidenceFingerprint(source)).not.toBe(original);
  });
  it('后续 SELL、当前余额和父周期结束不使旧减仓片段过期', () => {
    const input = sliceInput();
    const original = journalReviewEvidenceFingerprint(input);
    input.trade.lifecycle = 'ACTIVE';
    input.trade.endEvidence = 'UNKNOWN';
    input.trade.closedAt = null;
    input.trade.netRealizedPnl = '999';
    input.trade.remainingQuantity = '1';
    input.trade.entryLegs[0]!.remainingQuantity = '1';
    input.trade.entryLegs[0]!.remainingCost = '10';
    input.trade.closeSlices.push({
      ...structuredClone(input.trade.closeSlices[0]!),
      id: 'later-slice',
      occurredAt: '2026-01-03T09:00:00Z',
      price: '999',
    });
    expect(journalReviewEvidenceFingerprint(input)).toBe(original);
  });
  it('片段只依赖自身 SELL 与实际成本源，不依赖无分配的另一建仓', () => {
    const input = sliceInput();
    const original = journalReviewEvidenceFingerprint(input);
    input.trade.entryLegs.push({
      ...input.trade.entryLegs[0]!,
      id: 'unused-entry',
      factId: '00000000-0000-4000-8000-000000000099',
      price: '999',
    });
    expect(journalReviewEvidenceFingerprint(input)).toBe(original);
    input.trade.entryLegs[0]!.price = '11';
    expect(journalReviewEvidenceFingerprint(input)).not.toBe(original);
  });
  it('公司行动按片段时间限定，之后的行动不参与该退出', () => {
    const input = sliceInput();
    const original = journalReviewEvidenceFingerprint(input);
    input.trade.corporateActions.push({
      id: 'split-row',
      eventId: '00000000-0000-4000-8000-000000000088',
      factId: '00000000-0000-4000-8000-000000000089',
      type: 'SPLIT',
      occurredAt: '2026-01-03T09:00:00Z',
      quantity: null,
      fromUnits: '1',
      toUnits: '2',
      positionQuantityBefore: '1',
      positionQuantityAfter: '2',
    });
    expect(journalReviewEvidenceFingerprint(input)).toBe(original);
    input.trade.corporateActions[0]!.occurredAt = '2026-01-01T12:00:00Z';
    expect(journalReviewEvidenceFingerprint(input)).not.toBe(original);
  });
  it('明确关联计划与 FX 来源、版本属于依赖', () => {
    const input = sliceInput();
    const original = journalReviewEvidenceFingerprint(input);
    input.plan = {
      id: input.trade.accountId,
      accountId: input.trade.accountId,
      tradeId: input.trade.id,
      symbol: input.trade.symbol,
      side: 'BUY',
      plannedEntry: '10',
      plannedExit: '12',
      stopLoss: null,
      takeProfit: null,
      targetWeight: null,
      expectedHoldingDays: null,
      plannedEntryAt: null,
      plannedExitAt: null,
      reason: null,
      thesis: '长期持有',
      status: 'active',
      association: { kind: 'DIRECT_TRADE', journalEntryIds: [], eventIds: [], references: [] },
    };
    const planned = journalReviewEvidenceFingerprint(input);
    expect(planned).not.toBe(original);
    input.plan.thesis = '分批退出';
    expect(journalReviewEvidenceFingerprint(input)).not.toBe(planned);
    input.fxEvidence = [
      {
        fromCurrency: 'USD',
        toCurrency: 'CNY',
        rate: '7.1',
        observedAt: '2026-01-02T09:00:00Z',
        source: 'fixture',
        version: 'fx-1',
      },
    ];
    const fx = journalReviewEvidenceFingerprint(input);
    input.fxEvidence[0]!.rate = '7.100000000000000001';
    expect(journalReviewEvidenceFingerprint(input)).not.toBe(fx);
  });
});
