import { describe, expect, it, vi } from 'vitest';
import { ThesisLedgerApiClient, ThesisLedgerContractError } from '../src/index.js';
import {
  journalReviewCandidateContractSchema,
  journalDeterministicReviewSchema,
} from '@thesis-ledger/schemas';
import { journalEvidenceFixture } from '../../schemas/test/fixtures/journal-review.fixture.js';

const candidate = () => {
  const input = journalEvidenceFixture();
  return journalReviewCandidateContractSchema.parse({
    input,
    openedAt: input.trade.openedAt,
    effectiveClosedAt: input.trade.closedAt,
    executedAt: null,
    reviewStatus: 'CURRENT',
    missingEvidence: [],
    statisticsEligibility: { eligible: true, reasons: [] },
  });
};
const setup = (response: unknown) => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(response)));
  return {
    api: new ThesisLedgerApiClient('https://fixture.test/api/v1', fetcher).journalReviews,
    fetcher,
  };
};
describe('正式复盘传输范围', () => {
  it('保留 decimal 数量并传递取消信号，拒绝跨账户或模式响应', async () => {
    const row = candidate();
    row.input.trade.sourceQuantity = '9007199254740993.000000000000000001';
    const request = {
      accountId: row.input.trade.accountId,
      mode: 'actual' as const,
      reviewObjectId: row.input.reference.reviewObjectId,
    };
    const { api, fetcher } = setup(row);
    const abort = new AbortController();
    expect((await api.object(request, abort.signal)).input.trade.sourceQuantity).toBe(
      row.input.trade.sourceQuantity,
    );
    expect(fetcher.mock.calls[0]![1]?.signal).toBe(abort.signal);
    for (const changed of [
      { ...request, mode: 'shadow' as const },
      { ...request, accountId: '00000000-0000-4000-8000-000000000090' },
      { ...request, reviewObjectId: 'TRADE_CYCLE:another' },
    ])
      await expect(setup(row).api.object(changed)).rejects.toBeInstanceOf(
        ThesisLedgerContractError,
      );
  });
  it('正式候选拒绝旧 number 合同，列表世代必须与所有对象一致', async () => {
    const row = candidate();
    const query = { accountId: row.input.trade.accountId, mode: 'actual' as const };
    const response = {
      items: [row],
      total: 1,
      nextCursor: null,
      legacyItems: [],
      ledgerRevision: '12',
      projectionGeneration: '7',
      instrumentDirectory: { generation: 0, items: [], unresolvedSymbols: [] },
    };
    await expect(setup(response).api.candidates(query)).resolves.toMatchObject({ total: 1 });
    for (const changed of [
      { ...response, projectionGeneration: '8' },
      { ...response, items: [{ pnl: 4, quantity: 2 }] },
    ])
      await expect(setup(changed).api.candidates(query)).rejects.toBeInstanceOf(
        ThesisLedgerContractError,
      );
  });
  it('旧深链按原始引用传输，错误父周期响应被拒绝', async () => {
    const row = candidate();
    const query = {
      accountId: row.input.trade.accountId,
      mode: 'actual' as const,
      reviewObjectType: 'TRADE_CYCLE' as const,
      tradeId: 'trade-1',
    };
    expect((await setup(row).api.resolveReference(query)).input.reference.reviewObjectId).toBe(
      'TRADE_CYCLE:trade-1',
    );
    await expect(
      setup(row).api.resolveReference({ ...query, tradeId: 'other' }),
    ).rejects.toBeInstanceOf(ThesisLedgerContractError);
  });
  it('正式分析请求不能自造事实，草稿不能覆盖收益或数量', () => {
    const row = candidate();
    const { api, fetcher } = setup({});
    const request = {
      accountId: row.input.trade.accountId,
      mode: 'actual' as const,
      reference: row.input.reference,
      evidenceFingerprint: row.input.projection.evidenceFingerprint,
    };
    expect(() =>
      api.analyze({ ...request, analysisDraft: { sourceQuantity: '999' } } as never),
    ).toThrow();
    expect(() => api.analyze({ ...request, inputSnapshot: row.input } as never)).toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('分析与保存拒绝另一算法或草稿的晚到响应', async () => {
    const row = candidate();
    row.input.analysisDraft = { stopLoss: '8' };
    const result = journalDeterministicReviewSchema.parse({
      reviewObjectId: row.input.reference.reviewObjectId,
      algorithmVersion: 'expected',
      statisticsEligibility: row.statisticsEligibility,
      metrics: {},
      behaviorNotes: [],
      rounding: { mode: 'HALF_UP', amountFractionDigits: 8, ratioFractionDigits: 8 },
    });
    const request = {
      accountId: row.input.trade.accountId,
      mode: 'actual' as const,
      reference: row.input.reference,
      evidenceFingerprint: row.input.projection.evidenceFingerprint,
      analysisDraft: { stopLoss: '8' },
      expectedAlgorithmVersion: 'expected',
    };
    await expect(setup({ candidate: row, result }).api.analyze(request)).resolves.toMatchObject({
      result: { algorithmVersion: 'expected' },
    });
    await expect(
      setup({ candidate: row, result }).api.analyze({
        ...request,
        expectedAlgorithmVersion: 'future',
      }),
    ).rejects.toBeInstanceOf(ThesisLedgerContractError);
    await expect(
      setup({ candidate: row, result }).api.analyze({
        ...request,
        analysisDraft: { stopLoss: '9' },
      }),
    ).rejects.toBeInstanceOf(ThesisLedgerContractError);
    const snapshot = {
      compatibility: 'CURRENT_CONTRACT',
      accountId: request.accountId,
      mode: 'actual',
      snapshot: {
        id: '00000000-0000-4000-8000-000000000080',
        inputSnapshot: row.input,
        outputSnapshot: result,
        status: 'CURRENT',
        createdAt: '2026-10-04T09:00:00Z',
      },
    };
    await expect(setup(snapshot).api.save(request)).resolves.toMatchObject({
      compatibility: 'CURRENT_CONTRACT',
    });
    await expect(
      setup(snapshot).api.save({ ...request, expectedAlgorithmVersion: 'future' }),
    ).rejects.toBeInstanceOf(ThesisLedgerContractError);
    await expect(
      setup(snapshot).api.save({ ...request, aiRunId: '00000000-0000-4000-8000-000000000080' }),
    ).rejects.toBeInstanceOf(ThesisLedgerContractError);
  });
  it('周期解读响应绑定窗口、版本与完整对象指纹集合', async () => {
    const row = candidate();
    const request = {
      accountId: row.input.trade.accountId,
      mode: 'actual' as const,
      start: '2026-01-01T00:00:00Z',
      end: '2026-01-04T00:00:00Z',
      expectedLedgerRevision: '12',
      expectedProjectionGeneration: '7',
      expectedAlgorithmVersion: 'period-1',
      objectFingerprints: {
        [row.input.reference.reviewObjectId]: row.input.projection.evidenceFingerprint,
      },
    };
    const response = {
      id: '00000000-0000-4000-8000-000000000080',
      accountId: request.accountId,
      mode: 'actual',
      symbol: null,
      start: request.start,
      end: request.end,
      ledgerRevision: '12',
      projectionGeneration: '7',
      objectFingerprints: request.objectFingerprints,
      provider: 'fixture',
      model: 'fixture-model',
      promptVersion: 'period-v1',
      algorithmVersion: 'period-1',
      status: 'queued',
      errorCode: null,
      errorSummary: null,
      result: null,
      createdAt: '2026-10-04T09:00:00Z',
    };
    await expect(setup(response).api.explainPeriod(request)).resolves.toMatchObject({
      id: response.id,
    });
    for (const wrong of [
      { ...response, end: '2026-01-05T00:00:00Z' },
      { ...response, ledgerRevision: '13' },
      { ...response, objectFingerprints: {} },
      { ...response, algorithmVersion: 'other' },
      { ...response, mode: 'shadow' },
    ])
      await expect(setup(wrong).api.explainPeriod(request)).rejects.toBeInstanceOf(
        ThesisLedgerContractError,
      );
  });
});
