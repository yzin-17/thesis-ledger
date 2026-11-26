import { describe, expect, it, vi } from 'vitest';
import { journalAiFrozenEvidenceSchema } from '@thesis-ledger/schemas';
import { localIdentityPrincipal } from '../../src/identity/local-workspace.js';
import { JournalAiResearchV2 } from '../../src/journal/journal-ai-research-v2.js';
import { journalAnalyzeCandidate } from '../../src/journal/journal-review-analysis.js';
import { journalReviewCandidate } from '../../src/journal/journal-review-candidate.js';
import { reviewEvidenceFixture } from './review-evidence.fixture.js';
import { verifyAiFrozenResearchV2 } from '../../src/ai/ai-research-frozen-integrity-v2.js';
import { verifyResearchNumericEvidenceV2 } from '../../src/ai/ai-research-numeric-evidence-v2.js';
import { buildFrozenResearchMessagesV2 } from '../../src/ai/ai-research-messages-v2.js';

const runId = '00000000-0000-4000-8000-000000000080';
const principal = localIdentityPrincipal()!;
function setup() {
  const candidate = journalReviewCandidate({
    evidence: reviewEvidenceFixture(),
    fxMissing: false,
    projectionStale: false,
  });
  const data = journalAiFrozenEvidenceSchema.parse({
    version: 'journal-review-ai-v1',
    accountId: candidate.input.trade.accountId,
    mode: 'actual',
    reviewObjectId: candidate.input.reference.reviewObjectId,
    evidenceFingerprint: candidate.input.projection.evidenceFingerprint,
    analysisDraft: candidate.input.analysisDraft,
    facts: {},
    result: journalAnalyzeCandidate(candidate),
  });
  let frozen: unknown = null;
  const runs = {
    researchV2Default: vi.fn(async () => ({ provider: 'fixture', model: 'fixture-model' })),
    startResearchV2: vi.fn(async (_owner: string, source: unknown) => {
      frozen = structuredClone(source);
      return { run: { id: runId }, reused: false };
    }),
  };
  const executor = { dispatch: vi.fn() };
  const routing = { read: vi.fn(async () => ({ revision: '11' })) };
  const reports = {
    journalDetail: vi.fn(async () => ({
      row: {
        id: runId,
        provider: 'fixture',
        model: 'fixture-model',
        promptVersion: 'journal-review-v5',
        status: 'queued',
        createdAt: new Date(),
      },
      frozen,
      detail: { availability: 'pending', result: null },
    })),
  };
  const service = new JournalAiResearchV2(
    runs as never,
    executor as never,
    routing as never,
    reports as never,
  );
  return { service, data, runs, executor, routing, reports, getFrozen: () => frozen };
}

describe('Journal 真实 V2 冻结提交与读取', () => {
  it('将只读复盘事实冻结为 V2，并以真实身份和研究用途合同创建任务', async () => {
    const { service, data, runs, executor, getFrozen } = setup();
    const created = await service.start(principal, {
      scope: { accountId: data.accountId, mode: data.mode },
      question: '请给出中文复盘',
      prompt: { version: 'journal-review-v5', template: '只读事实' },
      data,
    });
    expect(created).toBe(runId);
    const frozen = verifyAiFrozenResearchV2(getFrozen());
    expect(frozen).toMatchObject({
      version: 'research-frozen-input-v1',
      researchSettingsRevision: '11',
      request: {
        version: 'research-report-submission-v1',
        mode: 'actual',
        scope: { scope: 'account', accountId: data.accountId },
      },
      scopeSnapshot: { mode: 'actual', accountId: data.accountId },
      evidence: [
        {
          audit: {
            kind: 'journal',
            providerId: 'thesis-ledger',
            contractVersion: 'journal-review-ai-v1',
          },
          usable: true,
          required: true,
          data: { evidenceFingerprint: data.evidenceFingerprint },
        },
      ],
    });
    const numeric = frozen.evidence[0]!.numericFields.find(
      (field) => field.fieldPath === '/result/metrics/netRealizedPnl/value',
    );
    expect(numeric).toMatchObject({ unit: 'amount', currency: 'USD' });
    const metric = data.result.metrics.netRealizedPnl;
    if (!numeric || metric?.status !== 'AVAILABLE') throw new Error('测试样本缺少已确认净收益');
    const numericClaim = {
      id: 'verified-pnl',
      description: '核对后的实际盈亏',
      kind: 'field' as const,
      source: {
        evidenceId: frozen.evidence[0]!.audit.evidenceId,
        ...numeric,
        value: Number(metric.value),
      },
    };
    const inference = {
      version: 'research-report-generation-v1' as const,
      conclusion: '仅根据冻结事实说明收益',
      rationale: [],
      claims: [],
      numericClaims: [numericClaim],
      invalidationConditions: [],
      nextSteps: [],
      risks: [],
      unknowns: [],
      disclaimer: '不构成交易建议',
      confidence: { level: 'unassessed' as const, basis: ['冻结数据'] },
    };
    expect(() => verifyResearchNumericEvidenceV2(frozen, inference)).not.toThrow();
    expect(() =>
      verifyResearchNumericEvidenceV2(frozen, {
        ...inference,
        numericClaims: [
          {
            ...numericClaim,
            source: { ...numericClaim.source, fieldPath: '/result/metrics/phantom/value' },
          },
        ],
      }),
    ).toThrow('数值引用缺少本次可用字段');
    expect(frozen.scopeSnapshot.scope).toBe('account');
    expect(buildFrozenResearchMessagesV2(frozen)[2]!.content).toContain(
      '若 instruments=[]，不得生成 kind=price-direction',
    );
    expect(runs.startResearchV2).toHaveBeenCalledWith(
      principal.id,
      frozen,
      expect.objectContaining({
        assertSubmission: expect.any(Function),
        assertSnapshot: expect.any(Function),
      }),
    );
    expect(executor.dispatch).toHaveBeenCalledExactlyOnceWith(runId);
    expect(
      (await service.read(principal, runId, { accountId: data.accountId, mode: data.mode }))
        ?.object,
    ).toMatchObject({ evidenceFingerprint: data.evidenceFingerprint });
  });

  it('不接受跨账户、模式和伪造的 journal 证据', async () => {
    const { service, data, runs, getFrozen } = setup();
    await expect(
      service.start(principal, {
        scope: { accountId: data.accountId, mode: 'shadow' },
        question: '错误模式',
        prompt: { version: 'v3', template: '只读' },
        data,
      }),
    ).rejects.toThrow('复盘解读不存在');
    expect(runs.startResearchV2).not.toHaveBeenCalled();
    await service.start(principal, {
      scope: { accountId: data.accountId, mode: data.mode },
      question: '正确范围',
      prompt: { version: 'v3', template: '只读' },
      data,
    });
    const frozen = verifyAiFrozenResearchV2(structuredClone(getFrozen()));
    if (frozen.scopeSnapshot.scope !== 'account') throw new Error('受控样本缺少账户范围');
    frozen.scopeSnapshot.accountId = '00000000-0000-4000-8000-000000000090';
    expect(() => verifyAiFrozenResearchV2(frozen)).toThrow();
    const tampered = verifyAiFrozenResearchV2(structuredClone(getFrozen()));
    const entry = tampered.evidence[0]!.data;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry))
      throw new Error('受控样本缺少复盘对象');
    const result = entry.result;
    if (!result || typeof result !== 'object' || Array.isArray(result))
      throw new Error('受控样本缺少确定性结果');
    result.reviewObjectId = 'TRADE_CYCLE:invalid';
    expect(() => verifyAiFrozenResearchV2(tampered)).toThrow();
  });

  it('无效报告、跨账户与非 Journal 报告不会被误认为已完成解读', async () => {
    const { service, data, reports } = setup();
    await service.start(principal, {
      scope: { accountId: data.accountId, mode: data.mode },
      question: '复盘',
      prompt: { version: 'journal-review-v5', template: '只读' },
      data,
    });
    reports.journalDetail.mockImplementationOnce(async () => {
      throw new Error('not found');
    });
    await expect(
      service.read(principal, runId, { accountId: data.accountId, mode: 'shadow' }),
    ).rejects.toThrow('not found');
    reports.journalDetail.mockImplementationOnce(
      async () =>
        ({
          row: { id: runId, promptVersion: 'journal-review-v5' },
          frozen: { prompt: { version: 'journal-review-v5' }, evidence: [] },
          detail: { result: null, availability: 'pending' },
        }) as never,
    );
    await expect(
      service.read(principal, runId, { accountId: data.accountId, mode: data.mode }),
    ).rejects.toThrow('复盘解读不存在');
  });
});
