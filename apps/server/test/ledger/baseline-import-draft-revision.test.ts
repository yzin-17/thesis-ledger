import { describe, expect, it, vi } from 'vitest';
import { ledgerEventEnvelopeSchema, type LedgerEvent } from '@thesis-ledger/schemas';
import { BaselineImportService } from '../../src/ledger/baseline-import.service.js';
import { accountId, knownEvent, storedFromEvent } from './baseline-import-ledger.fixture.js';

describe('草稿修订及已提交范围冻结', () => {
  it('已提交草稿不可通过修改接口重新打开', async () => {
    const draftId = '55555555-5555-4555-8555-555555555557';
    const transaction = {
      importDraft: {
        findUnique: vi.fn(async () => ({
          id: draftId,
          status: 'committed',
          currentRevision: 1,
          scope: 'FULL',
        })),
      },
    };
    const prisma = {
      $transaction: (operation: (client: typeof transaction) => unknown) => operation(transaction),
    };
    const service = new BaselineImportService(prisma as never, {} as never);

    await expect(
      service.reviseImportDraft({
        command: 'REVISE_IMPORT_DRAFT',
        draftId,
        expectedRevision: 1,
        parserVersion: 'screenshot@reviewed',
        rawEvidenceRef: 'evidence://controlled/frozen',
        contentHash: 'c'.repeat(64),
        rows: [
          {
            rowId: 'row-1',
            kind: 'POSITION_BASELINE',
            symbol: 'AAPL.US',
            quantity: '1',
            currency: 'USD',
            costIncludesFees: 'UNKNOWN',
            issues: [],
          },
        ],
      }),
    ).rejects.toThrow('不可修改');
  });

  it('部分提交后可从未提交行创建新 Revision，已提交行保持冻结', async () => {
    const draftId = '55555555-5555-4555-8555-555555555559';
    const submittedRow = {
      rowId: 'row-submitted',
      kind: 'POSITION_BASELINE' as const,
      symbol: 'AAPL.US',
      quantity: '1',
      currency: 'USD',
      costIncludesFees: 'UNKNOWN' as const,
      issues: [],
    };
    const remainingRow = {
      rowId: 'row-remaining',
      kind: 'POSITION_BASELINE' as const,
      symbol: 'MSFT.US',
      quantity: '2',
      currency: 'USD',
      costIncludesFees: 'UNKNOWN' as const,
      issues: [],
    };
    const transaction = {
      importDraft: {
        findUnique: vi.fn(async () => ({
          id: draftId,
          status: 'partial',
          currentRevision: 1,
          scope: 'FULL',
          rows: [submittedRow, remainingRow],
        })),
        update: vi.fn(),
      },
      importDraftRevision: {
        findUnique: vi.fn(async () => ({
          submittedAt: new Date('2026-08-26T03:00:00.000Z'),
          submittedRowIds: ['row-submitted'],
          rows: [submittedRow, remainingRow],
          observedAt: new Date('2026-08-26T00:00:00.000Z'),
          capturedAt: new Date('2026-08-26T00:01:00.000Z'),
          timePrecision: 'INSTANT',
          sourceTimezone: 'UTC',
        })),
        create: vi.fn(),
      },
    };
    const prisma = {
      $transaction: (operation: (client: typeof transaction) => unknown) => operation(transaction),
    };
    const service = new BaselineImportService(prisma as never, {} as never);

    await expect(
      service.reviseImportDraft({
        command: 'REVISE_IMPORT_DRAFT',
        draftId,
        expectedRevision: 1,
        parserVersion: 'screenshot@reviewed',
        rawEvidenceRef: 'evidence://controlled/frozen-partial',
        contentHash: 'e'.repeat(64),
        rows: [remainingRow],
      }),
    ).resolves.toMatchObject({ draftId, revision: 2 });
    expect(transaction.importDraftRevision.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ revision: 2, rows: [remainingRow] }),
      }),
    );
    expect(transaction.importDraft.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ rows: [submittedRow, remainingRow], status: 'pending' }),
      }),
    );
  });
});

describe('全量导入的缺失资产观察', () => {
  it('FULL 导入会为观察时点缺失的既有资产追加 0 观察', async () => {
    const draftId = '55555555-5555-4555-8555-555555555558';
    const revision = {
      id: '66666666-6666-4666-8666-666666666668',
      draftId,
      revision: 1,
      scope: 'FULL',
      rows: [
        {
          rowId: 'baseline-aapl',
          kind: 'POSITION_BASELINE' as const,
          symbol: 'AAPL.US',
          quantity: '2',
          currency: 'USD',
          costIncludesFees: 'UNKNOWN' as const,
          observedAt: '2026-08-26',
          capturedAt: '2026-08-26T02:31:00.000Z',
          timePrecision: 'DATE' as const,
          sourceTimezone: 'UTC',
          issues: [],
        },
      ],
      observedAt: new Date('2026-08-26T00:00:00.000Z'),
      capturedAt: new Date('2026-08-26T02:31:00.000Z'),
      timePrecision: 'DATE',
      sourceTimezone: 'UTC',
      rawEvidenceRef: 'evidence://controlled/full',
      contentHash: 'd'.repeat(64),
      submittedAt: null as Date | null,
      submittedRowIds: null as string[] | null,
    };
    const appended: LedgerEvent[] = [];
    const transaction = {
      importDraft: {
        findUnique: vi.fn(async () => ({
          id: draftId,
          accountId,
          source: 'screenshot',
          status: 'pending',
          currentRevision: 1,
          scope: 'FULL',
        })),
        update: vi.fn(async ({ data }: { data: object }) => data),
      },
      importDraftRevision: {
        findUnique: vi.fn(async () => revision),
        update: vi.fn(async ({ data }: { data: object }) => data),
      },
      ledgerEvent: {
        findMany: vi.fn(async () => [storedFromEvent(knownEvent)]),
      },
      asset: {
        findMany: vi.fn(async () => [{ symbol: '0700.HK', currency: 'HKD' }]),
        findUnique: vi.fn(async () => null),
        upsert: vi.fn(async ({ create }: { create: object }) => create),
      },
      account: {
        findUnique: vi.fn(async () => ({ id: accountId, type: 'brokerage', currency: 'CNY' })),
      },
      baselineObservationBatch: {
        create: vi.fn(async ({ data }: { data: object }) => data),
      },
      position: {
        findMany: vi.fn(async () => []),
        update: vi.fn(),
        delete: vi.fn(),
        create: vi.fn(),
      },
    };
    const repository = {
      withAccountWrite: async (
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
      appendRevision: vi.fn(async (_context: object, rawEvent: unknown) => {
        const event = ledgerEventEnvelopeSchema.parse(rawEvent);
        appended.push(event);
        return event;
      }),
    };
    const prisma = {
      importDraft: {
        findUnique: vi.fn(async () => ({ id: draftId, accountId, source: 'screenshot' })),
      },
    };
    const service = new BaselineImportService(prisma as never, repository as never);

    await service.submitImportDraft({
      command: 'SUBMIT_IMPORT_DRAFT_REVISION',
      draftId,
      revision: 1,
      expectedLedgerRevision: '0',
      selectedRowIds: ['baseline-aapl'],
      actorId: 'user-1',
    });

    expect(transaction.baselineObservationBatch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ scope: 'FULL', timePrecision: 'DATE' }),
      }),
    );
    expect(appended).toHaveLength(2);
    expect(appended.map((event) => event.source.sourceRowId)).toEqual([
      'baseline-aapl',
      'baseline-zero:0700.HK',
    ]);
    expect(appended[1]).toMatchObject({
      payload: { symbol: '0700.HK', quantity: '0', batchScope: 'FULL' },
      occurredAt: '2026-08-26',
      timePrecision: 'DATE',
    });
    expect(transaction.importDraftRevision.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          submittedRowIds: ['baseline-aapl', 'baseline-zero:0700.HK'],
          rows: expect.arrayContaining([
            expect.objectContaining({ rowId: 'baseline-zero:0700.HK', symbol: '0700.HK' }),
          ]),
        }),
      }),
    );
    expect(transaction.importDraft.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'committed',
          committedAt: expect.any(Date),
          rows: expect.arrayContaining([
            expect.objectContaining({ rowId: 'baseline-zero:0700.HK', symbol: '0700.HK' }),
          ]),
        }),
      }),
    );
  });
});

describe('草稿创建的账本数量校验', () => {
  it('草稿创建时不脱离账户账本猜测孤立 SELL', async () => {
    let storedRows: unknown;
    const transaction = {
      importDraft: {
        findUnique: vi.fn(async () => null),
        create: vi.fn(async ({ data }: { data: object }) => data),
      },
      importDraftRevision: {
        create: vi.fn(async ({ data }: { data: { rows: unknown } }) => {
          storedRows = data.rows;
          return data;
        }),
      },
    };
    const transactionOptions: unknown[] = [];
    const prisma = {
      $transaction: (operation: (client: typeof transaction) => unknown, options?: unknown) => {
        transactionOptions.push(options);
        return operation(transaction);
      },
    };
    const repository = { appendRevision: vi.fn(), withAccountWrite: vi.fn() };
    const service = new BaselineImportService(prisma as never, repository as never);

    await service.createImportDraft({
      command: 'CREATE_IMPORT_DRAFT_REVISION',
      draftId: '55555555-5555-4555-8555-555555555555',
      accountId,
      sourceChannel: 'broker-pdf',
      idempotencyKey: 'draft-1',
      parserVersion: 'broker-pdf@1',
      rawEvidenceRef: 'evidence://controlled/raw.pdf',
      contentHash: 'b'.repeat(64),
      rows: [
        {
          rowId: 'line-1',
          kind: 'EXECUTION',
          side: 'SELL',
          occurredAt: '2026-08-20T01:00:00.000Z',
          symbol: 'AAPL.US',
          quantity: '1',
          price: '210',
          currency: 'USD',
          charges: [],
          issues: [],
        },
      ],
    });

    expect(storedRows).toEqual([expect.objectContaining({ rowId: 'line-1', issues: [] })]);
    expect(repository.appendRevision).not.toHaveBeenCalled();
    expect(transactionOptions[0]).toMatchObject({
      isolationLevel: 'Serializable',
      maxWait: 10_000,
      timeout: 60_000,
    });
  });
});
