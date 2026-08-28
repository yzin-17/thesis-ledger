import { describe, expect, it, vi } from 'vitest';
import { ledgerEventEnvelopeSchemaV2, type LedgerEventV2 } from '@thesis-ledger/schemas';
import { BaselineReconciliationService } from '../../src/ledger/baseline-reconciliation.service.js';
import {
  generateBaselineReconciliationCandidates,
  type BaselineReconciliationBaseline,
  type BaselineReconciliationEngineInput,
  type BaselineReconciliationExecution,
} from '../../src/ledger/baseline-reconciliation.js';
import { latestLedgerEventByFact } from '../../src/ledger/ledger-event-v2.js';
import { toLedgerEventV2 } from '../../src/ledger/ledger-v2.repository.js';
import type {
  AccountLedgerMutation,
  AccountLedgerWriteContext,
  AccountLedgerWriteResult,
} from '../../src/ledger/ledger-v2.repository.js';

vi.mock('../../src/ledger/ledger-projection.js', () => ({
  rebuildLedgerProjection: vi.fn(async () => undefined),
}));

const accountA = '11111111-1111-4111-8111-111111111111';
const baselineOneFactId = '11111111-1111-4111-8111-111111111101';
const baselineTwoFactId = '11111111-1111-4111-8111-111111111102';
const executionOneFactId = '11111111-1111-4111-8111-111111111201';
const executionTwoFactId = '11111111-1111-4111-8111-111111111202';

const makeBaseline = (
  overrides: Partial<BaselineReconciliationBaseline> = {},
): BaselineReconciliationBaseline => ({
  factId: baselineOneFactId,
  accountId: accountA,
  symbol: 'AAPL.US',
  occurredAt: '2026-08-26T03:00:00.000Z',
  timePrecision: 'INSTANT',
  sourceTimezone: 'UTC',
  economicOrderKey: 'baseline-1',
  quantity: '150',
  averageCost: '10',
  currency: 'USD',
  ...overrides,
});

const makeExecution = (
  overrides: Partial<BaselineReconciliationExecution> = {},
): BaselineReconciliationExecution => ({
  factId: executionOneFactId,
  accountId: accountA,
  symbol: 'AAPL.US',
  side: 'BUY',
  occurredAt: '2026-08-26T01:00:00.000Z',
  economicOrderKey: 'execution-1',
  quantity: '100',
  price: '10',
  currency: 'USD',
  charges: [],
  ...overrides,
});

const makeBaselineEvent = (input: {
  eventId: string;
  factId: string;
  ledgerRevision: string;
  occurredAt?: string | null;
  timePrecision?: 'INSTANT' | 'DATE';
  sourceTimezone?: string;
  quantity?: string;
  averageCost?: string;
  economicOrderKey?: string;
  sourceExternalId?: string;
}) =>
  ledgerEventEnvelopeSchemaV2.parse({
    version: 2,
    eventId: input.eventId,
    factId: input.factId,
    accountId: accountA,
    ledgerRevision: input.ledgerRevision,
    type: 'POSITION_BASELINE_OBSERVATION',
    occurredAt: input.occurredAt ?? '2026-08-26T03:00:00.000Z',
    timePrecision: input.timePrecision ?? 'INSTANT',
    sourceTimezone: input.sourceTimezone ?? 'UTC',
    economicOrderKey: input.economicOrderKey ?? 'baseline-1',
    recordedAt: '2026-08-26T03:01:00.000Z',
    payloadVersion: 1,
    source: {
      category: 'MANUAL',
      channel: 'desktop',
      externalId: input.sourceExternalId ?? `baseline-${input.factId}`,
    },
    actorId: 'user-1',
    revisionAction: 'CREATE',
    payload: {
      symbol: 'AAPL.US',
      batchId: '22222222-2222-4222-8222-222222222222',
      batchScope: 'PARTIAL',
      quantity: input.quantity ?? '10',
      averageCost: input.averageCost ?? '10',
      currency: 'USD',
      costIncludesFees: 'UNKNOWN',
    },
  });

const makeBuyEvent = (input: {
  eventId: string;
  factId: string;
  ledgerRevision: string;
  occurredAt?: string | null;
  timePrecision?: 'INSTANT' | 'DATE';
  sourceTimezone?: string;
  quantity?: string;
  price?: string;
  economicOrderKey?: string;
  sourceExternalId?: string;
}) =>
  ledgerEventEnvelopeSchemaV2.parse({
    version: 2,
    eventId: input.eventId,
    factId: input.factId,
    accountId: accountA,
    ledgerRevision: input.ledgerRevision,
    type: 'BUY_EXECUTION',
    occurredAt: input.occurredAt ?? '2026-08-26T01:00:00.000Z',
    timePrecision: input.timePrecision ?? 'INSTANT',
    sourceTimezone: input.sourceTimezone ?? 'UTC',
    economicOrderKey: input.economicOrderKey ?? 'execution-1',
    recordedAt: '2026-08-26T01:01:00.000Z',
    payloadVersion: 1,
    source: {
      category: 'MANUAL',
      channel: 'desktop',
      externalId: input.sourceExternalId ?? `execution-${input.factId}`,
    },
    actorId: 'user-1',
    revisionAction: 'CREATE',
    payload: {
      symbol: 'AAPL.US',
      quantity: input.quantity ?? '10',
      price: input.price ?? '10',
      currency: 'USD',
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

const effectiveEvents = (events: readonly LedgerEventV2[]) =>
  [...latestLedgerEventByFact(events.map(storedFromEvent)).values()]
    .map(toLedgerEventV2)
    .filter((event) => event.revisionAction !== 'VOID');

const createRepositoryHarness = (initialEvents: readonly LedgerEventV2[]) => {
  const events = [...initialEvents];
  let ledgerRevision = initialEvents.reduce(
    (maximum, event) =>
      BigInt(event.ledgerRevision) > maximum ? BigInt(event.ledgerRevision) : maximum,
    0n,
  );
  let projectionGeneration = ledgerRevision;
  const ledgerEvent = {
    findMany: vi.fn(async () => events.map(storedFromEvent)),
    findUnique: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      let event: LedgerEventV2 | undefined;
      if (typeof where.id === 'string')
        event = events.find((candidate) => candidate.eventId === where.id);
      else if (typeof where.supersedesEventId === 'string')
        event = events.find((candidate) => candidate.supersedesEventId === where.supersedesEventId);
      else if (where.accountId_sourceChannel_externalId) {
        const key = where.accountId_sourceChannel_externalId as {
          accountId: string;
          sourceChannel: string;
          externalId: string;
        };
        event = events.find(
          (candidate) =>
            candidate.accountId === key.accountId &&
            candidate.source.channel === key.sourceChannel &&
            candidate.source.externalId === key.externalId,
        );
      }
      return event ? storedFromEvent(event) : null;
    }),
  };
  const transaction = { ledgerEvent };
  const withAccountWrite = async <T>(
    accountId: string,
    operation: (context: AccountLedgerWriteContext) => Promise<AccountLedgerMutation<T>>,
  ): Promise<AccountLedgerWriteResult<T>> => {
    const beforeEvents = [...events];
    const beforeRevision = ledgerRevision;
    const beforeGeneration = projectionGeneration;
    const context: AccountLedgerWriteContext = {
      transaction: transaction as never,
      accountId,
      currentLedgerRevision: ledgerRevision,
      nextLedgerRevision: ledgerRevision + 1n,
      currentProjectionGeneration: projectionGeneration,
      nextProjectionGeneration: projectionGeneration + 1n,
    };
    try {
      const mutation = await operation(context);
      if (mutation.advanceRevision) {
        ledgerRevision += 1n;
        projectionGeneration += 1n;
      }
      return {
        value: mutation.value,
        ledgerRevision: ledgerRevision.toString(),
        projectionGeneration: projectionGeneration.toString(),
      };
    } catch (error) {
      events.splice(0, events.length, ...beforeEvents);
      ledgerRevision = beforeRevision;
      projectionGeneration = beforeGeneration;
      throw error;
    }
  };
  const appendRevision = vi.fn(async (_context: AccountLedgerWriteContext, rawEvent: unknown) => {
    const event = ledgerEventEnvelopeSchemaV2.parse(rawEvent);
    events.push(event);
    return event;
  });
  const repository = {
    readEffectiveEvents: vi.fn(async () => effectiveEvents(events)),
    withAccountWrite,
    appendRevision,
  };
  return {
    service: new BaselineReconciliationService(repository as never),
    events,
    repository,
  };
};

const errorCode = async (operation: Promise<unknown>) => {
  try {
    await operation;
  } catch (error) {
    const response = (error as { getResponse?: () => unknown }).getResponse?.();
    return (response as { errorCode?: string } | undefined)?.errorCode;
  }
  throw new Error('期望命令失败');
};

describe('Baseline Reconciliation deterministic engine', () => {
  it('生成部分和完整覆盖候选，并且重复计算结果稳定', () => {
    const input: BaselineReconciliationEngineInput = {
      baselines: [makeBaseline()],
      executions: [
        makeExecution(),
        makeExecution({
          factId: executionTwoFactId,
          occurredAt: '2026-08-26T02:00:00.000Z',
          economicOrderKey: 'execution-2',
          quantity: '50',
        }),
      ],
      reconciliations: [],
    };

    const first = generateBaselineReconciliationCandidates(input);
    const second = generateBaselineReconciliationCandidates(input);
    const reversed = generateBaselineReconciliationCandidates({
      ...input,
      executions: [...input.executions].reverse(),
    });

    expect(first).toEqual(second);
    expect(reversed).toEqual(first);
    expect(first.candidates).toMatchObject([
      {
        executionFactIds: [executionOneFactId],
        coveredQuantity: '100',
        coveredCost: '1000',
        remainingQuantity: '50',
        remainingCost: '500',
        status: 'AVAILABLE',
      },
      {
        executionFactIds: [executionOneFactId, executionTwoFactId],
        coveredQuantity: '150',
        coveredCost: '1500',
        remainingQuantity: '0',
        remainingCost: '0',
        status: 'AVAILABLE',
      },
    ]);
  });

  it('从较早检查点向后重放，已确认成交不会在后续检查点重复候选', () => {
    const baselineOne = makeBaseline({
      factId: baselineOneFactId,
      occurredAt: '2026-08-26T02:00:00.000Z',
      quantity: '100',
      economicOrderKey: 'baseline-1',
    });
    const baselineTwo = makeBaseline({
      factId: baselineTwoFactId,
      occurredAt: '2026-08-26T04:00:00.000Z',
      quantity: '150',
      economicOrderKey: 'baseline-2',
    });
    const input: BaselineReconciliationEngineInput = {
      baselines: [baselineOne, baselineTwo],
      executions: [
        makeExecution({ quantity: '100' }),
        makeExecution({
          factId: executionTwoFactId,
          occurredAt: '2026-08-26T03:00:00.000Z',
          economicOrderKey: 'execution-2',
          quantity: '50',
        }),
      ],
      reconciliations: [
        {
          factId: '11111111-1111-4111-8111-111111111301',
          baselineFactId: baselineOneFactId,
          executionFactIds: [executionOneFactId],
        },
      ],
    };

    const result = generateBaselineReconciliationCandidates(input);
    const laterCheckpoint = result.checkpoints.find(
      (checkpoint) => checkpoint.baselineFactId === baselineTwoFactId,
    );

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      baselineFactId: baselineTwoFactId,
      executionFactIds: [executionTwoFactId],
      coveredQuantity: '150',
      coveredCost: '1500',
      status: 'AVAILABLE',
    });
    expect(laterCheckpoint).toMatchObject({
      reconciledExecutionFactIds: [executionOneFactId],
      reconciledActualQuantity: '100',
      remainingQuantity: '50',
      status: 'PARTIAL',
    });
  });

  it('按成交时间重放卖出，超额或负残量只产生显式冲突', () => {
    const completeInput: BaselineReconciliationEngineInput = {
      baselines: [makeBaseline({ quantity: '80', occurredAt: '2026-08-26T04:00:00.000Z' })],
      executions: [
        makeExecution({ quantity: '100' }),
        makeExecution({
          factId: executionTwoFactId,
          side: 'SELL',
          occurredAt: '2026-08-26T02:00:00.000Z',
          economicOrderKey: 'execution-2',
          quantity: '20',
          price: '12',
        }),
      ],
      reconciliations: [],
    };
    const complete = generateBaselineReconciliationCandidates(completeInput);
    expect(complete.candidates.at(-1)).toMatchObject({
      executionFactIds: [executionOneFactId, executionTwoFactId],
      coveredQuantity: '80',
      coveredCost: '800',
      remainingQuantity: '0',
      remainingCost: '0',
      status: 'AVAILABLE',
    });

    const conflict = generateBaselineReconciliationCandidates({
      ...completeInput,
      baselines: [makeBaseline({ quantity: '50' })],
      executions: [makeExecution({ quantity: '100' })],
    });
    expect(conflict.candidates[0]).toMatchObject({
      status: 'CONFLICTED',
      conflictReasons: expect.arrayContaining([
        'NEGATIVE_REMAINING_QUANTITY',
        'NEGATIVE_REMAINING_COST',
      ]),
    });
  });
});

describe('BaselineReconciliationService', () => {
  it('候选查询不写账本，确认可幂等重放并支持作废恢复', async () => {
    const baseline = makeBaselineEvent({
      eventId: '33333333-3333-4333-8333-333333333301',
      factId: baselineOneFactId,
      ledgerRevision: '1',
      occurredAt: '2026-08-26',
      timePrecision: 'DATE',
      sourceTimezone: 'Asia/Shanghai',
      economicOrderKey: 'z-baseline-1',
    });
    const execution = makeBuyEvent({
      eventId: '33333333-3333-4333-8333-333333333302',
      factId: executionOneFactId,
      ledgerRevision: '2',
      occurredAt: '2026-08-25',
      timePrecision: 'DATE',
      sourceTimezone: 'Asia/Shanghai',
      economicOrderKey: 'a-execution-1',
    });
    const harness = createRepositoryHarness([baseline, execution]);
    const command = {
      command: 'CONFIRM_BASELINE_RECONCILIATION',
      accountId: accountA,
      baselineFactId: baselineOneFactId,
      executionFactIds: [executionOneFactId],
      coveredQuantity: '10',
      coveredCost: '100',
      ruleVersion: 1,
      expectedLedgerRevision: '2',
      source: { category: 'MANUAL', channel: 'desktop', externalId: 'reconcile-1' },
      actorId: 'user-1',
      reason: '确认历史成交覆盖',
    } as const;

    const preview = await harness.service.candidates(accountA);
    expect(preview.candidates).toHaveLength(1);
    expect(harness.repository.appendRevision).not.toHaveBeenCalled();

    const confirmed = await harness.service.confirm(command);
    expect(confirmed).toMatchObject({
      idempotentReplay: false,
      ledgerRevisions: { [accountA]: '3' },
    });
    expect(harness.events.at(-1)).toMatchObject({
      type: 'BASELINE_RECONCILIATION',
      revisionAction: 'CREATE',
      timePrecision: 'DATE',
      sourceTimezone: 'Asia/Shanghai',
      payload: {
        baselineFactId: baselineOneFactId,
        executionFactIds: [executionOneFactId],
        coveredQuantity: '10',
        coveredCost: '100',
        ruleVersion: 1,
      },
    });
    const reconciliationEventId = confirmed.eventIds[0]!;

    await expect(harness.service.confirm(command)).resolves.toMatchObject({
      idempotentReplay: true,
      eventIds: [reconciliationEventId],
      ledgerRevisions: { [accountA]: '3' },
    });
    expect(harness.repository.appendRevision).toHaveBeenCalledTimes(1);

    const voided = await harness.service.void({
      command: 'VOID_BASELINE_RECONCILIATION',
      accountId: accountA,
      expectedLedgerRevision: '3',
      supersedesEventId: reconciliationEventId,
      source: { category: 'MANUAL', channel: 'desktop', externalId: 'reconcile-void-1' },
      actorId: 'user-1',
      reason: '撤销错误对账',
    });
    expect(voided).toMatchObject({ idempotentReplay: false, ledgerRevisions: { [accountA]: '4' } });
    const voidEventId = voided.eventIds[0]!;
    expect(harness.events.at(-1)).toMatchObject({
      type: 'BASELINE_RECONCILIATION',
      revisionAction: 'VOID',
      supersedesEventId: reconciliationEventId,
    });

    const restored = await harness.service.restore({
      command: 'RESTORE_BASELINE_RECONCILIATION',
      accountId: accountA,
      expectedLedgerRevision: '4',
      supersedesEventId: voidEventId,
      source: { category: 'MANUAL', channel: 'desktop', externalId: 'reconcile-restore-1' },
      actorId: 'user-1',
      reason: '恢复正确对账',
    });
    expect(restored).toMatchObject({
      idempotentReplay: false,
      ledgerRevisions: { [accountA]: '5' },
    });
    expect(harness.events.at(-1)).toMatchObject({
      type: 'BASELINE_RECONCILIATION',
      revisionAction: 'RESTORE',
      supersedesEventId: voidEventId,
      payload: {
        baselineFactId: baselineOneFactId,
        executionFactIds: [executionOneFactId],
      },
    });
  });

  it('拒绝把同一成交再次确认给另一个 Baseline', async () => {
    const baselineOne = makeBaselineEvent({
      eventId: '33333333-3333-4333-8333-333333333311',
      factId: baselineOneFactId,
      ledgerRevision: '1',
      occurredAt: '2026-08-26T02:00:00.000Z',
    });
    const baselineTwo = makeBaselineEvent({
      eventId: '33333333-3333-4333-8333-333333333312',
      factId: baselineTwoFactId,
      ledgerRevision: '2',
      occurredAt: '2026-08-26T03:00:00.000Z',
      economicOrderKey: 'baseline-2',
      sourceExternalId: 'baseline-2',
    });
    const execution = makeBuyEvent({
      eventId: '33333333-3333-4333-8333-333333333313',
      factId: executionOneFactId,
      ledgerRevision: '3',
    });
    const harness = createRepositoryHarness([baselineOne, baselineTwo, execution]);
    await harness.service.confirm({
      command: 'CONFIRM_BASELINE_RECONCILIATION',
      accountId: accountA,
      baselineFactId: baselineOneFactId,
      executionFactIds: [executionOneFactId],
      coveredQuantity: '10',
      coveredCost: '100',
      ruleVersion: 1,
      expectedLedgerRevision: '3',
      source: { category: 'MANUAL', channel: 'desktop', externalId: 'reconcile-first' },
      actorId: 'user-1',
      reason: '确认第一条基线',
    });

    await expect(
      errorCode(
        harness.service.confirm({
          command: 'CONFIRM_BASELINE_RECONCILIATION',
          accountId: accountA,
          baselineFactId: baselineTwoFactId,
          executionFactIds: [executionOneFactId],
          coveredQuantity: '10',
          coveredCost: '100',
          ruleVersion: 1,
          expectedLedgerRevision: '4',
          source: { category: 'MANUAL', channel: 'desktop', externalId: 'reconcile-duplicate' },
          actorId: 'user-1',
          reason: '重复确认',
        }),
      ),
    ).resolves.toBe('LEDGER_VALIDATION_FAILED');
    expect(harness.repository.appendRevision).toHaveBeenCalledTimes(1);
  });
});
