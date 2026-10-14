import { describe, expect, it } from 'vitest';
import { journalReviewCandidate } from '../../src/journal/journal-review-candidate.js';
import { reviewEvidenceFixture } from './review-evidence.fixture.js';

describe('Journal decimal 候选编排', () => {
  it('完整周期使用真实时间、domain 资格及对象来源', () => {
    const evidence = reviewEvidenceFixture();
    const candidate = journalReviewCandidate({
      evidence,
      fxMissing: false,
      projectionStale: false,
    });
    expect(candidate.input.reference.reviewObjectId).toBe('TRADE_CYCLE:trade-1');
    expect(candidate.statisticsEligibility).toEqual({ eligible: true, reasons: [] });
    expect(candidate.effectiveClosedAt).toBe(evidence.trade.closedAt);
    expect(candidate.input.projection.evidenceFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(candidate.input.trade.sourceQuantity).toBe('2');
    expect(candidate.missingEvidence).toEqual(['PLAN_MISSING']);
  });
  it('未知开仓保持正式对象及实际收益，不借用最早观察', () => {
    const evidence = reviewEvidenceFixture();
    evidence.trade.openedAt = null;
    const candidate = journalReviewCandidate({
      evidence,
      fxMissing: false,
      projectionStale: false,
    });
    expect(candidate.openedAt).toBeNull();
    expect(candidate.statisticsEligibility.reasons).toEqual(['UNKNOWN_OPENED_AT']);
    expect(candidate.input.trade.netRealizedPnl).toBe('4');
  });
  it('ACTIVE 的真实片段独立合资格，父周期不合资格', () => {
    const evidence = reviewEvidenceFixture();
    evidence.trade.lifecycle = 'ACTIVE';
    evidence.trade.endEvidence = 'UNKNOWN';
    evidence.trade.closedAt = null;
    expect(
      journalReviewCandidate({ evidence, fxMissing: false, projectionStale: false })
        .statisticsEligibility.reasons,
    ).toEqual(['ACTIVE_TRADE', 'NON_SELL_ENDING', 'EVIDENCE_INCOMPLETE']);
    evidence.reference = {
      reviewObjectType: 'CLOSE_SLICE',
      reviewObjectId: 'CLOSE_SLICE:slice-1',
      tradeId: 'trade-1',
      closeSliceId: 'slice-1',
    };
    const candidate = journalReviewCandidate({
      evidence,
      fxMissing: false,
      projectionStale: false,
    });
    expect(candidate.statisticsEligibility).toEqual({ eligible: true, reasons: [] });
    expect(candidate.executedAt).toBe('2026-01-02T09:00:00Z');
    expect(candidate.effectiveClosedAt).toBeNull();
  });
  it('相关对象更正使旧快照过期，不影响当前事实的资格', () => {
    const evidence = reviewEvidenceFixture();
    const original = journalReviewCandidate({ evidence, fxMissing: false, projectionStale: false });
    evidence.trade.closeSlices[0]!.price = '13';
    const candidate = journalReviewCandidate({
      evidence,
      fxMissing: false,
      projectionStale: false,
      previousEvidenceFingerprint: original.input.projection.evidenceFingerprint,
    });
    expect(candidate.reviewStatus).toBe('STALE');
    expect(candidate.statisticsEligibility.eligible).toBe(true);
  });
  it('无关整体投影变化不使已保存对象过期', () => {
    const evidence = reviewEvidenceFixture();
    const original = journalReviewCandidate({ evidence, fxMissing: false, projectionStale: false });
    evidence.trade.projectionGeneration = evidence.projection.projectionGeneration = '8';
    evidence.trade.projectionFingerprint = evidence.projection.projectionFingerprint = 'unrelated';
    expect(
      journalReviewCandidate({
        evidence,
        fxMissing: false,
        projectionStale: false,
        previousEvidenceFingerprint: original.input.projection.evidenceFingerprint,
      }).reviewStatus,
    ).toBe('CURRENT');
  });
  it('输入投影过期及缺 FX 输出明确原因', () => {
    const candidate = journalReviewCandidate({
      evidence: reviewEvidenceFixture(),
      fxMissing: true,
      projectionStale: true,
    });
    expect(candidate.statisticsEligibility.reasons).toEqual(['FX_MISSING', 'STALE_PROJECTION']);
  });
  it('片段缺成本源或未知成本不能伪造完整证据', () => {
    const evidence = reviewEvidenceFixture();
    evidence.reference = {
      reviewObjectType: 'CLOSE_SLICE',
      reviewObjectId: 'CLOSE_SLICE:slice-1',
      tradeId: 'trade-1',
      closeSliceId: 'slice-1',
    };
    evidence.trade.entryLegs = [];
    expect(
      journalReviewCandidate({ evidence, fxMissing: false, projectionStale: false })
        .statisticsEligibility.reasons,
    ).toContain('EVIDENCE_INCOMPLETE');
  });
});
