import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { journalAnalyzePeriod } from '@thesis-ledger/domain';
import { journalStoredPeriodSnapshotSchema } from '@thesis-ledger/schemas';
import { JournalPeriodReviewSnapshots } from '../../src/journal/journal-period-review-snapshots.js';

const accountId = '00000000-0000-4000-8000-000000000001';
const aiRunId = '00000000-0000-4000-8000-000000000002';
const start = '2026-01-01T09:00:00.000Z';
const end = '2026-01-04T09:00:00.000Z';
const analysis = () => ({
  accountId,
  mode: 'actual' as const,
  symbol: null,
  ledgerRevision: '12',
  projectionGeneration: '7',
  candidates: [],
  result: journalAnalyzePeriod([], { start, end }),
});
const request = () => ({
  accountId,
  mode: 'actual' as const,
  start,
  end,
  expectedLedgerRevision: '12',
  expectedProjectionGeneration: '7',
  expectedAlgorithmVersion: analysis().result.algorithmVersion,
  objectFingerprints: {},
});
const finishedAi = () => ({
  id: aiRunId,
  accountId,
  mode: 'actual',
  symbol: null,
  start,
  end,
  ledgerRevision: '12',
  projectionGeneration: '7',
  algorithmVersion: analysis().result.algorithmVersion,
  objectFingerprints: {},
  provider: 'fixture',
  model: 'fixture-model',
  promptVersion: 'v2',
  status: 'succeeded',
  errorCode: null,
  errorSummary: null,
  result: {
    version: 1,
    provider: 'fixture',
    conclusion: '保存的中文周期复盘',
    evidence: [],
    risks: [],
    unknowns: [],
    disclaimer: '研究用途',
    signals: [],
    createdAt: '2026-01-05T10:00:00Z',
  },
  createdAt: '2026-01-05T10:00:00Z',
});
function harness() {
  const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    ...data,
    id: '00000000-0000-4000-8000-000000000003',
    createdAt: new Date('2026-01-05T11:00:00Z'),
    updatedAt: new Date('2026-01-05T11:00:00Z'),
    aiExplanation: data.aiExplanation ?? null,
  }));
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ accountId }]),
    journalPeriodReviewSnapshot: { create },
  };
  const transaction = vi.fn(
    async (work: (tx: unknown) => Promise<unknown>, options: { isolationLevel: string }) => {
      expect(options.isolationLevel).toBe(Prisma.TransactionIsolationLevel.Serializable);
      return work(tx);
    },
  );
  const period = vi.fn().mockResolvedValue(analysis());
  const get = vi.fn().mockResolvedValue(finishedAi());
  const prisma = {
    $transaction: transaction,
    journalPeriodReviewSnapshot: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
    },
  };
  const service = new JournalPeriodReviewSnapshots(
    prisma as never,
    { period } as never,
    { get } as never,
  );
  return { service, tx, prisma, create, period, get };
}

describe('周期复盘快照：显式冻结而非任务绑定', () => {
  it('保存权威统计、共享锁与版本，不启动也不绑定 AI 任务', async () => {
    const { service, tx, create, period, get } = harness();
    const snapshot = await service.save(request(), {} as never);
    expect(journalStoredPeriodSnapshotSchema.parse(snapshot).aiExplanation).toBeNull();
    expect(snapshot.analysis.result.tradeCycles.metrics.sampleCount.value).toBe('0');
    expect(snapshot.algorithmVersion).toBe(request().expectedAlgorithmVersion);
    expect(period).toHaveBeenCalledWith({ accountId, mode: 'actual', start, end }, tx);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]![0].data).toMatchObject({
      ledgerRevision: 12n,
      projectionGeneration: 7n,
      objectFingerprints: {},
    });
    expect(create.mock.calls[0]![0].data).not.toHaveProperty('aiExplanation');
    expect(get).not.toHaveBeenCalled();
  });

  it('保存成功 AI 的冻结副本，而不是任务绑定指针', async () => {
    const { service, create, get } = harness();
    const snapshot = await service.save({ ...request(), aiRunId }, {} as never);
    expect(snapshot.aiExplanation?.result).toMatchObject({ conclusion: '保存的中文周期复盘' });
    expect(create.mock.calls[0]![0].data).toMatchObject({
      aiExplanation: expect.objectContaining({
        id: aiRunId,
        result: expect.objectContaining({ conclusion: '保存的中文周期复盘' }),
      }),
    });
    expect(create.mock.calls[0]![0].data).not.toHaveProperty('aiRunId');
    expect(get).toHaveBeenCalledOnce();
  });

  it('证据改变、AI 不成功或 AI 输入不匹配时均拒绝保存', async () => {
    const { service, create, period, get } = harness();
    await expect(
      service.save({ ...request(), expectedLedgerRevision: '11' }, {} as never),
    ).rejects.toMatchObject({ response: { errorCode: 'JOURNAL_EVIDENCE_CHANGED' } });
    period.mockResolvedValueOnce({ ...analysis(), ledgerRevision: '999' });
    await expect(service.save(request(), {} as never)).rejects.toMatchObject({
      response: { errorCode: 'JOURNAL_EVIDENCE_CHANGED' },
    });
    get.mockResolvedValueOnce({ ...finishedAi(), status: 'running', result: null });
    await expect(service.save({ ...request(), aiRunId }, {} as never)).rejects.toMatchObject({
      response: { errorCode: 'JOURNAL_PERIOD_AI_MISMATCH' },
    });
    get.mockResolvedValueOnce({ ...finishedAi(), start: '2026-01-02T09:00:00Z' });
    await expect(service.save({ ...request(), aiRunId }, {} as never)).rejects.toMatchObject({
      response: { errorCode: 'JOURNAL_PERIOD_AI_MISMATCH' },
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('历史读取使用冻结数据，不触发 AI 或统计重算，并限制账户范围', async () => {
    const { service, prisma, period, get } = harness();
    const snapshot = await service.save(request(), {} as never);
    const row = {
      id: snapshot.id,
      accountId: snapshot.accountId,
      mode: snapshot.mode,
      symbol: snapshot.symbol,
      start: snapshot.start,
      end: snapshot.end,
      ledgerRevision: 12n,
      projectionGeneration: 7n,
      algorithmVersion: snapshot.algorithmVersion,
      analysisSnapshot: snapshot.analysis,
      aiExplanation: null,
      createdAt: new Date(snapshot.createdAt),
    };
    prisma.journalPeriodReviewSnapshot.findFirst.mockResolvedValueOnce(row);
    period.mockClear();
    const fetched = await service.get(snapshot.id, { accountId, mode: 'actual' });
    expect(fetched).toEqual(snapshot);
    expect(period).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
    await expect(
      service.get(snapshot.id, {
        accountId: '00000000-0000-4000-8000-000000000004',
        mode: 'actual',
      }),
    ).rejects.toMatchObject({ response: { errorCode: 'JOURNAL_SNAPSHOT_NOT_FOUND' } });
  });
});
