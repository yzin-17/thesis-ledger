import { Prisma } from '@prisma/client';
import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { rebuildLedgerProjection } from '../../src/ledger/ledger-projection.js';
import type { AccountLedgerWriteContext } from '../../src/ledger/ledger-v2.repository.js';
import { TradeOpeningBoundaryCommandService } from '../../src/ledger/trade-opening-boundary-command.service.js';

vi.mock('../../src/ledger/ledger-projection.js', () => ({
  rebuildLedgerProjection: vi.fn(async () => undefined),
}));

const accountId = '11111111-1111-4111-8111-111111111111';
const baselineFactId = '22222222-2222-4222-8222-222222222222';
const eventId = '33333333-3333-4333-8333-333333333333';
const assertionFactId = '44444444-4444-4444-8444-444444444444';
const tradeId = 'trade:trade-projection-v1:account-actual:AAPL.US:baseline-1';

const command = (overrides: Record<string, unknown> = {}) => ({
  command: 'CREATE_TRADE_OPENING_BOUNDARY_ASSERTION' as const,
  accountId,
  occurredAt: '2026-01-01T09:30:00.000Z',
  timePrecision: 'INSTANT' as const,
  sourceTimezone: 'Asia/Shanghai',
  economicOrderKey: 'opening-boundary-1',
  payload: { symbol: 'AAPL.US', baselineFactId },
  source: { category: 'MANUAL' as const, channel: 'desktop-test', externalId: 'opening-1' },
  actorId: 'test-user',
  reason: '券商历史账单显示首次买入时间',
  ...overrides,
});

const targetTrade = (overrides: Record<string, unknown> = {}) => ({
  accountId,
  symbol: 'AAPL.US',
  openedAt: null,
  earliestEvidenceAt: new Date('2026-01-02T00:00:00.000Z'),
  entryLegs: [],
  baselineComponents: [{ factId: baselineFactId, quantity: new Prisma.Decimal('400') }],
  ...overrides,
});

const writeHarness = (options: { existingEvent?: unknown; trade?: unknown } = {}) => {
  const transaction = {
    ledgerEvent: { findUnique: vi.fn().mockResolvedValue(options.existingEvent ?? null) },
    trade: { findUnique: vi.fn().mockResolvedValue(options.trade ?? targetTrade()) },
  };
  const context: AccountLedgerWriteContext = {
    transaction: transaction as never,
    accountId,
    currentLedgerRevision: 1n,
    nextLedgerRevision: 2n,
    currentProjectionGeneration: 4n,
    nextProjectionGeneration: 5n,
  };
  const appendRevision = vi.fn(async (_context: unknown, event: unknown) => event);
  const repository = {
    withAccountWrite: vi.fn(
      async (
        _accountId: string,
        operation: (context: AccountLedgerWriteContext) => Promise<{
          value: unknown;
          advanceRevision: boolean;
        }>,
      ) => {
        const mutation = await operation(context);
        return {
          value: mutation.value,
          ledgerRevision: mutation.advanceRevision ? '2' : '1',
          projectionGeneration: mutation.advanceRevision ? '5' : '4',
        };
      },
    ),
    appendRevision,
  };
  return { transaction, context, appendRevision, repository };
};

const storedAssertion = () => ({
  id: eventId,
  accountId,
  type: 'TRADE_OPENING_BOUNDARY_ASSERTION',
  factId: assertionFactId,
  ledgerRevision: 2n,
  occurredAt: new Date('2026-01-01T09:30:00.000Z'),
  timePrecision: 'INSTANT',
  sourceTimezone: 'Asia/Shanghai',
  economicOrderKey: 'opening-boundary-1',
  recordedAt: new Date('2026-01-03T00:00:00.000Z'),
  payloadVersion: 1,
  payload: { symbol: 'AAPL.US', tradeId, baselineFactId },
  sourceCategory: 'MANUAL',
  sourceChannel: 'desktop-test',
  externalId: 'opening-1',
  sourceRowId: null,
  actorId: 'test-user',
  revisionAction: 'CREATE',
  supersedesEventId: null,
  reason: '券商历史账单显示首次买入时间',
  projectionGeneration: 7n,
});

describe('TradeOpeningBoundaryCommandService', () => {
  it('只为符合条件的 Baseline-only Trade 写入事件并重建投影', async () => {
    vi.mocked(rebuildLedgerProjection).mockClear();
    const harness = writeHarness();
    const service = new TradeOpeningBoundaryCommandService(harness.repository as never);

    const response = await service.createOpeningBoundary(tradeId, command());

    expect(response).toMatchObject({
      factIds: [expect.any(String)],
      ledgerRevisions: { [accountId]: '2' },
      projectionGenerations: { [accountId]: '5' },
      affectedSymbols: ['AAPL.US'],
      idempotentReplay: false,
    });
    expect(harness.appendRevision).toHaveBeenCalledOnce();
    const event = harness.appendRevision.mock.calls[0]?.[1] as {
      type: string;
      payload: { tradeId: string; baselineFactId: string };
    };
    expect(event).toMatchObject({
      type: 'TRADE_OPENING_BOUNDARY_ASSERTION',
      payload: { tradeId, baselineFactId },
    });
    expect(rebuildLedgerProjection).toHaveBeenCalledWith(harness.transaction, accountId, 'AVG', 5n);
  });

  it('相同来源幂等键和内容直接重放，不重复写入或重建', async () => {
    vi.mocked(rebuildLedgerProjection).mockClear();
    const harness = writeHarness({ existingEvent: storedAssertion() });
    const service = new TradeOpeningBoundaryCommandService(harness.repository as never);

    const response = await service.createOpeningBoundary(tradeId, command());

    expect(response).toMatchObject({
      eventIds: [eventId],
      factIds: [assertionFactId],
      projectionGenerations: { [accountId]: '7' },
      idempotentReplay: true,
    });
    expect(harness.appendRevision).not.toHaveBeenCalled();
    expect(rebuildLedgerProjection).not.toHaveBeenCalled();
  });

  it.each([
    ['已有真实建仓成交', { entryLegs: [{ id: 'entry-1' }] }, undefined],
    ['已有建仓时间', { openedAt: new Date('2026-01-01T00:00:00.000Z') }, undefined],
    ['补录时间晚于最早证据', {}, '2026-01-03T09:30:00.000Z'],
  ] as const)('拒绝%s', async (_label, tradeOverrides, occurredAt) => {
    const harness = writeHarness({ trade: targetTrade(tradeOverrides) });
    const service = new TradeOpeningBoundaryCommandService(harness.repository as never);
    const rawCommand = occurredAt === undefined ? command() : command({ occurredAt });

    await expect(service.createOpeningBoundary(tradeId, rawCommand)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(harness.appendRevision).not.toHaveBeenCalled();
  });
});
