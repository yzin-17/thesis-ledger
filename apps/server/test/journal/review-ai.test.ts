import { describe, expect, it, vi } from 'vitest';
import type {
  journalAiFrozenEvidenceSchema,
  IdentityPrincipal,
  JournalAnalysisDraft,
} from '@thesis-ledger/schemas';
import { localIdentityPrincipal } from '../../src/identity/local-workspace.js';
import { JournalReviewAi } from '../../src/journal/journal-review-ai.js';
import { JournalReviewAnalysis } from '../../src/journal/journal-review-analysis.js';
import { journalReviewCandidate } from '../../src/journal/journal-review-candidate.js';
import { reviewEvidenceFixture } from './review-evidence.fixture.js';

const id = '00000000-0000-4000-8000-000000000080';
const principal = localIdentityPrincipal() as IdentityPrincipal;

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
  let frozen: ReturnType<typeof journalAiFrozenEvidenceSchema.parse> | null = null;
  const v2 = {
    start: vi.fn(
      async (
        _owner: IdentityPrincipal,
        input: {
          data: ReturnType<typeof journalAiFrozenEvidenceSchema.parse>;
          prompt: { version: string };
        },
      ) => {
        frozen = structuredClone(input.data);
        return id;
      },
    ),
    read: vi.fn(
      async (
        _owner: IdentityPrincipal,
        _id: string,
        scope: { accountId: string; mode: string },
      ) => {
        if (!frozen || scope.accountId !== frozen.accountId || scope.mode !== frozen.mode)
          return null;
        return {
          row: {
            id,
            provider: 'selected-provider',
            model: 'selected-model',
            promptVersion: 'journal-object-review-prompt-v1',
            status: 'queued',
            errorCode: null,
            errorSummary: null,
            createdAt: new Date('2026-11-13T09:00:00Z'),
          },
          object: frozen,
          period: null,
          result: null,
        };
      },
    ),
  };
  const runs = {
    resume: vi.fn().mockResolvedValue(null),
    frozenEvidence: vi.fn().mockResolvedValue(null),
    startResearch: vi.fn(),
  };
  const analysis = new JournalReviewAnalysis({
    get: vi.fn().mockResolvedValue(candidate),
  } as never);
  return {
    service: new JournalReviewAi(analysis, v2 as never),
    candidate,
    evidence,
    request,
    runs,
    v2,
  };
}

describe('正式复盘 AI 迁移 V2', () => {
  it('新解读只调用 V2，冻结同对象的确定性事实与草稿', async () => {
    const { service, request, runs, v2, candidate } = setup();
    const before = structuredClone(candidate);
    const result = await service.start(request, principal);
    expect(result).toMatchObject({
      id,
      provider: 'selected-provider',
      model: 'selected-model',
      promptVersion: 'journal-object-review-prompt-v1',
      status: 'queued',
    });
    expect(v2.start).toHaveBeenCalledWith(
      principal,
      expect.objectContaining({
        scope: { accountId: request.accountId, mode: request.mode },
        prompt: expect.objectContaining({ version: 'journal-object-review-prompt-v1' }),
        data: expect.objectContaining({
          evidenceFingerprint: request.evidenceFingerprint,
          analysisDraft: request.analysisDraft,
          result: expect.objectContaining({
            metrics: expect.objectContaining({ netRealizedPnl: expect.anything() }),
          }),
        }),
      }),
    );
    expect(runs.startResearch).not.toHaveBeenCalled();
    expect(candidate).toEqual(before);
  });

  it('跨账户、模式与无效冻结来源不能访问', async () => {
    const { service, request, v2 } = setup();
    await service.start(request, principal);
    for (const scope of [
      { accountId: request.accountId, mode: 'shadow' },
      { accountId: '00000000-0000-4000-8000-000000000090', mode: 'actual' },
    ]) {
      await expect(service.get(id, scope, principal)).rejects.toMatchObject({
        response: { errorCode: 'JOURNAL_AI_NOT_FOUND' },
      });
    }
    v2.read.mockResolvedValueOnce(null as never);
    await expect(
      service.get(id, { accountId: request.accountId, mode: request.mode }, principal),
    ).rejects.toMatchObject({
      response: { errorCode: 'JOURNAL_AI_NOT_FOUND' },
    });
  });

  it('快照仅关联相同对象、草稿指纹和复盘算法', async () => {
    const { service, request, candidate } = setup();
    request.analysisDraft = { note: '本次说明', stopLoss: '8' };
    await service.start(request, principal);
    const input = { ...candidate.input, analysisDraft: { stopLoss: '8', note: '本次说明' } };
    expect(await service.snapshotMetadata(id, input, 'journal-decimal-1', principal)).toMatchObject(
      { id, promptVersion: 'journal-object-review-prompt-v1' },
    );
    for (const wrong of [
      { ...input, analysisDraft: { stopLoss: '9' } },
      { ...input, projection: { ...input.projection, evidenceFingerprint: 'changed' } },
    ])
      await expect(
        service.snapshotMetadata(id, wrong, 'journal-decimal-1', principal),
      ).rejects.toMatchObject({ response: { errorCode: 'JOURNAL_AI_CONTEXT_CHANGED' } });
    await expect(
      service.snapshotMetadata(id, input, 'future-version', principal),
    ).rejects.toMatchObject({ response: { errorCode: 'JOURNAL_AI_CONTEXT_CHANGED' } });
  });

  it('默认模型不可用时不写入 V1，且不修改分析事实', async () => {
    const { service, request, candidate, v2, runs } = setup();
    const before = structuredClone(candidate);
    v2.start.mockRejectedValueOnce(new Error('研究默认模型尚无可执行的 V2 合同路由'));
    await expect(service.start(request, principal)).rejects.toThrow('V2 合同路由');
    expect(runs.startResearch).not.toHaveBeenCalled();
    expect(candidate).toEqual(before);
  });

  it('减仓解读冻结不混入无关未来入场或其他减仓事实', async () => {
    const { service, request, candidate, v2 } = setup();
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
    await service.start(request, principal);
    const payload = JSON.stringify(v2.start.mock.calls[0]![1].data);
    expect(payload).not.toContain('999');
    expect(payload).not.toContain('future-buy');
    expect(payload).toContain('slice-1');
  });
});
