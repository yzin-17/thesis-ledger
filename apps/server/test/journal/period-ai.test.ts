import { describe, expect, it, vi } from 'vitest';
import { JournalPeriodReviewAi } from '../../src/journal/journal-period-review-ai.js';
import { JournalReviewAnalysis } from '../../src/journal/journal-review-analysis.js';
import { journalReviewCandidate } from '../../src/journal/journal-review-candidate.js';
import type { AiFrozenResearch } from '../../src/ai/ai-frozen-research.js';
import { reviewEvidenceFixture } from './review-evidence.fixture.js';

const id = '00000000-0000-4000-8000-000000000080';
async function setup() {
  const evidence = reviewEvidenceFixture();
  const cycle = journalReviewCandidate({ evidence, fxMissing: false, projectionStale: false });
  const sliceEvidence = structuredClone(evidence);
  sliceEvidence.reference = {
    reviewObjectType: 'CLOSE_SLICE',
    reviewObjectId: 'CLOSE_SLICE:slice-1',
    tradeId: 'trade-1',
    closeSliceId: 'slice-1',
  };
  const slice = journalReviewCandidate({
    evidence: sliceEvidence,
    fxMissing: false,
    projectionStale: false,
  });
  const readContext = vi.fn().mockResolvedValue({
    version: { ledgerRevision: '12', projectionGeneration: '7' },
    candidates: [cycle, slice],
  });
  const analysis = new JournalReviewAnalysis({ readContext } as never);
  const scope = {
    accountId: evidence.trade.accountId,
    mode: 'actual' as const,
    start: '2026-01-02T09:00:00Z',
    end: '2026-01-04T09:00:00Z',
  };
  const result = await analysis.period(scope);
  const request = {
    ...scope,
    expectedLedgerRevision: '12',
    expectedProjectionGeneration: '7',
    expectedAlgorithmVersion: result.result.algorithmVersion,
    objectFingerprints: Object.fromEntries(
      result.candidates.map((row) => [
        row.input.reference.reviewObjectId,
        row.input.projection.evidenceFingerprint,
      ]),
    ),
  };
  let frozen: AiFrozenResearch | null = null;
  const startResearch = vi.fn((_input: unknown, source: AiFrozenResearch) => {
    frozen = structuredClone(source);
    return Promise.resolve({ id });
  });
  const runs = {
    startResearch,
    frozenEvidence: vi.fn(() => Promise.resolve(frozen)),
    resume: vi.fn().mockResolvedValue({
      id,
      provider: 'fixture',
      model: 'fixture-model',
      promptVersion: 'journal-period-review-v2',
      status: 'queued',
      context: { scope: 'account', accountId: evidence.trade.accountId },
      result: null,
      errorCode: null,
      errorSummary: null,
      createdAt: new Date('2026-10-04T09:00:00Z'),
    }),
  };
  const executor = { dispatch: vi.fn() };
  return {
    service: new JournalPeriodReviewAi(analysis, runs as never, executor as never),
    request,
    cycle,
    runs,
    executor,
  };
}
describe('周期 AI 的冻结统计范围', () => {
  it('冻结两种独立粒度、窗口及全部来源，任务元数据可追溯', async () => {
    const { service, request, runs, executor, cycle } = await setup();
    const before = structuredClone(cycle);
    expect(await service.start(request)).toMatchObject({
      id,
      start: request.start,
      end: request.end,
      objectFingerprints: request.objectFingerprints,
    });
    const frozen = runs.startResearch.mock.calls[0]![1];
    expect(frozen.source.tool).toBe('getJournalPeriodReview');
    expect(frozen.source.evidence.data).toMatchObject({
      result: {
        tradeCycles: { includedObjectIds: ['TRADE_CYCLE:trade-1'] },
        closeSlices: { includedObjectIds: ['CLOSE_SLICE:slice-1'] },
      },
    });
    expect(executor.dispatch).toHaveBeenCalledExactlyOnceWith(id);
    expect(cycle).toEqual(before);
  });
  it('计划指纹、对象集合、Ledger 或世代改变后拒绝旧结果，不提交任务', async () => {
    const { service, request, runs, executor } = await setup();
    for (const changed of [
      { ...request, expectedLedgerRevision: '13' },
      { ...request, expectedProjectionGeneration: '8' },
      { ...request, objectFingerprints: {} },
      {
        ...request,
        objectFingerprints: {
          ...request.objectFingerprints,
          'TRADE_CYCLE:trade-1': 'changed-plan',
        },
      },
    ])
      await expect(service.start(changed)).rejects.toMatchObject({
        response: { errorCode: 'JOURNAL_EVIDENCE_CHANGED' },
      });
    expect(runs.startResearch).not.toHaveBeenCalled();
    expect(executor.dispatch).not.toHaveBeenCalled();
  });
  it('算法变化和客户端自造事实被拒绝，未设置模型只影响解读', async () => {
    const { service, request, runs, executor, cycle } = await setup();
    await expect(
      service.start({ ...request, expectedAlgorithmVersion: 'future' }),
    ).rejects.toMatchObject({ response: { errorCode: 'JOURNAL_ALGORITHM_CHANGED' } });
    await expect(service.start({ ...request, facts: [{ pnl: 999 }] })).rejects.toThrow();
    const before = structuredClone(cycle);
    runs.startResearch.mockRejectedValueOnce(new Error('请先选择研究默认模型'));
    await expect(service.start(request)).rejects.toThrow('请先选择研究默认模型');
    expect(executor.dispatch).not.toHaveBeenCalled();
    expect(cycle).toEqual(before);
  });
  it('拒绝其他账户、模式及单笔解读类型', async () => {
    const { service, request, runs } = await setup();
    await service.start(request);
    await expect(
      service.get(id, { accountId: request.accountId, mode: 'shadow' }),
    ).rejects.toMatchObject({ response: { errorCode: 'JOURNAL_AI_NOT_FOUND' } });
    await expect(
      service.get(id, { accountId: '00000000-0000-4000-8000-000000000090' }),
    ).rejects.toMatchObject({ response: { errorCode: 'JOURNAL_AI_NOT_FOUND' } });
    runs.frozenEvidence.mockResolvedValueOnce(null);
    await expect(service.get(id, { accountId: request.accountId })).rejects.toMatchObject({
      response: { errorCode: 'JOURNAL_AI_NOT_FOUND' },
    });
  });
});
