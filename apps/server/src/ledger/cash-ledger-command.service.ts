import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  createCashFlowCommandSchemaV2,
  createCashTransferCommandSchemaV2,
  replaceCashFlowCommandSchemaV2,
  replaceCashTransferCommandSchemaV2,
  restoreCashFlowCommandSchemaV2,
  restoreCashTransferCommandSchemaV2,
  voidCashFlowCommandSchemaV2,
  voidCashTransferCommandSchemaV2,
  type CashFlowPayloadV2,
  type CreateCashFlowCommandV2,
  type CreateCashTransferCommandV2,
  type LedgerCommandResponseV2,
  type LedgerEventV2,
  type ReplaceCashFlowCommandV2,
  type ReplaceCashTransferCommandV2,
  type RestoreCashFlowCommandV2,
  type RestoreCashTransferCommandV2,
  type VoidCashFlowCommandV2,
  type VoidCashTransferCommandV2,
} from '@thesis-ledger/schemas';
import {
  assertCashExpectedRevision,
  cashLedgerConflict,
  CashLedgerCommandSupport,
  createCashLedgerEventBase,
  type CashFlowLedgerEvent,
  type CashFlowPayloadEvent,
  type CashFlowVoidEvent,
  type PairedCashMutation,
  type SingleCashMutation,
} from './cash-ledger-command-support.js';
import { LedgerV2Repository, type AccountLedgerWriteContext } from './ledger-v2.repository.js';
type StandaloneCashCorrectionCommand =
  ReplaceCashFlowCommandV2 | RestoreCashFlowCommandV2 | VoidCashFlowCommandV2;
type CashTransferPayloadCommand =
  CreateCashTransferCommandV2 | ReplaceCashTransferCommandV2 | RestoreCashTransferCommandV2;
type CashTransferCorrectionCommand =
  ReplaceCashTransferCommandV2 | RestoreCashTransferCommandV2 | VoidCashTransferCommandV2;

@Injectable()
export class CashLedgerCommandService {
  private readonly support: CashLedgerCommandSupport;

  constructor(private readonly repository: LedgerV2Repository) {
    this.support = new CashLedgerCommandSupport(repository);
  }

  async createCashFlow(rawCommand: unknown): Promise<LedgerCommandResponseV2> {
    return (await this.createCashFlowWithEffect(rawCommand)).response;
  }

  async createCashFlowWithEffect<T = undefined>(
    rawCommand: unknown,
    effect?: (transaction: Prisma.TransactionClient, event: LedgerEventV2) => Promise<T>,
  ): Promise<{ response: LedgerCommandResponseV2; effectResult: T | undefined }> {
    const command = createCashFlowCommandSchemaV2.parse(rawCommand);
    const result = await this.repository.withAccountWrite<
      SingleCashMutation & { effectResult: T | undefined }
    >(command.accountId, async (context) => {
      const desired = this.createStandalonePayloadEvent(
        command,
        context.nextLedgerRevision,
        randomUUID(),
        'CREATE',
      );
      const replay = await this.support.findIdempotentReplay(context, desired);
      if (replay)
        return {
          value: {
            event: replay.event,
            replay: true,
            projectionGeneration: replay.projectionGeneration,
            effectResult: undefined,
          },
          advanceRevision: false,
        };

      await this.support.assertAccountWritable(context, desired.payload.currency);
      await this.support.assertBalanceAfterRevision(context, undefined, desired);
      const event = await this.repository.appendRevision(context, desired);
      const effectResult = effect ? await effect(context.transaction, event) : undefined;
      await this.support.rebuild(context);
      return { value: { event, replay: false, effectResult }, advanceRevision: true };
    });
    return {
      response: this.support.singleResponse(result.value, result),
      effectResult: result.value.effectResult,
    };
  }

  async replaceCashFlow(rawCommand: unknown): Promise<LedgerCommandResponseV2> {
    return this.correctStandaloneCashFlow(
      replaceCashFlowCommandSchemaV2.parse(rawCommand),
      'REPLACE',
    );
  }

  async voidCashFlow(rawCommand: unknown): Promise<LedgerCommandResponseV2> {
    return this.correctStandaloneCashFlow(voidCashFlowCommandSchemaV2.parse(rawCommand), 'VOID');
  }

  async restoreCashFlow(rawCommand: unknown): Promise<LedgerCommandResponseV2> {
    return this.correctStandaloneCashFlow(
      restoreCashFlowCommandSchemaV2.parse(rawCommand),
      'RESTORE',
    );
  }

  async createCashTransfer(rawCommand: unknown): Promise<LedgerCommandResponseV2> {
    const command = createCashTransferCommandSchemaV2.parse(rawCommand);
    return this.writeCashTransfer(command, 'CREATE');
  }

  async replaceCashTransfer(rawCommand: unknown): Promise<LedgerCommandResponseV2> {
    const command = replaceCashTransferCommandSchemaV2.parse(rawCommand);
    return this.writeCashTransfer(command, 'REPLACE');
  }

  async voidCashTransfer(rawCommand: unknown): Promise<LedgerCommandResponseV2> {
    const command = voidCashTransferCommandSchemaV2.parse(rawCommand);
    return this.writeCashTransfer(command, 'VOID');
  }

  async restoreCashTransfer(rawCommand: unknown): Promise<LedgerCommandResponseV2> {
    const command = restoreCashTransferCommandSchemaV2.parse(rawCommand);
    return this.writeCashTransfer(command, 'RESTORE');
  }

  private async correctStandaloneCashFlow(
    command: StandaloneCashCorrectionCommand,
    action: 'REPLACE' | 'VOID' | 'RESTORE',
  ) {
    const result = await this.repository.withAccountWrite<SingleCashMutation>(
      command.accountId,
      async (context) => {
        const target = await this.support.requireEvent(context, command.supersedesEventId);
        await this.assertStandaloneCashFlow(context, target);
        const desired =
          action === 'VOID'
            ? this.createVoidEvent(
                command as VoidCashFlowCommandV2,
                context.nextLedgerRevision,
                target,
              )
            : this.createStandalonePayloadEvent(
                command as ReplaceCashFlowCommandV2 | RestoreCashFlowCommandV2,
                context.nextLedgerRevision,
                target.factId,
                action,
                target.eventId,
              );
        const replay = await this.support.findIdempotentReplay(context, desired);
        if (replay)
          return {
            value: {
              event: replay.event,
              replay: true,
              projectionGeneration: replay.projectionGeneration,
            },
            advanceRevision: false,
          };

        await this.support.assertChainTip(context, target.eventId);
        this.support.assertCorrectionAction(target, action, context.accountId);
        assertCashExpectedRevision(context, command.expectedLedgerRevision);
        const currency =
          action === 'VOID'
            ? (target as CashFlowPayloadEvent).payload.currency
            : (desired as CashFlowPayloadEvent).payload.currency;
        await this.support.assertAccountWritable(context, currency);
        await this.support.assertBalanceAfterRevision(context, target, desired);
        const event = await this.repository.appendRevision(context, desired);
        await this.support.rebuild(context);
        return { value: { event, replay: false }, advanceRevision: true };
      },
    );
    return this.support.singleResponse(result.value, result);
  }

  private async writeCashTransfer(
    command: CreateCashTransferCommandV2 | CashTransferCorrectionCommand,
    action: 'CREATE' | 'REPLACE' | 'VOID' | 'RESTORE',
  ): Promise<LedgerCommandResponseV2> {
    const result = await this.repository.withAccountsWrite<PairedCashMutation>(
      [command.sourceAccountId, command.targetAccountId],
      async (contexts) => {
        const sourceContext = contexts.get(command.sourceAccountId);
        const targetContext = contexts.get(command.targetAccountId);
        if (!sourceContext || !targetContext) throw new Error('现金划转账户锁定不完整');

        let sourceTarget: CashFlowLedgerEvent | undefined;
        let targetTarget: CashFlowLedgerEvent | undefined;
        if (action !== 'CREATE') {
          const correction = command as CashTransferCorrectionCommand;
          sourceTarget = await this.support.requireEvent(
            sourceContext,
            correction.supersedesSourceEventId,
          );
          targetTarget = await this.support.requireEvent(
            targetContext,
            correction.supersedesTargetEventId,
          );
          await this.assertTransferPair(
            sourceContext,
            targetContext,
            sourceTarget,
            targetTarget,
            command.transferId,
          );
        }

        const desired = this.createTransferEvents(
          command,
          action,
          sourceContext,
          targetContext,
          sourceTarget,
          targetTarget,
        );
        const sourceReplay = await this.support.findIdempotentReplay(sourceContext, desired[0]);
        const targetReplay = await this.support.findIdempotentReplay(targetContext, desired[1]);
        if (sourceReplay || targetReplay) {
          if (!sourceReplay || !targetReplay)
            throw cashLedgerConflict(
              'LEDGER_IDEMPOTENCY_CONFLICT',
              '现金划转幂等状态不完整，需要人工检查',
            );
          return {
            value: {
              events: [sourceReplay.event, targetReplay.event],
              replay: true,
              projectionGenerations: {
                [command.sourceAccountId]: sourceReplay.projectionGeneration,
                [command.targetAccountId]: targetReplay.projectionGeneration,
              },
            },
            advanceAccountIds: [],
          };
        }

        const transferCurrency =
          action === 'VOID'
            ? (await this.transferPayloadForTip(sourceContext, sourceTarget!)).currency
            : (command as CashTransferPayloadCommand).currency;
        await this.assertTransferAccounts(sourceContext, targetContext, transferCurrency);
        if (action !== 'CREATE' && sourceTarget && targetTarget) {
          await this.support.assertChainTip(sourceContext, sourceTarget.eventId);
          await this.support.assertChainTip(targetContext, targetTarget.eventId);
          this.support.assertCorrectionAction(sourceTarget, action, sourceContext.accountId);
          this.support.assertCorrectionAction(targetTarget, action, targetContext.accountId);
        }
        assertCashExpectedRevision(sourceContext, command.expectedSourceLedgerRevision);
        assertCashExpectedRevision(targetContext, command.expectedTargetLedgerRevision);
        await this.support.assertBalanceAfterRevision(sourceContext, sourceTarget, desired[0]);
        await this.support.assertBalanceAfterRevision(targetContext, targetTarget, desired[1]);

        const sourceEvent = await this.repository.appendRevision(sourceContext, desired[0]);
        const targetEvent = await this.repository.appendRevision(targetContext, desired[1]);
        await this.support.rebuild(sourceContext);
        await this.support.rebuild(targetContext);
        return {
          value: { events: [sourceEvent, targetEvent], replay: false },
          advanceAccountIds: [command.sourceAccountId, command.targetAccountId],
        };
      },
    );
    return this.support.pairedResponse(result.value, result);
  }

  private createStandalonePayloadEvent(
    command: CreateCashFlowCommandV2 | ReplaceCashFlowCommandV2 | RestoreCashFlowCommandV2,
    ledgerRevision: bigint,
    factId: string,
    action: 'CREATE' | 'REPLACE' | 'RESTORE',
    supersedesEventId?: string,
  ): CashFlowPayloadEvent {
    const common = {
      ...createCashLedgerEventBase({
        accountId: command.accountId,
        ledgerRevision,
        occurredAt: command.occurredAt,
        timePrecision: command.timePrecision,
        sourceTimezone: command.sourceTimezone,
        economicOrderKey: command.economicOrderKey,
        source: command.source,
        actorId: command.actorId,
      }),
      eventId: randomUUID(),
      factId,
      type: 'CASH_FLOW' as const,
      payload: command.payload,
    };
    if (action === 'CREATE') return { ...common, revisionAction: 'CREATE' };
    return {
      ...common,
      revisionAction: action,
      supersedesEventId: supersedesEventId!,
      reason: (command as ReplaceCashFlowCommandV2 | RestoreCashFlowCommandV2).reason,
    };
  }

  private createTransferEvents(
    command: CreateCashTransferCommandV2 | CashTransferCorrectionCommand,
    action: 'CREATE' | 'REPLACE' | 'VOID' | 'RESTORE',
    sourceContext: AccountLedgerWriteContext,
    targetContext: AccountLedgerWriteContext,
    sourceTarget?: CashFlowLedgerEvent,
    targetTarget?: CashFlowLedgerEvent,
  ): [CashFlowLedgerEvent, CashFlowLedgerEvent] {
    if (action === 'VOID') {
      const correction = command as VoidCashTransferCommandV2;
      return [
        this.createVoidEvent(correction, sourceContext.nextLedgerRevision, sourceTarget!),
        this.createVoidEvent(correction, targetContext.nextLedgerRevision, targetTarget!),
      ];
    }
    const payloadCommand = command as CashTransferPayloadCommand;
    const sourcePayload = this.transferPayload(payloadCommand, 'OUTFLOW');
    const targetPayload = this.transferPayload(payloadCommand, 'INFLOW');
    return [
      this.createTransferPayloadEvent(
        payloadCommand,
        sourceContext,
        sourcePayload,
        action,
        sourceTarget,
      ),
      this.createTransferPayloadEvent(
        payloadCommand,
        targetContext,
        targetPayload,
        action,
        targetTarget,
      ),
    ];
  }

  private transferPayload(
    command: CashTransferPayloadCommand,
    leg: 'OUTFLOW' | 'INFLOW',
  ): CashFlowPayloadV2 {
    const accountId = leg === 'OUTFLOW' ? command.targetAccountId : command.sourceAccountId;
    return {
      direction: leg,
      category: 'TRANSFER',
      amount: command.amount,
      currency: command.currency,
      ...(command.expectedAt === undefined ? {} : { expectedAt: command.expectedAt }),
      ...(command.settledAt === undefined ? {} : { settledAt: command.settledAt }),
      ...(command.note === undefined ? {} : { note: command.note }),
      transfer: {
        transferId: command.transferId,
        counterpartyAccountId: accountId,
        leg,
      },
    };
  }

  private createTransferPayloadEvent(
    command: CashTransferPayloadCommand,
    context: AccountLedgerWriteContext,
    payload: CashFlowPayloadV2,
    action: 'CREATE' | 'REPLACE' | 'RESTORE',
    target?: CashFlowLedgerEvent,
  ): CashFlowPayloadEvent {
    const common = {
      ...createCashLedgerEventBase({
        accountId: context.accountId,
        ledgerRevision: context.nextLedgerRevision,
        occurredAt: command.occurredAt,
        timePrecision: command.timePrecision,
        sourceTimezone: command.sourceTimezone,
        economicOrderKey: `${command.economicOrderKey}:${payload.direction.toLowerCase()}`,
        source: command.source,
        actorId: command.actorId,
      }),
      eventId: randomUUID(),
      factId: target?.factId ?? randomUUID(),
      type: 'CASH_FLOW' as const,
      payload,
    };
    if (action === 'CREATE') return { ...common, revisionAction: 'CREATE' };
    return {
      ...common,
      revisionAction: action,
      supersedesEventId: target!.eventId,
      reason: (command as ReplaceCashTransferCommandV2 | RestoreCashTransferCommandV2).reason,
    };
  }

  private createVoidEvent(
    command: VoidCashFlowCommandV2 | VoidCashTransferCommandV2,
    ledgerRevision: bigint,
    target: CashFlowLedgerEvent,
  ): CashFlowVoidEvent {
    return {
      ...createCashLedgerEventBase({
        accountId: target.accountId,
        ledgerRevision,
        occurredAt: target.occurredAt,
        timePrecision: target.timePrecision,
        sourceTimezone: target.sourceTimezone,
        economicOrderKey: target.economicOrderKey,
        source: command.source,
        actorId: command.actorId,
        payloadVersion: target.payloadVersion,
      }),
      eventId: randomUUID(),
      factId: target.factId,
      type: 'CASH_FLOW',
      revisionAction: 'VOID',
      supersedesEventId: target.eventId,
      reason: command.reason,
    };
  }

  private async assertTransferAccounts(
    sourceContext: AccountLedgerWriteContext,
    targetContext: AccountLedgerWriteContext,
    currency: string,
  ) {
    const source = await this.support.assertAccountWritable(sourceContext, currency);
    const target = await this.support.assertAccountWritable(targetContext, currency);
    const sourceCash = source.type === 'cash';
    const targetCash = target.type === 'cash';
    if (sourceCash === targetCash)
      throw cashLedgerConflict(
        'LEDGER_VALIDATION_FAILED',
        '现金划转必须发生在一个现金账户与一个证券或基金账户之间',
      );
    const investment = sourceCash ? target : source;
    if (!['securities', 'fund'].includes(investment.type))
      throw cashLedgerConflict('LEDGER_VALIDATION_FAILED', '现金划转目标账户类型不受支持');
  }

  private async assertTransferPair(
    sourceContext: AccountLedgerWriteContext,
    targetContext: AccountLedgerWriteContext,
    sourceEvent: CashFlowLedgerEvent,
    targetEvent: CashFlowLedgerEvent,
    transferId: string,
  ) {
    const sourcePayload = await this.transferPayloadForTip(sourceContext, sourceEvent);
    const targetPayload = await this.transferPayloadForTip(targetContext, targetEvent);
    const valid =
      sourcePayload.transfer?.transferId === transferId &&
      targetPayload.transfer?.transferId === transferId &&
      sourcePayload.transfer.leg === 'OUTFLOW' &&
      targetPayload.transfer.leg === 'INFLOW' &&
      sourcePayload.transfer.counterpartyAccountId === targetContext.accountId &&
      targetPayload.transfer.counterpartyAccountId === sourceContext.accountId &&
      sourcePayload.amount === targetPayload.amount &&
      sourcePayload.currency === targetPayload.currency;
    if (!valid)
      throw cashLedgerConflict('LEDGER_VALIDATION_FAILED', '现金划转修正目标不是同一笔完整划转');
  }

  private async transferPayloadForTip(
    context: AccountLedgerWriteContext,
    event: CashFlowLedgerEvent,
  ) {
    let payloadEvent = event;
    if (event.revisionAction === 'VOID') {
      if (!event.supersedesEventId)
        throw cashLedgerConflict('LEDGER_VALIDATION_FAILED', '作废事件缺少上一版本');
      payloadEvent = await this.support.requireEvent(context, event.supersedesEventId);
    }
    if (
      payloadEvent.revisionAction === 'VOID' ||
      payloadEvent.payload.category !== 'TRANSFER' ||
      payloadEvent.payload.transfer === undefined
    )
      throw cashLedgerConflict('LEDGER_VALIDATION_FAILED', '目标事件不是现金划转');
    return payloadEvent.payload;
  }

  private async assertStandaloneCashFlow(
    context: AccountLedgerWriteContext,
    event: CashFlowLedgerEvent,
  ) {
    let payloadEvent = event;
    if (event.revisionAction === 'VOID') {
      if (!event.supersedesEventId)
        throw cashLedgerConflict('LEDGER_VALIDATION_FAILED', '作废事件缺少上一版本');
      payloadEvent = await this.support.requireEvent(context, event.supersedesEventId);
    }
    if (payloadEvent.revisionAction !== 'VOID' && payloadEvent.payload.category === 'TRANSFER')
      throw cashLedgerConflict(
        'LEDGER_VALIDATION_FAILED',
        '现金划转必须使用成对修正命令',
        context.accountId,
      );
  }
}
