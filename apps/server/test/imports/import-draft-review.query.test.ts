import { describe, expect, it, vi } from 'vitest';
import { readImportDraftReviews } from '../../src/imports/import-draft-review.query.js';

const accountId = '11111111-1111-4111-8111-111111111111';
const draftId = '22222222-2222-4222-8222-222222222222';
const row = {
  rowId: 'a',
  kind: 'POSITION_BASELINE',
  symbol: '510300.SH',
  quantity: '1.25',
  averageCost: '4.1',
  currency: 'CNY',
  costIncludesFees: 'UNKNOWN',
  issues: [],
};
const revision = {
  draftId,
  revision: 2,
  parserVersion: 'manual-review@1',
  rawEvidenceRef: 'controlled://draft',
  contentHash: 'a'.repeat(64),
  scope: 'PARTIAL',
  observedAt: new Date('2026-10-20T00:00:00Z'),
  capturedAt: new Date('2026-10-21T01:00:00Z'),
  timePrecision: 'DATE',
  sourceTimezone: 'Asia/Shanghai',
  rows: [row],
};
const fixture = (revisions: unknown[] = [revision]) => {
  const transaction = {
    importDraft: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: draftId,
          accountId,
          source: 'unknown',
          status: 'partial',
          currentRevision: 2,
          createdAt: new Date('2026-10-21T01:00:00Z'),
        },
      ]),
    },
    importDraftRevision: {
      findMany: vi
        .fn()
        .mockResolvedValueOnce(revisions)
        .mockResolvedValueOnce([
          { draftId, submittedRowIds: ['frozen-a'] },
          { draftId, submittedRowIds: ['frozen-a', 'frozen-b'] },
        ]),
    },
  };
  const prisma = { $transaction: vi.fn(async (run) => run(transaction)) };
  return { transaction, prisma };
};

describe('草稿审核一致读取', () => {
  it('同一只读快照返回当前修订和跨修订冻结行，日期不伪造时刻', async () => {
    const { transaction, prisma } = fixture();
    const result = await readImportDraftReviews(prisma as never, accountId);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'RepeatableRead',
    });
    expect(transaction.importDraft.findMany).toHaveBeenCalledWith({
      where: { accountId },
      orderBy: { createdAt: 'desc' },
    });
    expect(result[0]?.review).toMatchObject({
      revision: 2,
      observedAt: '2026-10-20',
      capturedAt: '2026-10-21T01:00:00.000Z',
      frozenRowIds: ['frozen-a', 'frozen-b'],
      rows: [row],
    });
  });
  it('修订缺失保留记录并明确不可审核', async () => {
    const { prisma } = fixture([]);
    expect((await readImportDraftReviews(prisma as never, accountId))[0]?.review).toBeNull();
  });
  it('错误的规范化行不回退旧截图结构', async () => {
    const { prisma } = fixture([
      { ...revision, rows: [{ rawSymbol: '510300.SH', quantity: '1' }] },
    ]);
    await expect(readImportDraftReviews(prisma as never, accountId)).rejects.toThrow();
  });
  it.each(['UNKNOWN', null])('未知业务时间 %s 保留未知，不补当天', async (timePrecision) => {
    const { prisma } = fixture([
      {
        ...revision,
        observedAt: null,
        capturedAt: null,
        timePrecision,
        sourceTimezone: null,
      },
    ]);
    expect((await readImportDraftReviews(prisma as never, accountId))[0]?.review).toMatchObject({
      observedAt: null,
      capturedAt: null,
      timePrecision: 'UNKNOWN',
      sourceTimezone: null,
    });
  });
});
