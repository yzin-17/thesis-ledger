import { describe, expect, it, vi } from 'vitest';
import { ledgerEventEnvelopeSchemaV2, type LedgerEventV2 } from '@thesis-ledger/schemas';
import {
  BaselineImportService,
  createImportDraftContentFingerprint,
} from '../../src/ledger/baseline-import.service.js';

const accountId = '11111111-1111-4111-8111-111111111111';
const batchId = '22222222-2222-4222-8222-222222222222';

const knownEvent = ledgerEventEnvelopeSchemaV2.parse({
  version: 2,
  eventId: '33333333-3333-4333-8333-333333333333',
  factId: '44444444-4444-4444-8444-444444444444',
  accountId,
  ledgerRevision: '1',
  type: 'BUY_EXECUTION',
  occurredAt: '2026-08-20T01:00:00.000Z',
  timePrecision: 'INSTANT',
  sourceTimezone: 'Asia/Shanghai',
  economicOrderKey: 'a0',
  recordedAt: '2026-08-20T01:00:01.000Z',
  payloadVersion: 1,
  source: { category: 'MANUAL', channel: 'desktop', externalId: 'known-buy' },
  actorId: 'user-1',
  revisionAction: 'CREATE',
  payload: {
    symbol: '0700.HK',
    quantity: '10',
    price: '500',
    currency: 'HKD',
    capabilityVerification: 'VERIFIED',
    charges: [],
  },
});

const storedFromEvent = (event: LedgerEventV2) => ({
  id: event.eventId,
  accountId: event.accountId,
  type: event.type,
  occurredAt: event.occurredAt === null ? null : new Date(event.occurredAt),
  factId: event.factId,
  ledgerRevision: BigInt(event.ledgerRevision),
  timePrecision: event.timePrecision,
  sourceTimezone: event.sourceTimezone,
  economicOrderKey: event.economicOrderKey,
  recordedAt: new Date(event.recordedAt),
  payloadVersion: event.payloadVersion,
  payload: event.revisionAction === 'VOID' ? null : event.payload,
  sourceCategory: event.source.category,
  sourceChannel: event.source.channel,
  externalId: event.source.externalId ?? null,
  sourceRowId: event.source.sourceRowId ?? null,
  actorId: event.actorId,
  revisionAction: event.revisionAction,
  supersedesEventId: event.supersedesEventId ?? null,
  reason: event.reason ?? null,
});

const baselineCommand = {
  command: 'CREATE_BASELINE_OBSERVATION_BATCH',
  batchId,
  accountId,
  scope: 'FULL',
  observedAt: '2026-08-26T02:30:00.000Z',
  capturedAt: '2026-08-26T02:31:00.000Z',
  sourceTimezone: 'Asia/Shanghai',
  source: { category: 'IMPORT', channel: 'screenshot', externalId: 'baseline-1' },
  actorId: 'user-1',
  evidenceRef: 'evidence://controlled/1',
  contentHash: 'a'.repeat(64),
  observations: [
    {
      symbol: 'AAPL.US',
      quantity: '5',
      averageCost: '200',
      currency: 'USD',
      costIncludesFees: 'UNKNOWN',
    },
  ],
};

const createBaselineHarness = () => {
  const appended: LedgerEventV2[] = [];
  const transaction = {
    baselineObservationBatch: {
      findUnique: vi.fn(async () => null),
      create: vi.fn(async ({ data }: { data: object }) => data),
    },
    ledgerEvent: { findMany: vi.fn(async () => [storedFromEvent(knownEvent)]) },
    position: {
      findMany: vi.fn(async () => [{ id: 'position-1', symbol: '600519.SH' }]),
      update: vi.fn(async ({ data }: { data: object }) => data),
      delete: vi.fn(async () => undefined),
      create: vi.fn(async ({ data }: { data: object }) => data),
    },
    asset: {
      findMany: vi.fn(async () => [
        { symbol: '0700.HK', currency: 'HKD' },
        { symbol: '600519.SH', currency: 'CNY' },
      ]),
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
      const event = ledgerEventEnvelopeSchemaV2.parse(rawEvent);
      appended.push(event);
      return event;
    }),
  };
  const prisma = { importDraft: { findUnique: vi.fn() }, $transaction: vi.fn() };
  return {
    service: new BaselineImportService(prisma as never, repository as never),
    transaction,
    repository,
    appended,
  };
};

describe('Baseline Observation Batch', () => {
  it('FULL 为未出现的已知资产补齐原币种 0 观察', async () => {
    const harness = createBaselineHarness();
    const result = await harness.service.createBaselineBatch(baselineCommand);

    expect(result).toMatchObject({
      ledgerRevisions: { [accountId]: '2' },
      affectedSymbols: ['AAPL.US', '0700.HK', '600519.SH'],
      idempotentReplay: false,
    });
    expect(harness.appended).toHaveLength(3);
    expect(harness.appended[1]).toMatchObject({
      payload: { symbol: '0700.HK', quantity: '0', currency: 'HKD' },
    });
    expect(harness.appended[2]).toMatchObject({
      payload: { symbol: '600519.SH', quantity: '0', currency: 'CNY' },
    });
  });

  it('PARTIAL 不查询或影响未明确提供的资产', async () => {
    const harness = createBaselineHarness();
    await harness.service.createBaselineBatch({ ...baselineCommand, scope: 'PARTIAL' });

    expect(harness.appended).toHaveLength(1);
    expect(harness.transaction.asset.findMany).not.toHaveBeenCalled();
  });

  it('同一批次的所有资产事件共享一个 Ledger Revision', async () => {
    const harness = createBaselineHarness();
    await harness.service.createBaselineBatch(baselineCommand);
    expect(new Set(harness.appended.map((event) => event.ledgerRevision))).toEqual(new Set(['2']));
  });

  it('FULL 批次业务观察时间和采集时间未知时仍创建 UNKNOWN 批次和事件', async () => {
    const harness = createBaselineHarness();
    await harness.service.createBaselineBatch({
      ...baselineCommand,
      scope: 'FULL',
      observedAt: null,
      capturedAt: null,
      timePrecision: 'UNKNOWN',
      sourceTimezone: 'UNKNOWN',
    });

    expect(harness.transaction.baselineObservationBatch.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: batchId,
        timePrecision: 'UNKNOWN',
        status: 'SUBMITTED',
      }),
    });
    const batchData = harness.transaction.baselineObservationBatch.create.mock.calls[0]?.[0].data;
    expect(batchData).not.toHaveProperty('observedAt');
    expect(batchData).not.toHaveProperty('capturedAt');
    expect(harness.appended[0]).toMatchObject({
      occurredAt: null,
      timePrecision: 'UNKNOWN',
      sourceTimezone: 'UNKNOWN',
      payload: expect.not.objectContaining({ capturedAt: expect.anything() }),
    });
  });
});

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
    const appended: LedgerEventV2[] = [];
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
      const event = ledgerEventEnvelopeSchemaV2.parse(rawEvent);
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

describe('ImportDraft Revision', () => {
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
    const appended: LedgerEventV2[] = [];
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
        const event = ledgerEventEnvelopeSchemaV2.parse(rawEvent);
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

  it('草稿 Revision 变更后仍按创建时 imageHash 幂等重放', async () => {
    const draftId = '55555555-5555-4555-8555-555555555561';
    const rows = [
      {
        rowId: 'line-1',
        kind: 'EXECUTION' as const,
        side: 'BUY' as const,
        occurredAt: '2026-08-20T01:00:00.000Z',
        symbol: 'AAPL.US',
        quantity: '1',
        price: '200',
        currency: 'USD',
        charges: [],
        issues: [],
      },
    ];
    const contentFingerprint = createImportDraftContentFingerprint({
      accountId,
      sourceChannel: 'broker-pdf',
      scope: 'FULL',
      contentHash: 'b'.repeat(64),
      parserVersion: 'broker-pdf@1',
      rawEvidenceRef: 'evidence://controlled/replay',
      rows,
    });
    const existing = {
      id: draftId,
      accountId,
      source: 'broker-pdf',
      imageHash: 'b'.repeat(64),
      scope: 'FULL',
      contentFingerprint,
      revisions: [],
    };
    const prisma = {
      $transaction: vi.fn(async (operation: (client: object) => unknown) =>
        operation({ importDraft: { findUnique: vi.fn(async () => existing) } }),
      ),
    };
    const service = new BaselineImportService(prisma as never, {} as never);

    await expect(
      service.createImportDraft({
        command: 'CREATE_IMPORT_DRAFT_REVISION',
        draftId,
        accountId,
        sourceChannel: 'broker-pdf',
        idempotencyKey: 'draft-replay-after-revision',
        parserVersion: 'broker-pdf@1',
        rawEvidenceRef: 'evidence://controlled/replay',
        contentHash: 'b'.repeat(64),
        rows,
      }),
    ).resolves.toMatchObject({ draftId, revision: 1, idempotentReplay: true });
  });

  it('同一幂等键的任一内容字段变化都会返回稳定冲突', async () => {
    const command = {
      command: 'CREATE_IMPORT_DRAFT_REVISION' as const,
      draftId: '55555555-5555-4555-8555-555555555563',
      accountId,
      sourceChannel: 'broker-pdf',
      idempotencyKey: 'draft-full-fingerprint',
      parserVersion: 'broker-pdf@1',
      rawEvidenceRef: 'evidence://controlled/fingerprint',
      contentHash: 'b'.repeat(64),
      scope: 'FULL' as const,
      observedAt: '2026-08-20T01:00:00.000Z',
      capturedAt: '2026-08-20T01:01:00.000Z',
      timePrecision: 'INSTANT' as const,
      sourceTimezone: 'Asia/Shanghai',
      rows: [
        {
          rowId: 'line-1',
          kind: 'EXECUTION' as const,
          side: 'BUY' as const,
          occurredAt: '2026-08-20T01:00:00.000Z',
          symbol: 'AAPL.US',
          quantity: '1',
          price: '200',
          currency: 'USD',
          charges: [],
          issues: [],
        },
      ],
    };
    const existing = {
      id: command.draftId,
      accountId,
      source: command.sourceChannel,
      imageHash: command.contentHash,
      scope: command.scope,
      contentFingerprint: createImportDraftContentFingerprint(command),
      revisions: [],
    };
    const findUnique = vi.fn(async () => existing);
    const prisma = {
      $transaction: vi.fn(async (operation: (client: object) => unknown) =>
        operation({ importDraft: { findUnique, create: vi.fn() } }),
      ),
    };
    const service = new BaselineImportService(prisma as never, {} as never);
    const variants = [
      { accountId: '99999999-9999-4999-8999-999999999999' },
      { sourceChannel: 'another-broker' },
      { scope: 'PARTIAL' as const },
      { contentHash: 'c'.repeat(64) },
      { parserVersion: 'broker-pdf@2' },
      { rawEvidenceRef: 'evidence://controlled/other' },
      { observedAt: '2026-08-21T01:00:00.000Z' },
      { capturedAt: '2026-08-21T01:01:00.000Z' },
      { timePrecision: 'DATE' as const, observedAt: '2026-08-20' },
      { sourceTimezone: 'UTC' },
      { rows: [{ ...command.rows[0], quantity: '2' }] },
    ];

    for (const variant of variants)
      await expect(service.createImportDraft({ ...command, ...variant })).rejects.toThrow(
        '相同 Draft 幂等键的内容不同',
      );
    expect(findUnique).toHaveBeenCalledTimes(variants.length);
  });

  it('并发创建相同内容只保留一个 Draft，竞争方返回幂等重放', async () => {
    const command = {
      command: 'CREATE_IMPORT_DRAFT_REVISION' as const,
      draftId: '55555555-5555-4555-8555-555555555564',
      accountId,
      sourceChannel: 'broker-pdf',
      idempotencyKey: 'draft-concurrent-create',
      parserVersion: 'broker-pdf@1',
      rawEvidenceRef: 'evidence://controlled/concurrent',
      contentHash: 'd'.repeat(64),
      scope: 'FULL' as const,
      rows: [
        {
          rowId: 'line-1',
          kind: 'EXECUTION' as const,
          side: 'BUY' as const,
          occurredAt: '2026-08-20T01:00:00.000Z',
          symbol: 'AAPL.US',
          quantity: '1',
          price: '200',
          currency: 'USD',
          charges: [],
          issues: [],
        },
      ],
    };
    const competingCommand = { ...command, draftId: '55555555-5555-4555-8555-555555555565' };
    const drafts = new Map<string, Record<string, unknown>>();
    const createdDrafts: Record<string, unknown>[] = [];
    const createdRevisions: Record<string, unknown>[] = [];
    let findCount = 0;
    let releaseInitialFinds!: () => void;
    const initialFindsReleased = new Promise<void>((resolve) => {
      releaseInitialFinds = resolve;
    });
    const findUnique = vi.fn(async () => {
      findCount += 1;
      if (findCount === 2) releaseInitialFinds();
      if (findCount <= 2) await initialFindsReleased;
      return drafts.get(command.idempotencyKey) ?? null;
    });
    const importDraftCreate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      if (drafts.has(String(data.idempotencyKey))) throw { code: 'P2002' };
      createdDrafts.push(data);
      drafts.set(String(data.idempotencyKey), {
        id: data.id,
        accountId: data.accountId,
        source: data.source,
        imageHash: data.imageHash,
        scope: data.scope,
        contentFingerprint: data.contentFingerprint,
        revisions: [],
      });
      return data;
    });
    const revisionCreate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      createdRevisions.push(data);
      return data;
    });
    const prisma = {
      $transaction: vi.fn(async (operation: (client: object) => unknown) =>
        operation({
          importDraft: { findUnique, create: importDraftCreate },
          importDraftRevision: { create: revisionCreate },
        }),
      ),
    };
    const service = new BaselineImportService(prisma as never, {} as never);

    const results = await Promise.all([
      service.createImportDraft(command),
      service.createImportDraft(competingCommand),
    ]);

    expect(createdDrafts).toHaveLength(1);
    expect(createdRevisions).toHaveLength(1);
    expect(new Set(results.map((result) => result.draftId))).toEqual(new Set([command.draftId]));
    expect(results.map((result) => result.idempotentReplay).sort()).toEqual([false, true]);
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
  });

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
    const appended: LedgerEventV2[] = [];
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
        const event = ledgerEventEnvelopeSchemaV2.parse(rawEvent);
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
    const appended: LedgerEventV2[] = [];
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
        const event = ledgerEventEnvelopeSchemaV2.parse(rawEvent);
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
    const appended: LedgerEventV2[] = [];
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
        const event = ledgerEventEnvelopeSchemaV2.parse(rawEvent);
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
