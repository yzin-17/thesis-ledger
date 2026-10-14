import { describe, expect, it, vi } from 'vitest';
import { Prisma, type JournalReviewSnapshot } from '@prisma/client';
import type { PrismaService } from '../../src/platform/prisma.service.js';
import type { JournalReviewQuery } from '../../src/journal/journal-review-query.js';
import { JournalReviewSnapshots } from '../../src/journal/journal-review-snapshots.js';
import { journalSnapshotView } from '../../src/journal/journal-snapshot-view.js';
import {
  journalSnapshotCursor,
  journalSnapshotWhere,
  readJournalSnapshotCursor,
} from '../../src/journal/journal-snapshot-scope.js';
import { journalSnapshotHistoryQuerySchema } from '@thesis-ledger/schemas';
import { journalReviewCandidate } from '../../src/journal/journal-review-candidate.js';
import { journalAnalyzeCandidate } from '../../src/journal/journal-review-analysis.js';
import { reviewEvidenceFixture } from './review-evidence.fixture.js';

const currentCandidate = () =>
  journalReviewCandidate({
    evidence: reviewEvidenceFixture(),
    fxMissing: false,
    projectionStale: false,
  });
const accountId = reviewEvidenceFixture().trade.accountId;
function savedFixture(): JournalReviewSnapshot {
  const current = currentCandidate();
  const input = current.input;
  return {
    id: '00000000-0000-4000-8000-000000000080',
    accountId,
    mode: 'actual',
    reviewObjectType: 'TRADE_CYCLE',
    tradeId: 'trade-1',
    closeSliceId: null,
    factIds: input.projection.factIds,
    eventIds: input.projection.eventIds,
    ledgerRevision: 12n,
    projectionGeneration: 7n,
    projectionFingerprint: input.projection.projectionFingerprint,
    fxEvidenceVersion: null,
    conversionFingerprint: null,
    status: 'CURRENT',
    inputSnapshot: JSON.parse(JSON.stringify(input)),
    outputSnapshot: JSON.parse(JSON.stringify(journalAnalyzeCandidate(current))),
    createdAt: new Date('2026-01-03T09:00:00Z'),
    updatedAt: new Date('2026-01-03T09:00:00Z'),
  };
}
const request = () => {
  const current = currentCandidate();
  return {
    accountId,
    mode: 'actual',
    reference: current.input.reference,
    evidenceFingerprint: current.input.projection.evidenceFingerprint,
  };
};

describe('正式复盘快照读写', () => {
  it('保存事务使用共享锁、权威候选和 Serializable，不接受客户端结果', async () => {
    const row = savedFixture();
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ accountId }]),
      journalReviewSnapshot: {
        create: vi
          .fn<(args: Prisma.JournalReviewSnapshotCreateArgs) => Promise<JournalReviewSnapshot>>()
          .mockResolvedValue(row),
      },
    };
    const transaction = vi.fn(
      async (run: (tx: unknown) => Promise<unknown>, options: { isolationLevel: string }) => {
        expect(options.isolationLevel).toBe(Prisma.TransactionIsolationLevel.Serializable);
        return run(tx);
      },
    );
    const get = vi.fn().mockResolvedValue(currentCandidate());
    const service = new JournalReviewSnapshots(
      { $transaction: transaction } as unknown as PrismaService,
      { get } as unknown as JournalReviewQuery,
    );
    const result = await service.save(request());
    expect(result.compatibility).toBe('CURRENT_CONTRACT');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith(request(), tx);
    const written = tx.journalReviewSnapshot.create.mock.calls[0]![0].data;
    expect(written.inputSnapshot).toMatchObject({ trade: { sourceQuantity: '2' } });
    expect(written.outputSnapshot).toMatchObject({ metrics: { netRealizedPnl: { value: '4' } } });
    expect(written.factIds).toEqual(currentCandidate().input.projection.factIds);
    await service.save({ ...request(), analysisDraft: { stopLoss: '8', note: '保存假设' } });
    const drafted = tx.journalReviewSnapshot.create.mock.calls[1]![0].data;
    expect(drafted.inputSnapshot).toMatchObject({
      analysisDraft: { stopLoss: '8', note: '保存假设' },
      trade: { sourceQuantity: '2' },
    });
    expect(drafted.outputSnapshot).toMatchObject({
      metrics: { counterfactualNetPnl: { value: '0' }, netRealizedPnl: { value: '4' } },
    });
    await expect(service.save({ ...request(), outputSnapshot: { pnl: 999 } })).rejects.toThrow();
    expect(transaction).toHaveBeenCalledTimes(2);
  });
  it('显式保存关联 AI 元数据，不改变确定性结果或接受客户伪造元数据', async () => {
    const row = savedFixture();
    const create = vi.fn().mockResolvedValue(row);
    const tx = { $queryRaw: vi.fn().mockResolvedValue([]), journalReviewSnapshot: { create } };
    const metadata = {
      id: '00000000-0000-4000-8000-000000000081',
      provider: 'configured',
      model: 'configured-model',
      promptVersion: 'journal-review-v1',
      status: 'queued',
    };
    const snapshotMetadata = vi.fn().mockResolvedValue(metadata);
    const service = new JournalReviewSnapshots(
      { $transaction: (work: (tx: unknown) => Promise<unknown>) => work(tx) } as never,
      { get: vi.fn().mockResolvedValue(currentCandidate()) } as never,
      { snapshotMetadata } as never,
    );
    await service.save({ ...request(), aiRunId: metadata.id });
    expect(snapshotMetadata).toHaveBeenCalledWith(
      metadata.id,
      currentCandidate().input,
      'journal-decimal-1',
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          outputSnapshot: expect.objectContaining({
            aiExplanation: metadata,
            metrics: expect.objectContaining({
              netRealizedPnl: expect.objectContaining({ value: '4' }),
            }),
          }),
        }),
      }),
    );
    await expect(service.save({ ...request(), aiExplanation: metadata })).rejects.toThrow();
    expect(create).toHaveBeenCalledTimes(1);
  });
  it('证据变化和数据库序列化竞争明确失败，不重复保存', async () => {
    const create = vi.fn();
    const tx = { $queryRaw: vi.fn().mockResolvedValue([]), journalReviewSnapshot: { create } };
    const transaction = vi.fn(async (run: (tx: unknown) => Promise<unknown>) => run(tx));
    const service = new JournalReviewSnapshots(
      { $transaction: transaction } as unknown as PrismaService,
      { get: vi.fn().mockResolvedValue(currentCandidate()) } as unknown as JournalReviewQuery,
    );
    await expect(service.save({ ...request(), evidenceFingerprint: 'old' })).rejects.toMatchObject({
      response: { errorCode: 'JOURNAL_EVIDENCE_CHANGED' },
    });
    expect(create).not.toHaveBeenCalled();
    transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('serialization', {
        code: 'P2034',
        clientVersion: 'fixture',
      }),
    );
    await expect(service.save(request())).rejects.toMatchObject({
      response: { errorCode: 'JOURNAL_SAVE_CONFLICT' },
    });
    expect(transaction).toHaveBeenCalledTimes(2);
  });
  it('读取历史结果只比较当前指纹，STALE、对象消失均不重算或覆盖', () => {
    const row = savedFixture();
    const current = currentCandidate();
    const original = structuredClone(row);
    const currentView = journalSnapshotView(
      row,
      new Map([
        [current.input.reference.reviewObjectId, current.input.projection.evidenceFingerprint],
      ]),
    );
    expect(currentView.compatibility === 'CURRENT_CONTRACT' && currentView.snapshot.status).toBe(
      'CURRENT',
    );
    for (const fingerprints of [
      new Map<string, string>(),
      new Map([[current.input.reference.reviewObjectId, 'changed']]),
    ]) {
      const stale = journalSnapshotView(row, fingerprints);
      expect(stale.compatibility === 'CURRENT_CONTRACT' && stale.snapshot.status).toBe('STALE');
      expect(
        stale.compatibility === 'CURRENT_CONTRACT' &&
          stale.snapshot.outputSnapshot.metrics.netRealizedPnl!.value,
      ).toBe('4');
    }
    expect(row).toEqual(original);
  });
  it('不安全旧合同、金额或元数据保留原始快照并返回兼容状态', () => {
    const original = savedFixture();
    for (const row of [
      { ...original, inputSnapshot: { pnl: 9007199254740992 } },
      { ...original, factIds: [] },
      { ...original, ledgerRevision: 99n },
      { ...original, fxEvidenceVersion: 'changed' },
    ]) {
      const result = journalSnapshotView(row, new Map());
      expect(result.compatibility).toBe('LEGACY_UNSUPPORTED');
      if (result.compatibility === 'LEGACY_UNSUPPORTED') {
        expect(result.inputSnapshot).toEqual(row.inputSnapshot);
        expect(result.outputSnapshot).toEqual(row.outputSnapshot);
        expect(result.status).toBe('LEGACY_REVIEW_NEEDS_CONFIRMATION');
      }
    }
  });
  it('历史游标绑定账户、模式、对象与窗口，不受当前投影世代变化影响', () => {
    const query = journalSnapshotHistoryQuerySchema.parse({
      accountId,
      reviewObjectId: 'TRADE_CYCLE:trade-1',
    });
    const cursor = journalSnapshotCursor(query, savedFixture().id);
    expect(readJournalSnapshotCursor({ ...query, cursor })).toBe(savedFixture().id);
    for (const changed of [
      { ...query, mode: 'shadow' as const },
      { ...query, reviewObjectId: 'CLOSE_SLICE:slice-1' },
      { ...query, end: '2026-02-01T00:00:00Z' },
    ])
      expect(() => readJournalSnapshotCursor({ ...changed, cursor })).toThrow('复盘快照游标已失效');
  });
  it('快照创建时间使用半开窗口，毫秒存储下亚毫秒边界不截断或错包含', () => {
    const query = journalSnapshotHistoryQuerySchema.parse({
      accountId,
      start: '2026-01-03T09:00:00.000000001Z',
      end: '2026-01-03T09:00:00.001000001Z',
    });
    expect(journalSnapshotWhere(query).createdAt).toEqual({
      gte: new Date('2026-01-03T09:00:00.001Z'),
      lt: new Date('2026-01-03T09:00:00.002Z'),
    });
    const exact = journalSnapshotHistoryQuerySchema.parse({
      accountId,
      start: '2026-01-03T09:00:00.001Z',
      end: '2026-01-03T09:00:00.002Z',
    });
    expect(journalSnapshotWhere(exact).createdAt).toEqual({
      gte: new Date(exact.start!),
      lt: new Date(exact.end!),
    });
    const beforeEpoch = journalSnapshotHistoryQuerySchema.parse({
      accountId,
      start: '1969-12-31T23:59:59.999999999Z',
    });
    expect(journalSnapshotWhere(beforeEpoch).createdAt).toEqual({ gte: new Date(0) });
  });
});
