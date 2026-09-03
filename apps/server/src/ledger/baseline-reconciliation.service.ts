import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  baselineReconciliationCandidatesResponseSchemaV2,
  confirmBaselineReconciliationCommandSchemaV2,
  ledgerCommandResponseSchemaV2,
  restoreBaselineReconciliationCommandSchemaV2,
  type BaselineReconciliationCandidatesResponseV2,
  type ConfirmBaselineReconciliationCommandV2,
  type LedgerCommandResponseV2,
  type LedgerEventV2,
  type RestoreBaselineReconciliationCommandV2,
  type VoidBaselineReconciliationCommandV2,
  voidBaselineReconciliationCommandSchemaV2,
} from '@thesis-ledger/schemas';
import { isEqual } from 'es-toolkit';
import {
  generateBaselineReconciliationCandidates,
  type ActiveBaselineReconciliation,
  type BaselineReconciliationBaseline,
  type BaselineReconciliationEngineInput,
  type BaselineReconciliationExecution,
} from './baseline-reconciliation.js';
import { latestLedgerEventByFact } from './ledger-event-v2.js';
import {
  LedgerV2Repository,
  toLedgerEventV2,
  type AccountLedgerWriteContext,
} from './ledger-v2.repository.js';
import { rebuildLedgerProjection } from './ledger-projection.js';

type ReconciliationPayloadEvent = Extract<
  LedgerEventV2,
  { type: 'BASELINE_RECONCILIATION'; revisionAction: 'CREATE' | 'REPLACE' | 'RESTORE' }
>;
type ReconciliationVoidEvent = Extract<LedgerEventV2, { revisionAction: 'VOID' }> & {
  type: 'BASELINE_RECONCILIATION';
};
type ReconciliationEvent = ReconciliationPayloadEvent | ReconciliationVoidEvent;
type BaselinePayloadEvent = Extract<
  LedgerEventV2,
  { type: 'POSITION_BASELINE_OBSERVATION'; revisionAction: 'CREATE' | 'REPLACE' | 'RESTORE' }
>;
type ExecutionPayloadEvent = Extract<
  LedgerEventV2,
  {
    type: 'BUY_EXECUTION' | 'SELL_EXECUTION';
    revisionAction: 'CREATE' | 'REPLACE' | 'RESTORE';
  }
>;

type ReconciliationMutation = {
  event: LedgerEventV2;
  replay: boolean;
  projectionGeneration?: string;
};

const conflict = (message: string, details?: Record<string, unknown>) =>
  new ConflictException({
    errorCode: 'LEDGER_VALIDATION_FAILED',
    message,
    ...(details === undefined ? {} : { details }),
  });

const eventCommandFingerprint = (event: LedgerEventV2) => ({
  accountId: event.accountId,
  type: event.type,
  occurredAt: event.occurredAt,
  timePrecision: event.timePrecision,
  sourceTimezone: event.sourceTimezone,
  source: event.source,
  actorId: event.actorId,
  revisionAction: event.revisionAction,
  supersedesEventId: event.supersedesEventId,
  reason: event.reason,
  ...(event.revisionAction === 'VOID' ? {} : { payload: event.payload }),
});

const isBaselineEvent = (event: LedgerEventV2): event is BaselinePayloadEvent =>
  event.type === 'POSITION_BASELINE_OBSERVATION' && event.revisionAction !== 'VOID';

const isExecutionEvent = (event: LedgerEventV2): event is ExecutionPayloadEvent =>
  (event.type === 'BUY_EXECUTION' || event.type === 'SELL_EXECUTION') &&
  event.revisionAction !== 'VOID';

const isReconciliationEvent = (event: LedgerEventV2): event is ReconciliationEvent =>
  event.type === 'BASELINE_RECONCILIATION';

const isReconciliationPayloadEvent = (event: LedgerEventV2): event is ReconciliationPayloadEvent =>
  event.type === 'BASELINE_RECONCILIATION' && event.revisionAction !== 'VOID';

const toEngineInput = (events: readonly LedgerEventV2[]): BaselineReconciliationEngineInput => {
  const baselines: BaselineReconciliationBaseline[] = events
    .filter(isBaselineEvent)
    .map((event) => ({
      factId: event.factId,
      accountId: event.accountId,
      symbol: event.payload.symbol,
      occurredAt: event.occurredAt,
      timePrecision: event.timePrecision,
      sourceTimezone: event.sourceTimezone,
      economicOrderKey: event.economicOrderKey,
      quantity: event.payload.quantity,
      ...(event.payload.averageCost === undefined
        ? {}
        : { averageCost: event.payload.averageCost }),
      currency: event.payload.currency,
    }));
  const executions: BaselineReconciliationExecution[] = events
    .filter(isExecutionEvent)
    .map((event) => ({
      factId: event.factId,
      accountId: event.accountId,
      symbol: event.payload.symbol,
      side: event.type === 'BUY_EXECUTION' ? 'BUY' : 'SELL',
      occurredAt: event.occurredAt,
      economicOrderKey: event.economicOrderKey,
      quantity: event.payload.quantity,
      price: event.payload.price,
      currency: event.payload.currency,
      charges: event.payload.charges.map((charge) => ({
        amount: charge.amount,
        currency: charge.currency,
      })),
    }));
  const reconciliations: ActiveBaselineReconciliation[] = events
    .filter(isReconciliationPayloadEvent)
    .map((event) => ({
      factId: event.factId,
      baselineFactId: event.payload.baselineFactId,
      executionFactIds: event.payload.executionFactIds,
    }));
  return { baselines, executions, reconciliations };
};

const readEffectiveEventsInTransaction = async (
  transaction: Prisma.TransactionClient,
  accountId: string,
) => {
  const stored = await transaction.ledgerEvent.findMany({
    where: { accountId, factId: { not: null } },
    orderBy: [{ ledgerRevision: 'asc' }, { createdAt: 'asc' }],
  });
  return [...latestLedgerEventByFact(stored.map(toLedgerEventV2)).values()].filter(
    (event) => event.revisionAction !== 'VOID',
  );
};

const sameExecutionIds = (left: readonly string[], right: readonly string[]) =>
  isEqual(left, right);

const assertExpectedRevision = (
  context: AccountLedgerWriteContext,
  expectedLedgerRevision: string,
) => {
  if (context.currentLedgerRevision.toString() === expectedLedgerRevision) return;
  throw new ConflictException({
    errorCode: 'LEDGER_REVISION_CONFLICT',
    message: '账本已变更，请刷新后重试',
    accountId: context.accountId,
    currentLedgerRevision: context.currentLedgerRevision.toString(),
  });
};

@Injectable()
export class BaselineReconciliationService {
  constructor(private readonly repository: LedgerV2Repository) {}

  async candidates(accountId: string): Promise<BaselineReconciliationCandidatesResponseV2> {
    const events = await this.repository.readEffectiveEvents(accountId);
    const input = toEngineInput(events);
    return baselineReconciliationCandidatesResponseSchemaV2.parse({
      accountId,
      ...generateBaselineReconciliationCandidates(input),
    });
  }

  async confirm(rawCommand: unknown): Promise<LedgerCommandResponseV2> {
    const command = confirmBaselineReconciliationCommandSchemaV2.parse(rawCommand);
    const result = await this.repository.withAccountWrite<ReconciliationMutation>(
      command.accountId,
      async (context) => {
        const events = await readEffectiveEventsInTransaction(
          context.transaction,
          command.accountId,
        );
        const input = toEngineInput(events);
        const baseline = input.baselines.find((item) => item.factId === command.baselineFactId);
        if (!baseline) throw new NotFoundException('找不到可对账的持仓快照');
        const desired = this.createConfirmationEvent(command, context, baseline);
        const replay = await this.findIdempotentReplay(context, desired);
        if (replay)
          return {
            value: {
              event: replay.event,
              replay: true,
              projectionGeneration: replay.projectionGeneration,
            },
            advanceRevision: false,
          };

        const candidates = generateBaselineReconciliationCandidates(input);
        const candidate = candidates.candidates.find(
          (item) =>
            item.baselineFactId === command.baselineFactId &&
            sameExecutionIds(item.executionFactIds, command.executionFactIds) &&
            item.coveredQuantity === command.coveredQuantity &&
            item.coveredCost === command.coveredCost &&
            item.status === 'AVAILABLE',
        );
        if (!candidate)
          throw conflict('对账候选已失效、存在冲突或与当前账本不匹配', {
            baselineFactId: command.baselineFactId,
            executionFactIds: command.executionFactIds,
          });
        assertExpectedRevision(context, command.expectedLedgerRevision);
        const event = await this.repository.appendRevision(context, desired);
        await rebuildLedgerProjection(
          context.transaction,
          command.accountId,
          'AVG',
          context.nextProjectionGeneration,
        );
        return { value: { event, replay: false }, advanceRevision: true };
      },
    );
    return this.eventResponse(result.value, result);
  }

  async void(rawCommand: unknown): Promise<LedgerCommandResponseV2> {
    const command = voidBaselineReconciliationCommandSchemaV2.parse(rawCommand);
    return this.correct(command);
  }

  async restore(rawCommand: unknown): Promise<LedgerCommandResponseV2> {
    const command = restoreBaselineReconciliationCommandSchemaV2.parse(rawCommand);
    return this.correct(command);
  }

  private async correct(
    command: VoidBaselineReconciliationCommandV2 | RestoreBaselineReconciliationCommandV2,
  ): Promise<LedgerCommandResponseV2> {
    const result = await this.repository.withAccountWrite<ReconciliationMutation>(
      command.accountId,
      async (context) => {
        const target = await this.requireEvent(context, command.supersedesEventId);
        if (!isReconciliationEvent(target)) throw conflict('只能修正快照对账事件');
        const desired =
          command.command === 'VOID_BASELINE_RECONCILIATION'
            ? this.createVoidEvent(command, context, target)
            : await this.createRestoreEvent(command, context, target);
        const replay = await this.findIdempotentReplay(context, desired);
        if (replay)
          return {
            value: {
              event: replay.event,
              replay: true,
              projectionGeneration: replay.projectionGeneration,
            },
            advanceRevision: false,
          };
        if (command.command === 'VOID_BASELINE_RECONCILIATION' && target.revisionAction === 'VOID')
          throw conflict('已作废的对账事件只能恢复');
        if (
          command.command === 'RESTORE_BASELINE_RECONCILIATION' &&
          target.revisionAction !== 'VOID'
        )
          throw conflict('只能恢复当前链末为 VOID 的对账事件');
        await this.assertChainTip(context, target.eventId);
        assertExpectedRevision(context, command.expectedLedgerRevision);
        const event = await this.repository.appendRevision(context, desired);
        await rebuildLedgerProjection(
          context.transaction,
          command.accountId,
          'AVG',
          context.nextProjectionGeneration,
        );
        return { value: { event, replay: false }, advanceRevision: true };
      },
    );
    return this.eventResponse(result.value, result);
  }

  private createConfirmationEvent(
    command: ConfirmBaselineReconciliationCommandV2,
    context: AccountLedgerWriteContext,
    baseline: BaselineReconciliationBaseline,
  ): ReconciliationPayloadEvent {
    const recordedAt = new Date().toISOString();
    return {
      version: 2,
      eventId: randomUUID(),
      factId: randomUUID(),
      accountId: command.accountId,
      ledgerRevision: context.nextLedgerRevision.toString(),
      type: 'BASELINE_RECONCILIATION',
      occurredAt: baseline.occurredAt,
      timePrecision: baseline.timePrecision,
      sourceTimezone: baseline.sourceTimezone,
      economicOrderKey: `reconciliation:${command.baselineFactId}:${context.nextLedgerRevision.toString()}`,
      recordedAt,
      payloadVersion: 1,
      source: command.source,
      actorId: command.actorId,
      revisionAction: 'CREATE',
      reason: command.reason,
      payload: {
        symbol: baseline.symbol,
        baselineFactId: command.baselineFactId,
        executionFactIds: command.executionFactIds,
        coveredQuantity: command.coveredQuantity,
        coveredCost: command.coveredCost,
        ruleVersion: command.ruleVersion,
      },
    };
  }

  private createVoidEvent(
    command: VoidBaselineReconciliationCommandV2,
    context: AccountLedgerWriteContext,
    target: ReconciliationEvent,
  ): ReconciliationVoidEvent {
    return {
      version: 2,
      eventId: randomUUID(),
      factId: target.factId,
      accountId: command.accountId,
      ledgerRevision: context.nextLedgerRevision.toString(),
      type: 'BASELINE_RECONCILIATION',
      occurredAt: target.occurredAt,
      timePrecision: target.timePrecision,
      sourceTimezone: target.sourceTimezone,
      economicOrderKey: `reconciliation-void:${target.factId}:${context.nextLedgerRevision.toString()}`,
      recordedAt: new Date().toISOString(),
      payloadVersion: target.payloadVersion,
      source: command.source,
      actorId: command.actorId,
      revisionAction: 'VOID',
      supersedesEventId: target.eventId,
      reason: command.reason,
    };
  }

  private async createRestoreEvent(
    command: RestoreBaselineReconciliationCommandV2,
    context: AccountLedgerWriteContext,
    target: ReconciliationEvent,
  ): Promise<ReconciliationPayloadEvent> {
    if (target.revisionAction !== 'VOID') throw conflict('只能恢复当前链末为 VOID 的对账事件');
    const previous = await this.requireEvent(context, target.supersedesEventId);
    if (previous.type !== 'BASELINE_RECONCILIATION' || previous.revisionAction === 'VOID')
      throw conflict('对账 VOID 缺少可恢复的完整载荷');
    const activeEvents = await readEffectiveEventsInTransaction(
      context.transaction,
      command.accountId,
    );
    const activeInput = toEngineInput(activeEvents);
    const usedExecutionFactIds = new Set(
      activeInput.reconciliations
        .filter((item) => item.factId !== previous.factId)
        .flatMap((item) => item.executionFactIds),
    );
    const duplicateExecutionFactIds = previous.payload.executionFactIds.filter((factId) =>
      usedExecutionFactIds.has(factId),
    );
    if (duplicateExecutionFactIds.length > 0)
      throw conflict('恢复对账会重复纳入已覆盖成交', { duplicateExecutionFactIds });
    return {
      version: 2,
      eventId: randomUUID(),
      factId: previous.factId,
      accountId: command.accountId,
      ledgerRevision: context.nextLedgerRevision.toString(),
      type: 'BASELINE_RECONCILIATION',
      occurredAt: previous.occurredAt,
      timePrecision: previous.timePrecision,
      sourceTimezone: previous.sourceTimezone,
      economicOrderKey: `reconciliation-restore:${previous.factId}:${context.nextLedgerRevision.toString()}`,
      recordedAt: new Date().toISOString(),
      payloadVersion: previous.payloadVersion,
      source: command.source,
      actorId: command.actorId,
      revisionAction: 'RESTORE',
      supersedesEventId: target.eventId,
      reason: command.reason,
      payload: previous.payload,
    };
  }

  private async requireEvent(
    context: AccountLedgerWriteContext,
    eventId: string,
  ): Promise<LedgerEventV2> {
    const stored = await context.transaction.ledgerEvent.findUnique({ where: { id: eventId } });
    if (!stored || stored.factId === null)
      throw new NotFoundException({
        errorCode: 'LEDGER_FACT_NOT_FOUND',
        message: '找不到可修正的账本事实',
      });
    if (stored.accountId !== context.accountId)
      throw new ConflictException({
        errorCode: 'LEDGER_CORRECTION_ACCOUNT_MISMATCH',
        message: '不能在当前账户修正其他账户的事实',
        accountId: context.accountId,
      });
    return toLedgerEventV2(stored);
  }

  private async assertChainTip(context: AccountLedgerWriteContext, eventId: string) {
    const child = await context.transaction.ledgerEvent.findUnique({
      where: { supersedesEventId: eventId },
    });
    if (child) throw conflict('只能修正当前链末的对账事件');
  }

  private async findIdempotentReplay(
    context: AccountLedgerWriteContext,
    desired: LedgerEventV2,
  ): Promise<{ event: LedgerEventV2; projectionGeneration: string } | undefined> {
    const externalId = desired.source.externalId;
    if (externalId === undefined) return undefined;
    const stored = await context.transaction.ledgerEvent.findUnique({
      where: {
        accountId_sourceChannel_externalId: {
          accountId: context.accountId,
          sourceChannel: desired.source.channel,
          externalId,
        },
      },
    });
    if (!stored) return undefined;
    const existing = toLedgerEventV2(stored);
    if (isEqual(eventCommandFingerprint(existing), eventCommandFingerprint(desired)))
      return {
        event: existing,
        projectionGeneration: stored.projectionGeneration?.toString() ?? existing.ledgerRevision,
      };
    throw new ConflictException({
      errorCode: 'LEDGER_IDEMPOTENCY_CONFLICT',
      message: '相同幂等键已用于不同内容',
      accountId: context.accountId,
      currentLedgerRevision: context.currentLedgerRevision.toString(),
    });
  }

  private eventResponse(
    mutation: ReconciliationMutation,
    result: {
      ledgerRevision: string;
      projectionGeneration: string;
    },
  ): LedgerCommandResponseV2 {
    const eventSymbol = isReconciliationPayloadEvent(mutation.event)
      ? mutation.event.payload.symbol
      : undefined;
    return ledgerCommandResponseSchemaV2.parse({
      eventIds: [mutation.event.eventId],
      factIds: [mutation.event.factId],
      ledgerRevisions: { [mutation.event.accountId]: result.ledgerRevision },
      projectionGenerations: {
        [mutation.event.accountId]: mutation.projectionGeneration ?? result.projectionGeneration,
      },
      affectedSymbols: eventSymbol === undefined ? [] : [eventSymbol],
      idempotentReplay: mutation.replay,
    });
  }
}
