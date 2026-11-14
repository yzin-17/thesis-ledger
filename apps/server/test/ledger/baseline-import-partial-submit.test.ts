import { describe, expect, it, vi } from 'vitest';
import { ledgerEventEnvelopeSchema, type LedgerEvent } from '@thesis-ledger/schemas';
import { BaselineImportService } from '../../src/ledger/baseline-import.service.js';
import { accountId, knownEvent, storedFromEvent } from './baseline-import-ledger.fixture.js';

describe('部分提交的观察时间与历史冻结', () => {
  it('Revision 提供新的观察时间但省略精度时按新时间推断', async () => {
    const draftId = '55555555-5555-4555-8555-555555555562';
    const row = {
      rowId: 'row-1',
      kind: 'POSITION_BASELINE' as const,
      symbol: 'AAPL.US',
      quantity: '1',
      currency: 'USD',
      costIncludesFees: 'UNKNOWN' as const,
      issues: [],
    };
    const transaction = {
      importDraft: {
        findUnique: vi.fn(async () => ({
          id: draftId,
          status: 'pending',
          currentRevision: 1,
          scope: 'FULL',
          rows: [row],
        })),
        update: vi.fn(),
      },
      importDraftRevision: {
        findUnique: vi.fn(async () => ({
          submittedAt: null,
          submittedRowIds: null,
          rows: [row],
          observedAt: new Date('2026-08-20T00:00:00.000Z'),
          capturedAt: new Date('2026-08-20T00:01:00.000Z'),
          timePrecision: 'DATE',
          sourceTimezone: 'UTC',
        })),
        create: vi.fn(),
      },
    };
    const prisma = {
      $transaction: (operation: (client: typeof transaction) => unknown) => operation(transaction),
    };
    const service = new BaselineImportService(prisma as never, {} as never);

    await service.reviseImportDraft({
      command: 'REVISE_IMPORT_DRAFT',
      draftId,
      expectedRevision: 1,
      parserVersion: 'broker-pdf@2',
      rawEvidenceRef: 'evidence://controlled/time',
      contentHash: 'c'.repeat(64),
      observedAt: '2026-08-21T02:00:00.000Z',
      rows: [row],
    });

    expect(transaction.importDraftRevision.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ timePrecision: 'INSTANT' }),
      }),
    );
  });

  it('连续多次部分提交时冻结所有历史已提交行', async () => {
    const draftId = '55555555-5555-4555-8555-555555555563';
    const firstRow = {
      rowId: 'row-first',
      kind: 'EXECUTION' as const,
      side: 'BUY' as const,
      occurredAt: '2026-08-20T01:00:00.000Z',
      sourceTimezone: 'UTC',
      symbol: 'AAPL.US',
      quantity: '1',
      price: '200',
      currency: 'USD',
      charges: [],
      issues: [],
    };
    const secondRow = { ...firstRow, rowId: 'row-second', symbol: 'MSFT.US' };
    const thirdRow = { ...firstRow, rowId: 'row-third', symbol: 'NVDA.US' };
    const transaction = {
      importDraft: {
        findUnique: vi.fn(async () => ({
          id: draftId,
          status: 'partial',
          currentRevision: 3,
          scope: 'PARTIAL',
          rows: [firstRow, secondRow, thirdRow],
        })),
        update: vi.fn(),
      },
      importDraftRevision: {
        findUnique: vi.fn(async () => ({
          submittedAt: null,
          submittedRowIds: null,
          rows: [secondRow, thirdRow],
          observedAt: null,
          capturedAt: null,
          timePrecision: null,
          sourceTimezone: null,
        })),
        findMany: vi.fn(async () => [
          { submittedRowIds: ['row-first'] },
          { submittedRowIds: ['row-second'] },
        ]),
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
        expectedRevision: 3,
        parserVersion: 'broker-pdf@3',
        rawEvidenceRef: 'evidence://controlled/third',
        contentHash: 'd'.repeat(64),
        rows: [secondRow, thirdRow],
      }),
    ).resolves.toMatchObject({ draftId, revision: 4, rowIds: ['row-third'] });
    expect(transaction.importDraftRevision.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ rows: [thirdRow] }),
      }),
    );
  });
});

describe('部分提交保留问题行', () => {
  it('部分提交只写选中有效行，问题行保留在冻结 Revision', async () => {
    const draftId = '55555555-5555-4555-8555-555555555555';
    const rows = [
      {
        rowId: 'buy-1',
        kind: 'EXECUTION' as const,
        side: 'BUY' as const,
        occurredAt: '2026-08-20T01:00:00.000Z',
        sourceTimezone: 'UTC',
        symbol: 'AAPL.US',
        quantity: '1',
        price: '200',
        currency: 'USD',
        charges: [],
        issues: [],
      },
      {
        rowId: 'sell-orphan',
        kind: 'EXECUTION' as const,
        side: 'SELL' as const,
        occurredAt: '2026-08-19T01:00:00.000Z',
        sourceTimezone: 'UTC',
        symbol: 'MSFT.US',
        quantity: '1',
        price: '400',
        currency: 'USD',
        charges: [],
        issues: ['ORPHAN_SELL'],
      },
    ];
    const revision = {
      id: '66666666-6666-4666-8666-666666666666',
      draftId,
      revision: 1,
      rows,
      createdAt: new Date('2026-08-26T01:00:00.000Z'),
      rawEvidenceRef: 'evidence://controlled/raw.pdf',
      contentHash: 'b'.repeat(64),
      observedAt: new Date('2026-08-26T00:30:00.000Z'),
      capturedAt: new Date('2026-08-26T00:31:00.000Z'),
      timePrecision: 'INSTANT',
      sourceTimezone: 'UTC',
      submittedAt: null as Date | null,
      submittedRowIds: null as string[] | null,
    };
    const appended: LedgerEvent[] = [];
    const transaction = {
      importDraftRevision: {
        findUnique: vi.fn(async () => revision),
        update: vi.fn(
          async ({ data }: { data: { submittedAt: Date; submittedRowIds: string[] } }) => {
            revision.submittedAt = data.submittedAt;
            revision.submittedRowIds = data.submittedRowIds;
            return revision;
          },
        ),
      },
      importDraft: {
        findUnique: vi.fn(async () => ({
          id: draftId,
          accountId,
          source: 'broker-pdf',
          status: 'pending',
          currentRevision: 1,
          scope: 'FULL',
        })),
        update: vi.fn(async ({ data }: { data: object }) => data),
      },
      baselineObservationBatch: { create: vi.fn() },
      position: {
        findMany: vi.fn(async () => []),
        update: vi.fn(),
        delete: vi.fn(),
        create: vi.fn(),
      },
      ledgerEvent: {
        findMany: vi.fn(async () => appended.map(storedFromEvent)),
      },
      account: {
        findUnique: vi.fn(async () => ({ id: accountId, type: 'brokerage', currency: 'CNY' })),
      },
      asset: {
        findUnique: vi.fn(async () => null),
        upsert: vi.fn(async ({ create }: { create: object }) => create),
      },
    };
    let ledgerRevision = 0n;
    const repository = {
      withAccountWrite: async (
        requestedAccountId: string,
        operation: (context: object) => Promise<{ value: unknown; advanceRevision: boolean }>,
      ) => {
        const mutation = await operation({
          transaction,
          accountId: requestedAccountId,
          currentLedgerRevision: ledgerRevision,
          nextLedgerRevision: ledgerRevision + 1n,
          currentProjectionGeneration: ledgerRevision,
          nextProjectionGeneration: ledgerRevision + 1n,
        });
        if (mutation.advanceRevision) ledgerRevision += 1n;
        return {
          value: mutation.value,
          ledgerRevision: ledgerRevision.toString(),
          projectionGeneration: ledgerRevision.toString(),
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
        findUnique: vi.fn(async () => ({ id: draftId, accountId, source: 'broker-pdf' })),
      },
    };
    const service = new BaselineImportService(prisma as never, repository as never);
    const command = {
      command: 'SUBMIT_IMPORT_DRAFT_REVISION',
      draftId,
      revision: 1,
      expectedLedgerRevision: '0',
      selectedRowIds: ['buy-1'],
      actorId: 'user-1',
    };

    const submitted = await service.submitImportDraft(command);
    const replay = await service.submitImportDraft(command);

    expect(submitted).toMatchObject({
      idempotentReplay: false,
      ledgerRevisions: { [accountId]: '1' },
    });
    expect(replay).toMatchObject({
      eventIds: submitted.eventIds,
      idempotentReplay: true,
      ledgerRevisions: { [accountId]: '1' },
    });
    expect(appended).toHaveLength(1);
    expect(appended[0]?.source.sourceRowId).toBe('buy-1');
    expect(transaction.importDraft.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'partial' }) }),
    );
    expect(revision.submittedRowIds).toEqual(['buy-1']);
  });
});

describe('卖出数量与原子提交', () => {
  it('BUY 数量不足以覆盖 SELL 时整个提交失败并把问题留在 Draft', async () => {
    const draftId = '55555555-5555-4555-8555-555555555555';
    const transaction = {
      importDraftRevision: {
        findUnique: vi.fn(async () => ({
          id: '66666666-6666-4666-8666-666666666666',
          revision: 1,
          rows: [
            {
              rowId: 'buy-1',
              kind: 'EXECUTION',
              side: 'BUY',
              occurredAt: '2026-08-18T01:00:00.000Z',
              sourceTimezone: 'UTC',
              symbol: 'MSFT.US',
              quantity: '1',
              price: '390',
              currency: 'USD',
              charges: [],
              issues: [],
            },
            {
              rowId: 'sell-orphan',
              kind: 'EXECUTION',
              side: 'SELL',
              occurredAt: '2026-08-19T01:00:00.000Z',
              sourceTimezone: 'UTC',
              symbol: 'MSFT.US',
              quantity: '2',
              price: '400',
              currency: 'USD',
              charges: [],
              issues: ['STALE_SOURCE'],
            },
          ],
          submittedAt: null,
        })),
        update: vi.fn(async ({ data }: { data: object }) => data),
      },
      importDraft: {
        findUnique: vi.fn(async () => ({
          id: draftId,
          accountId,
          source: 'broker-pdf',
          status: 'pending',
          currentRevision: 1,
          scope: 'FULL',
        })),
        update: vi.fn(async ({ data }: { data: object }) => data),
      },
      ledgerEvent: { findMany: vi.fn(async () => []) },
    };
    const appendRevision = vi.fn();
    const repository = {
      withAccountWrite: async (_accountId: string, operation: (context: object) => unknown) =>
        operation({
          transaction,
          accountId,
          currentLedgerRevision: 0n,
          nextLedgerRevision: 1n,
          currentProjectionGeneration: 0n,
          nextProjectionGeneration: 1n,
        }),
      appendRevision,
    };
    const prisma = {
      importDraft: {
        findUnique: vi.fn(async () => ({ id: draftId, accountId, source: 'broker-pdf' })),
      },
    };
    const service = new BaselineImportService(prisma as never, repository as never);

    await expect(
      service.submitImportDraft({
        command: 'SUBMIT_IMPORT_DRAFT_REVISION',
        draftId,
        revision: 1,
        expectedLedgerRevision: '0',
        selectedRowIds: ['buy-1', 'sell-orphan'],
        actorId: 'user-1',
      }),
    ).rejects.toThrow('问题行不能提交');
    expect(appendRevision).not.toHaveBeenCalled();
    expect(transaction.importDraftRevision.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          rows: expect.arrayContaining([
            expect.objectContaining({
              rowId: 'sell-orphan',
              issues: ['STALE_SOURCE', 'ORPHAN_SELL'],
            }),
          ]),
        }),
      }),
    );
  });

  it('账户已有数量能够覆盖 SELL 时允许提交', async () => {
    const draftId = '55555555-5555-4555-8555-555555555556';
    const revision = {
      id: '66666666-6666-4666-8666-666666666667',
      revision: 1,
      rows: [
        {
          rowId: 'sell-supported',
          kind: 'EXECUTION',
          side: 'SELL',
          occurredAt: '2026-08-21T01:00:00.000Z',
          sourceTimezone: 'UTC',
          symbol: '0700.HK',
          quantity: '5',
          price: '510',
          currency: 'HKD',
          charges: [],
          issues: [],
        },
      ],
      submittedAt: null as Date | null,
      submittedRowIds: null as string[] | null,
    };
    const transaction = {
      importDraftRevision: {
        findUnique: vi.fn(async () => revision),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          revision.submittedAt = data.submittedAt as Date;
          revision.submittedRowIds = data.submittedRowIds as string[];
          return revision;
        }),
      },
      importDraft: {
        findUnique: vi.fn(async () => ({
          id: draftId,
          accountId,
          source: 'broker-pdf',
          status: 'pending',
          currentRevision: 1,
          scope: 'FULL',
        })),
        update: vi.fn(async ({ data }: { data: object }) => data),
      },
      ledgerEvent: { findMany: vi.fn(async () => [storedFromEvent(knownEvent)]) },
      account: {
        findUnique: vi.fn(async () => ({ id: accountId, type: 'securities', currency: 'CNY' })),
      },
      asset: {
        findUnique: vi.fn(async () => ({ identityStatus: 'confirmed', assetType: 'stock' })),
        upsert: vi.fn(async ({ update }: { update: object }) => update),
      },
      baselineObservationBatch: { create: vi.fn() },
      position: {
        findMany: vi.fn(async () => []),
        update: vi.fn(),
        delete: vi.fn(),
        create: vi.fn(),
      },
    };
    const appended: LedgerEvent[] = [];
    const repository = {
      withAccountWrite: async (
        requestedAccountId: string,
        operation: (context: object) => Promise<{ value: unknown; advanceRevision: boolean }>,
      ) => {
        const mutation = await operation({
          transaction,
          accountId: requestedAccountId,
          currentLedgerRevision: 1n,
          nextLedgerRevision: 2n,
          currentProjectionGeneration: 1n,
          nextProjectionGeneration: 2n,
        });
        return { value: mutation.value, ledgerRevision: '2', projectionGeneration: '2' };
      },
      appendRevision: vi.fn(async (_context: object, rawEvent: unknown) => {
        const event = ledgerEventEnvelopeSchema.parse(rawEvent);
        appended.push(event);
        return event;
      }),
    };
    const prisma = {
      importDraft: {
        findUnique: vi.fn(async () => ({ id: draftId, accountId, source: 'broker-pdf' })),
      },
    };

    await expect(
      new BaselineImportService(prisma as never, repository as never).submitImportDraft({
        command: 'SUBMIT_IMPORT_DRAFT_REVISION',
        draftId,
        revision: 1,
        expectedLedgerRevision: '1',
        selectedRowIds: ['sell-supported'],
        actorId: 'user-1',
      }),
    ).resolves.toMatchObject({ affectedSymbols: ['0700.HK'] });
    expect(appended).toEqual([
      expect.objectContaining({
        type: 'SELL_EXECUTION',
        source: expect.objectContaining({ sourceRowId: 'sell-supported' }),
      }),
    ]);
  });
});

describe('部分提交范围合并及完成', () => {
  it('partial 草稿提交后续 Revision 时合并历史提交范围并完成 Draft', async () => {
    const draftId = '55555555-5555-4555-8555-555555555560';
    const firstRow = {
      rowId: 'row-first',
      kind: 'EXECUTION' as const,
      side: 'BUY' as const,
      occurredAt: '2026-08-20T01:00:00.000Z',
      sourceTimezone: 'UTC',
      symbol: 'AAPL.US',
      quantity: '1',
      price: '200',
      currency: 'USD',
      charges: [],
      issues: [],
    };
    const secondRow = {
      rowId: 'row-second',
      kind: 'EXECUTION' as const,
      side: 'BUY' as const,
      occurredAt: '2026-08-21T01:00:00.000Z',
      sourceTimezone: 'UTC',
      symbol: 'MSFT.US',
      quantity: '1',
      price: '300',
      currency: 'USD',
      charges: [],
      issues: [],
    };
    const revision = {
      id: '66666666-6666-4666-8666-666666666669',
      draftId,
      revision: 2,
      rows: [secondRow],
      scope: 'PARTIAL',
      submittedAt: null as Date | null,
      submittedRowIds: null as string[] | null,
      rawEvidenceRef: 'evidence://continuation',
      contentHash: 'f'.repeat(64),
      observedAt: null,
      capturedAt: null,
      timePrecision: null,
      sourceTimezone: null,
    };
    const draft = {
      id: draftId,
      accountId,
      source: 'broker-pdf',
      status: 'partial',
      currentRevision: 2,
      scope: 'PARTIAL',
      rows: [firstRow, secondRow],
      committedAt: null as Date | null,
    };
    const appended: LedgerEvent[] = [];
    const transaction = {
      importDraftRevision: {
        findUnique: vi.fn(async () => revision),
        findMany: vi.fn(async () => [{ submittedRowIds: ['row-first'] }]),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          Object.assign(revision, data);
          return revision;
        }),
      },
      importDraft: {
        findUnique: vi.fn(async () => draft),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          Object.assign(draft, data);
          return draft;
        }),
      },
      ledgerEvent: { findMany: vi.fn(async () => []) },
      account: {
        findUnique: vi.fn(async () => ({ id: accountId, type: 'brokerage', currency: 'CNY' })),
      },
      asset: {
        findUnique: vi.fn(async () => null),
        upsert: vi.fn(async ({ create }: { create: object }) => create),
      },
      baselineObservationBatch: { create: vi.fn() },
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
          currentLedgerRevision: 1n,
          nextLedgerRevision: 2n,
          currentProjectionGeneration: 1n,
          nextProjectionGeneration: 2n,
        });
        return {
          value: mutation.value,
          ledgerRevision: mutation.advanceRevision ? '2' : '1',
          projectionGeneration: mutation.advanceRevision ? '2' : '1',
        };
      },
      appendRevision: vi.fn(async (_context: object, rawEvent: unknown) => {
        const event = ledgerEventEnvelopeSchema.parse(rawEvent);
        appended.push(event);
        return event;
      }),
    };
    const prisma = { importDraft: { findUnique: vi.fn(async () => draft) } };
    const service = new BaselineImportService(prisma as never, repository as never);

    await expect(
      service.submitImportDraft({
        command: 'SUBMIT_IMPORT_DRAFT_REVISION',
        draftId,
        revision: 2,
        expectedLedgerRevision: '1',
        selectedRowIds: ['row-second'],
        actorId: 'user-1',
      }),
    ).resolves.toMatchObject({ idempotentReplay: false, ledgerRevisions: { [accountId]: '2' } });
    expect(appended).toHaveLength(1);
    expect(appended[0]?.source.sourceRowId).toBe('row-second');
    expect(revision.submittedRowIds).toEqual(['row-second']);
    expect(draft.status).toBe('committed');
    expect(draft.committedAt).toEqual(expect.any(Date));
  });
});
