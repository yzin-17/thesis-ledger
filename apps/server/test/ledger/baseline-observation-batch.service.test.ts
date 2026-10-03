import { describe, expect, it, vi } from 'vitest';
import { ledgerEventEnvelopeSchema, type LedgerEvent } from '@thesis-ledger/schemas';
import { BaselineImportService } from '../../src/ledger/baseline-import.service.js';
import { accountId, knownEvent, storedFromEvent } from './baseline-import-ledger.fixture.js';

const batchId = '22222222-2222-4222-8222-222222222222';

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
  const appended: LedgerEvent[] = [];
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
      const event = ledgerEventEnvelopeSchema.parse(rawEvent);
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
