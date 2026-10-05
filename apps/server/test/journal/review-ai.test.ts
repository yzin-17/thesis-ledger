import { describe, expect, it, vi } from 'vitest';
import { JournalReviewAi } from '../../src/journal/journal-review-ai.js';
import { JournalReviewAnalysis } from '../../src/journal/journal-review-analysis.js';
import { journalReviewCandidate } from '../../src/journal/journal-review-candidate.js';
import type { AiFrozenResearch } from '../../src/ai/ai-frozen-research.js';
import { reviewEvidenceFixture } from './review-evidence.fixture.js';
import type { JournalAnalysisDraft } from '@thesis-ledger/schemas';

const id = '00000000-0000-4000-8000-000000000080';
function setup() {
  const evidence = reviewEvidenceFixture();
  const candidate = journalReviewCandidate({ evidence, fxMissing: false, projectionStale: false });
  const request = {
    accountId: evidence.trade.accountId,
    mode: 'actual' as const,
    reference: candidate.input.reference,
    evidenceFingerprint: candidate.input.projection.evidenceFingerprint,
    analysisDraft: { stopLoss: '8' } as JournalAnalysisDraft,
  };
  let frozen: AiFrozenResearch | null = null;
  const startResearch = vi.fn((_input: unknown, source: AiFrozenResearch) => {
    frozen = structuredClone(source);
    return Promise.resolve({ id });
  });
  const runs = {
    startResearch,
    frozenEvidence: vi.fn(() => Promise.resolve(frozen)),
    resume: vi.fn(() =>
      Promise.resolve({
        id,
        provider: 'selected-provider',
        model: 'selected-model',
        promptVersion: 'journal-review-v2',
        status: 'queued',
        context: { scope: 'account', accountId: evidence.trade.accountId },
        result: null,
        errorCode: null,
        errorSummary: null,
        createdAt: new Date('2026-10-04T09:00:00Z'),
      }),
    ),
  };
  const executor = { dispatch: vi.fn() };
  const analysis = new JournalReviewAnalysis({
    get: vi.fn().mockResolvedValue(candidate),
  } as never);
  return {
    service: new JournalReviewAi(analysis, runs as never, executor as never),
    candidate,
    evidence,
    request,
    runs,
    executor,
  };
}
describe('正式复盘 AI 的冻结来源', () => {
  it('旧冻结提示继续读取，不按新提示覆盖旧运行', async () => {
    const { service, request, runs } = setup();
    const current = await service.start(request);
    const legacy = structuredClone(runs.startResearch.mock.calls[0]![1]);
    legacy.prompt.version = 'journal-review-v1';
    runs.frozenEvidence.mockResolvedValueOnce(legacy);
    runs.resume.mockResolvedValueOnce({ ...current, context: { scope: 'account', accountId: request.accountId },
      createdAt: new Date(current.createdAt), promptVersion: 'journal-review-v1', result: null,
      errorCode: null, errorSummary: null });
    expect(await service.get(id, { accountId: request.accountId })).toMatchObject({ promptVersion: 'journal-review-v1' });
    expect(runs.startResearch).toHaveBeenCalledTimes(1);
  });
  it('显式提交权威结果与同对象来源，独立调度且元数据可追溯', async () => {
    const { service, request, runs, executor, candidate } = setup();
    const before = structuredClone(candidate);
    const result = await service.start(request);
    expect(result).toMatchObject({
      id,
      provider: 'selected-provider',
      model: 'selected-model',
      promptVersion: 'journal-review-v2',
      status: 'queued',
    });
    expect(runs.startResearch).toHaveBeenCalledWith(
      expect.objectContaining({ context: { scope: 'account', accountId: request.accountId } }),
      expect.objectContaining({
        source: expect.objectContaining({
          permission: 'journal:read',
          evidence: expect.objectContaining({
            data: expect.objectContaining({
              evidenceFingerprint: request.evidenceFingerprint,
              analysisDraft: request.analysisDraft,
              result: expect.objectContaining({
                metrics: expect.objectContaining({
                  netRealizedPnl: expect.objectContaining({ value: '4' }),
                }),
              }),
            }),
          }),
        }),
      }),
    );
    expect(executor.dispatch).toHaveBeenCalledWith(id);
    expect(candidate).toEqual(before);
  });
  it('读取拒绝跨账户和模式，不把其他研究任务当作复盘解读', async () => {
    const { service, request, runs } = setup();
    await service.start(request);
    for (const scope of [
      { accountId: request.accountId, mode: 'shadow' },
      { accountId: '00000000-0000-4000-8000-000000000090', mode: 'actual' },
    ])
      await expect(service.get(id, scope)).rejects.toMatchObject({
        response: { errorCode: 'JOURNAL_AI_NOT_FOUND' },
      });
    runs.frozenEvidence.mockResolvedValueOnce(null);
    await expect(service.get(id, { accountId: request.accountId })).rejects.toMatchObject({
      response: { errorCode: 'JOURNAL_AI_NOT_FOUND' },
    });
  });
  it('快照只关联相同对象、来源与草稿，键顺序变化不造成假冲突', async () => {
    const { service, request, candidate } = setup();
    request.analysisDraft = { note: '本次说明', stopLoss: '8' };
    await service.start(request);
    const input = { ...candidate.input, analysisDraft: { stopLoss: '8', note: '本次说明' } };
    expect(await service.snapshotMetadata(id, input, 'journal-decimal-1')).toMatchObject({
      id,
      promptVersion: 'journal-review-v2',
    });
    await expect(
      service.snapshotMetadata(
        id,
        { ...input, analysisDraft: { stopLoss: '9' } },
        'journal-decimal-1',
      ),
    ).rejects.toMatchObject({ response: { errorCode: 'JOURNAL_AI_CONTEXT_CHANGED' } });
    await expect(
      service.snapshotMetadata(
        id,
        { ...input, projection: { ...input.projection, evidenceFingerprint: 'changed' } },
        'journal-decimal-1',
      ),
    ).rejects.toMatchObject({ response: { errorCode: 'JOURNAL_AI_CONTEXT_CHANGED' } });
    await expect(service.snapshotMetadata(id, input, 'future-version')).rejects.toMatchObject({
      response: { errorCode: 'JOURNAL_AI_CONTEXT_CHANGED' },
    });
  });
  it('缺少默认模型时明确拒绝，没有调度或改写确定性输入', async () => {
    const { service, request, candidate, runs, executor } = setup();
    const before = structuredClone(candidate);
    runs.startResearch.mockRejectedValueOnce(new Error('请先选择研究默认模型'));
    await expect(service.start(request)).rejects.toThrow('请先选择研究默认模型');
    expect(executor.dispatch).not.toHaveBeenCalled();
    expect(candidate).toEqual(before);
  });
  it('减仓解读的冻结事实不包含无关未来入场或其他减仓正文', async () => {
    const { service, request, candidate, runs } = setup();
    candidate.input.reference = {
      reviewObjectType: 'CLOSE_SLICE',
      reviewObjectId: 'CLOSE_SLICE:slice-1',
      tradeId: 'trade-1',
      closeSliceId: 'slice-1',
    };
    candidate.effectiveClosedAt = null;
    candidate.executedAt = candidate.input.trade.closeSlices[0]!.occurredAt;
    candidate.input.trade.entryLegs.push({
      ...candidate.input.trade.entryLegs[0]!,
      factId: '00000000-0000-4000-8000-000000000095',
      id: 'future-buy',
      price: '999',
    });
    request.reference = candidate.input.reference;
    await service.start(request);
    const payload = JSON.stringify(runs.startResearch.mock.calls[0]![1].source.evidence.data);
    expect(payload).not.toContain('999');
    expect(payload).not.toContain('future-buy');
    expect(payload).toContain('slice-1');
  });
});
