import { describe, expect, it, vi } from 'vitest';
import {
  journalPeriodAiFrozenEvidenceSchema,
  type IdentityPrincipal,
} from '@thesis-ledger/schemas';
import { journalResearchNumericFields } from '../../src/journal/journal-research-numeric-fields.js';
import { localIdentityPrincipal } from '../../src/identity/local-workspace.js';
import { JournalPeriodReviewAi } from '../../src/journal/journal-period-review-ai.js';
import { JournalReviewAnalysis } from '../../src/journal/journal-review-analysis.js';
import { journalReviewCandidate } from '../../src/journal/journal-review-candidate.js';
import { reviewEvidenceFixture } from './review-evidence.fixture.js';

const id = '00000000-0000-4000-8000-000000000080';
const principal = localIdentityPrincipal() as IdentityPrincipal;

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
  let frozen: unknown = null;
  const v2 = {
    start: vi.fn(async (_principal: IdentityPrincipal, input: { data: unknown }) => {
      frozen = structuredClone(input.data);
      return id;
    }),
    read: vi.fn(
      async (
        _principal: IdentityPrincipal,
        _id: string,
        requested: { accountId: string; mode: string },
      ) => {
        if (requested.accountId !== request.accountId || requested.mode !== request.mode)
          return null;
        return {
          row: {
            id,
            provider: 'selected-provider',
            model: 'selected-model',
            promptVersion: 'journal-period-review-prompt-v1',
            status: 'queued',
            errorCode: null,
            errorSummary: null,
            createdAt: new Date('2026-11-13T09:00:00Z'),
          },
          object: null,
          period: frozen,
          result: null,
        };
      },
    ),
  };
  const runs = { startResearch: vi.fn(), resume: vi.fn().mockResolvedValue(null) };
  return {
    service: new JournalPeriodReviewAi(analysis, v2 as never),
    request,
    cycle,
    runs,
    v2,
  };
}
describe('周期 AI 冻结结果迁移 V2', () => {
  it('冻结两种独立粒度、窗口与来源后提交 V2，未调用 V1', async () => {
    const { service, request, runs, v2, cycle } = await setup();
    const before = structuredClone(cycle);
    expect(await service.start(request, principal)).toMatchObject({
      id,
      start: request.start,
      end: request.end,
      objectFingerprints: request.objectFingerprints,
      promptVersion: 'journal-period-review-prompt-v1',
    });
    expect(v2.start).toHaveBeenCalledWith(
      principal,
      expect.objectContaining({
        scope: { accountId: request.accountId, mode: request.mode },
        prompt: expect.objectContaining({ version: 'journal-period-review-prompt-v1' }),
        data: expect.objectContaining({
          result: expect.objectContaining({
            tradeCycles: expect.objectContaining({ includedObjectIds: ['TRADE_CYCLE:trade-1'] }),
            closeSlices: expect.objectContaining({ includedObjectIds: ['CLOSE_SLICE:slice-1'] }),
          }),
        }),
      }),
    );
    const frozen = journalPeriodAiFrozenEvidenceSchema.parse(v2.start.mock.calls[0]![1].data);
    const numericFields = journalResearchNumericFields(frozen);
    expect(numericFields.map((field) => field.fieldPath)).toContain(
      '/result/tradeCycles/metrics/sampleCount/value',
    );
    expect(numericFields.map((field) => field.fieldPath)).toContain(
      '/result/closeSlices/metrics/sampleCount/value',
    );
    expect(numericFields.some((field) => field.unit === 'count' && field.currency === null)).toBe(
      true,
    );
    expect(runs.startResearch).not.toHaveBeenCalled();
    expect(cycle).toEqual(before);
  });
  it('输入指纹、对象集合、Ledger 或世代改变拒绝，未提交任何研究', async () => {
    const { service, request, v2 } = await setup();
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
      await expect(service.start(changed, principal)).rejects.toMatchObject({
        response: { errorCode: 'JOURNAL_EVIDENCE_CHANGED' },
      });
    expect(v2.start).not.toHaveBeenCalled();
  });
  it('算法变化和客户端伪造事实被拒绝；模型不可用不影响确定性事实', async () => {
    const { service, request, v2, cycle } = await setup();
    await expect(
      service.start({ ...request, expectedAlgorithmVersion: 'future' }, principal),
    ).rejects.toMatchObject({ response: { errorCode: 'JOURNAL_ALGORITHM_CHANGED' } });
    await expect(service.start({ ...request, facts: [{ pnl: 999 }] }, principal)).rejects.toThrow();
    const before = structuredClone(cycle);
    v2.start.mockRejectedValueOnce(new Error('研究默认模型尚无可执行的 V2 合同路由'));
    await expect(service.start(request, principal)).rejects.toThrow('V2 合同路由');
    expect(cycle).toEqual(before);
  });
  it('拒绝其他账户、模式及单笔解读类型', async () => {
    const { service, request, v2 } = await setup();
    await service.start(request, principal);
    await expect(
      service.get(id, { accountId: request.accountId, mode: 'shadow' }, principal),
    ).rejects.toMatchObject({ response: { errorCode: 'JOURNAL_AI_NOT_FOUND' } });
    await expect(
      service.get(
        id,
        {
          accountId: '00000000-0000-4000-8000-000000000090',
          mode: 'actual',
        },
        principal,
      ),
    ).rejects.toMatchObject({ response: { errorCode: 'JOURNAL_AI_NOT_FOUND' } });
    v2.read.mockResolvedValueOnce(null as never);
    await expect(
      service.get(id, { accountId: request.accountId }, principal),
    ).rejects.toMatchObject({ response: { errorCode: 'JOURNAL_AI_NOT_FOUND' } });
  });
});
