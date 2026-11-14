import { describe, expect, it, vi } from 'vitest';
import { ledgerEventEnvelopeSchema, type LedgerEvent } from '@thesis-ledger/schemas';
import { BaselineImportService } from '../../src/ledger/baseline-import.service.js';
import { accountId } from './baseline-import-ledger.fixture.js';

describe('Reviewed Import Commit', () => {
  it('在账户写锁内重新检查基线，账本变化时不创建 Revision', async () => {
    const draftId = '55555555-5555-4555-8555-555555555570';
    let accountLocked = false;
    const transaction = {
      importDraft: {
        findUnique: vi.fn(async () => ({
          id: draftId,
          accountId,
          status: 'pending',
          currentRevision: 1,
          baselineHash: 'f'.repeat(64),
        })),
      },
      account: {
        findUnique: vi.fn(async () => ({ id: accountId, type: 'brokerage', currency: 'CNY' })),
      },
      importDraftRevision: { create: vi.fn() },
      ledgerEvent: {
        findMany: vi.fn(async () => {
          expect(accountLocked).toBe(true);
          return [];
        }),
      },
    };
    const withAccountWrite = vi.fn(
      async (
        requestedAccountId: string,
        operation: (context: object) => Promise<{ value: unknown; advanceRevision: boolean }>,
      ) => {
        accountLocked = true;
        const mutation = await operation({
          transaction,
          accountId: requestedAccountId,
          currentLedgerRevision: 0n,
          nextLedgerRevision: 1n,
          currentProjectionGeneration: 0n,
          nextProjectionGeneration: 1n,
        });
        return {
          value: mutation.value,
          ledgerRevision: mutation.advanceRevision ? '1' : '0',
          projectionGeneration: mutation.advanceRevision ? '1' : '0',
        };
      },
    );
    const prisma = {
      importDraft: { findUnique: vi.fn(async () => ({ accountId })) },
      $transaction: vi.fn(),
    };
    const service = new BaselineImportService(prisma as never, { withAccountWrite } as never);

    await expect(service.commitReviewedImport(draftId, [])).rejects.toThrow(
      '草稿创建后 Ledger 已变化',
    );
    expect(withAccountWrite).toHaveBeenCalledWith(accountId, expect.any(Function));
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(transaction.importDraftRevision.create).not.toHaveBeenCalled();
  });

  it('在同一账户写事务内完成审核 Revision、LedgerEvent 和投影重建', async () => {
    const draftId = '55555555-5555-4555-8555-555555555571';
    const reviewedRow = {
      rowId: 'source-row-1',
      rawSymbol: '600519.SH',
      rawName: '贵州茅台',
      assetType: 'stock' as const,
      symbol: '600519.SH',
      matchStatus: 'matched' as const,
      matchCandidates: [],
      quantity: '10',
      costPrice: '100',
      marketPrice: '110',
      marketValue: '1100',
      profit: '100',
      profitRate: '0.1',
      confidence: 1,
      rawText: {},
      issues: [],
    };
    let draft: Record<string, unknown> = {
      id: draftId,
      accountId,
      source: 'alipay',
      status: 'pending',
      currentRevision: 1,
      scope: 'PARTIAL',
      rows: [reviewedRow],
    };
    const revisions = new Map<number, Record<string, unknown>>([
      [
        1,
        {
          id: '66666666-6666-4666-8666-666666666670',
          draftId,
          revision: 1,
          parserVersion: 'screenshot-vision@1',
          rawEvidenceRef: `screenshot-import://${draftId}/image/hash`,
          contentHash: 'a'.repeat(64),
          scope: 'PARTIAL',
          rows: [],
          issues: [],
          observedAt: new Date('2026-08-26T00:00:00.000Z'),
          capturedAt: new Date('2026-08-26T02:31:00.000Z'),
          timePrecision: 'DATE',
          sourceTimezone: 'Asia/Shanghai',
          submittedAt: null,
          submittedRowIds: null,
        },
      ],
    ]);
    const appended: LedgerEvent[] = [];
    const transaction = {
      importDraft: {
        findUnique: vi.fn(async () => draft),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          draft = { ...draft, ...data };
          return draft;
        }),
      },
      importDraftRevision: {
        findUnique: vi.fn(
          async ({ where }: { where: { draftId_revision: { revision: number } } }) =>
            revisions.get(where.draftId_revision.revision) ?? null,
        ),
        findMany: vi.fn(async () => []),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const revision = Number(data.revision);
          revisions.set(revision, {
            ...data,
            id: '66666666-6666-4666-8666-666666666671',
            submittedAt: null,
            submittedRowIds: null,
          });
          return revisions.get(revision);
        }),
        update: vi.fn(
          async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
            const revision = [...revisions.values()].find((item) => item.id === where.id);
            if (!revision) return data;
            Object.assign(revision, data);
            return revision;
          },
        ),
      },
      account: {
        findUnique: vi.fn(async () => ({ id: accountId, type: 'brokerage', currency: 'CNY' })),
      },
      asset: {
        findUnique: vi.fn(async () => null),
        upsert: vi.fn(async ({ create }: { create: Record<string, unknown> }) => create),
        findMany: vi.fn(async () => []),
      },
      ledgerEvent: { findMany: vi.fn(async () => []) },
      baselineObservationBatch: { create: vi.fn(async ({ data }: { data: object }) => data) },
      position: {
        findMany: vi.fn(async () => []),
        update: vi.fn(),
        delete: vi.fn(),
        create: vi.fn(),
      },
    };
    const withAccountWrite = vi.fn(
      async (
        requestedAccountId: string,
        operation: (context: object) => Promise<{ value: unknown; advanceRevision: boolean }>,
      ) => {
        const mutation = await operation({
          transaction,
          accountId: requestedAccountId,
          currentLedgerRevision: 0n,
          nextLedgerRevision: 1n,
          currentProjectionGeneration: 0n,
          nextProjectionGeneration: 1n,
        });
        return {
          value: mutation.value,
          ledgerRevision: mutation.advanceRevision ? '1' : '0',
          projectionGeneration: mutation.advanceRevision ? '1' : '0',
        };
      },
    );
    const appendRevision = vi.fn(async (_context: object, rawEvent: unknown) => {
      const event = ledgerEventEnvelopeSchema.parse(rawEvent);
      appended.push(event);
      return event;
    });
    const prisma = {
      importDraft: { findUnique: vi.fn(async () => ({ accountId })) },
      $transaction: vi.fn(),
    };
    const service = new BaselineImportService(
      prisma as never,
      { withAccountWrite, appendRevision } as never,
    );

    const result = await service.commitReviewedImport(draftId, [reviewedRow], undefined, {
      scope: 'PARTIAL',
      observedAt: '2026-08-26',
      capturedAt: '2026-08-26T02:31:00.000Z',
      timePrecision: 'DATE',
      sourceTimezone: 'Asia/Shanghai',
    });

    expect(result).toMatchObject({ status: 'committed', currentRevision: 2 });
    expect(withAccountWrite).toHaveBeenCalledOnce();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(transaction.importDraftRevision.create).toHaveBeenCalledOnce();
    expect(transaction.baselineObservationBatch.create).toHaveBeenCalledOnce();
    expect(appendRevision).toHaveBeenCalledOnce();
    expect(appended[0]).toMatchObject({
      type: 'POSITION_BASELINE_OBSERVATION',
      ledgerRevision: '1',
      payload: { symbol: '600519.SH', quantity: '10' },
    });
  });
});
