import { describe, expect, it, vi } from 'vitest';
import {
  JournalReviewAnalysis,
  journalAnalyzeCandidate,
} from '../../src/journal/journal-review-analysis.js';
import type { JournalReviewQuery } from '../../src/journal/journal-review-query.js';
import { journalReviewCandidate } from '../../src/journal/journal-review-candidate.js';
import { reviewEvidenceFixture } from './review-evidence.fixture.js';

const candidate = () =>
  journalReviewCandidate({
    evidence: reviewEvidenceFixture(),
    fxMissing: false,
    projectionStale: false,
  });
describe('复盘分析的权威输入与 Schema 输出', () => {
  it('草稿只替换分析假设，不改变源证据或接受客户端成交事实', async () => {
    const current = candidate();
    const original = structuredClone(current);
    const service = new JournalReviewAnalysis({
      get: vi.fn().mockResolvedValue(current),
    } as unknown as JournalReviewQuery);
    const request = {
      accountId: current.input.trade.accountId,
      mode: 'actual',
      reference: current.input.reference,
      evidenceFingerprint: current.input.projection.evidenceFingerprint,
      analysisDraft: { stopLoss: '8', note: '独立草稿' },
    };
    const result = await service.analyze(request);
    expect(result.candidate.input.analysisDraft).toEqual(request.analysisDraft);
    expect(result.candidate.input.projection.evidenceFingerprint).toBe(request.evidenceFingerprint);
    expect(result.result.metrics.counterfactualNetPnl!.value).toBe('0');
    expect(result.result.metrics.netRealizedPnl!.value).toBe('4');
    expect(current).toEqual(original);
    await expect(
      service.analyze({
        ...request,
        analysisDraft: { sourceQuantity: '999', netRealizedPnl: '999' },
      }),
    ).rejects.toThrow();
  });
  it('decimal domain 结果可通过正式 Schema，原始输入及证据没有变化', () => {
    const input = candidate();
    const before = structuredClone(input);
    const output = journalAnalyzeCandidate(input);
    expect(output.metrics.netRealizedPnl!.value).toBe('4');
    expect(output.behaviors).toHaveLength(4);
    expect(output.metrics.executedQuantity!.unit).toBe('QUANTITY');
    expect(output.metrics.actualHoldingDays!.value).toBe('2');
    expect(input).toEqual(before);
  });
  it('API 分析只接受对象/预期指纹，从当前投影解析事实，拒绝客户自造 input/output', async () => {
    const current = candidate();
    const get = vi.fn().mockResolvedValue(current);
    const service = new JournalReviewAnalysis({ get } as unknown as JournalReviewQuery);
    const request = {
      accountId: current.input.trade.accountId,
      mode: 'actual',
      reference: current.input.reference,
      evidenceFingerprint: current.input.projection.evidenceFingerprint,
    };
    const result = await service.analyze(request);
    expect(result.result.reviewObjectId).toBe(current.input.reference.reviewObjectId);
    expect(get).toHaveBeenCalledTimes(1);
    await expect(
      service.analyze({ ...request, expectedAlgorithmVersion: 'future' }),
    ).rejects.toMatchObject({ response: { errorCode: 'JOURNAL_ALGORITHM_CHANGED' } });
    await expect(
      service.analyze({ ...request, inputSnapshot: {}, outputSnapshot: {} }),
    ).rejects.toThrow();
    expect(get).toHaveBeenCalledTimes(2);
  });
  it('相关证据变化时返回刷新冲突，不把新事实冒充用户刚核对的输入', async () => {
    const current = candidate();
    const get = vi.fn().mockResolvedValue(current);
    const service = new JournalReviewAnalysis({ get } as unknown as JournalReviewQuery);
    await expect(
      service.analyze({
        accountId: current.input.trade.accountId,
        mode: 'actual',
        reference: current.input.reference,
        evidenceFingerprint: 'previous',
      }),
    ).rejects.toMatchObject({ response: { errorCode: 'JOURNAL_EVIDENCE_CHANGED' } });
  });
  it('周期分析从同一账户模式读取，分开完整周期/减仓样本且不用客户端事实', async () => {
    const cycle = candidate();
    const evidence = reviewEvidenceFixture();
    evidence.reference = {
      reviewObjectType: 'CLOSE_SLICE',
      reviewObjectId: 'CLOSE_SLICE:slice-1',
      tradeId: 'trade-1',
      closeSliceId: 'slice-1',
    };
    const slice = journalReviewCandidate({ evidence, fxMissing: false, projectionStale: false });
    const readContext = vi.fn().mockResolvedValue({
      version: { ledgerRevision: '12', projectionGeneration: '7' },
      candidates: [cycle, slice],
    });
    const service = new JournalReviewAnalysis({ readContext } as unknown as JournalReviewQuery);
    const request = {
      accountId: cycle.input.trade.accountId,
      mode: 'actual',
      start: '2026-01-02T09:00:00Z',
      end: '2026-01-04T09:00:00Z',
    };
    const result = await service.period(request);
    expect(readContext).toHaveBeenCalledWith(request);
    expect(result.result.tradeCycles.includedObjectIds).toEqual(['TRADE_CYCLE:trade-1']);
    expect(result.result.closeSlices.includedObjectIds).toEqual(['CLOSE_SLICE:slice-1']);
    await expect(service.period({ ...request, trades: [{ pnl: 999 }] })).rejects.toThrow();
    expect(readContext).toHaveBeenCalledTimes(1);
  });
});
