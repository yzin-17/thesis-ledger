import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  createExecutionCommandSchemaV2,
  moveExecutionAccountCommandSchemaV2,
  replaceExecutionCommandSchemaV2,
  restoreExecutionCommandSchemaV2,
  voidExecutionCommandSchemaV2,
  type CreateExecutionCommandV2,
  type LedgerCommandErrorCodeV2,
  type LedgerCommandResponseV2,
  type LedgerEventV2,
  type MoveExecutionAccountCommandV2,
  type ReplaceExecutionCommandV2,
  type RestoreExecutionCommandV2,
  type VoidExecutionCommandV2,
} from '@thesis-ledger/schemas';
import { isEqual } from 'es-toolkit';
import { assertAccountCanHoldAsset } from '../portfolio/accounts.service.js';
import {
  LedgerV2Repository,
  toLedgerEventV2,
  type AccountLedgerWriteContext,
} from './ledger-v2.repository.js';
import { ledgerEventSymbol } from './ledger-event-v2.js';
import { inferAssetType } from './asset-type.js';
import { assertSymbolMatchesAssetType, assertWritableAccount } from './ledger.service.js';
import { rebuildLedgerProjection } from './ledger-projection.js';

type ExecutionCorrectionCommand =
  ReplaceExecutionCommandV2 | RestoreExecutionCommandV2 | VoidExecutionCommandV2;
type ExecutionPayloadEvent = Extract<
  LedgerEventV2,
  { type: 'BUY_EXECUTION' | 'SELL_EXECUTION'; revisionAction: 'CREATE' | 'REPLACE' | 'RESTORE' }
>;
type ExecutionVoidEvent = Extract<LedgerEventV2, { revisionAction: 'VOID' }>;
type ExecutionLedgerEvent = ExecutionPayloadEvent | ExecutionVoidEvent;
type IdempotentReplay = {
  event: LedgerEventV2;
  projectionGeneration: string;
};

type SingleExecutionMutation = {
  event: LedgerEventV2;
  replay: boolean;
  projectionGeneration?: string;
};

type MoveExecutionMutation = {
  events: LedgerEventV2[];
  replay: boolean;
  projectionGenerations?: Record<string, string>;
};

const ledgerConflict = (
  errorCode: LedgerCommandErrorCodeV2,
  message: string,
  accountId?: string,
  currentLedgerRevision?: string,
) =>
  new ConflictException({
    errorCode,
    message,
    ...(accountId === undefined ? {} : { accountId }),
    ...(currentLedgerRevision === undefined ? {} : { currentLedgerRevision }),
  });

const eventFingerprint = (event: LedgerEventV2) => ({
  accountId: event.accountId,
  type: event.type,
  occurredAt: event.occurredAt,
  timePrecision: event.timePrecision,
  sourceTimezone: event.sourceTimezone,
  economicOrderKey: event.economicOrderKey,
  payloadVersion: event.payloadVersion,
  source: event.source,
  actorId: event.actorId,
  revisionAction: event.revisionAction,
  supersedesEventId: event.supersedesEventId,
  reason: event.reason,
  ...(event.revisionAction === 'VOID' ? {} : { payload: event.payload }),
});

const assertExpectedRevision = (
  context: AccountLedgerWriteContext,
  expectedLedgerRevision: string,
) => {
  if (context.currentLedgerRevision.toString() === expectedLedgerRevision) return;
  throw ledgerConflict(
    'LEDGER_REVISION_CONFLICT',
    '账本已变更，请刷新后重试',
    context.accountId,
    context.currentLedgerRevision.toString(),
  );
};

type LedgerEventBaseInput = {
  accountId: string;
  ledgerRevision: bigint;
  occurredAt: string | null;
  timePrecision: LedgerEventV2['timePrecision'];
  sourceTimezone: string;
  economicOrderKey: string;
  source: LedgerEventV2['source'];
  actorId: string;
  payloadVersion?: number;
  recordedAt?: string;
};

const createLedgerEventBase = (input: LedgerEventBaseInput) => ({
  version: 2 as const,
  accountId: input.accountId,
  ledgerRevision: input.ledgerRevision.toString(),
  occurredAt: input.occurredAt,
  timePrecision: input.timePrecision,
  sourceTimezone: input.sourceTimezone,
  economicOrderKey: input.economicOrderKey,
  recordedAt: input.recordedAt ?? new Date().toISOString(),
  payloadVersion: input.payloadVersion ?? 1,
  source: input.source,
  actorId: input.actorId,
});

type ExecutionSide = CreateExecutionCommandV2['side'];

type ExecutionRevisionInput =
  | {
      envelope: ReturnType<typeof createLedgerEventBase>;
      side: ExecutionSide;
      factId: string;
      revisionAction: 'CREATE';
      payload: CreateExecutionCommandV2['payload'];
    }
  | {
      envelope: ReturnType<typeof createLedgerEventBase>;
      side: ExecutionSide;
      factId: string;
      revisionAction: 'REPLACE' | 'RESTORE';
      supersedesEventId: string;
      reason: string;
      payload: CreateExecutionCommandV2['payload'];
    };

const executionTypeBySide = {
  BUY: 'BUY_EXECUTION',
  SELL: 'SELL_EXECUTION',
} as const satisfies Record<ExecutionSide, ExecutionPayloadEvent['type']>;

const createExecutionRevision = (input: ExecutionRevisionInput): ExecutionPayloadEvent => {
  const common = {
    ...input.envelope,
    eventId: randomUUID(),
    factId: input.factId,
    type: executionTypeBySide[input.side],
    payload: input.payload,
  };
  if (input.revisionAction === 'CREATE') return { ...common, revisionAction: 'CREATE' };
  return {
    ...common,
    revisionAction: input.revisionAction,
    supersedesEventId: input.supersedesEventId,
    reason: input.reason,
  };
};

@Injectable()
export class LedgerCommandService {
  constructor(private readonly repository: LedgerV2Repository) {}

  private async assertExecutionWriteAllowed(
    context: AccountLedgerWriteContext,
    event: ExecutionPayloadEvent,
  ) {
    const account = await context.transaction.account.findUnique({
      where: { id: context.accountId },
    });
    if (!account) throw ledgerConflict('LEDGER_VALIDATION_FAILED', '账户不存在', context.accountId);
    try {
      assertWritableAccount(account, inferAssetType(event.payload.symbol));
    } catch (error) {
      throw ledgerConflict(
        'LEDGER_VALIDATION_FAILED',
        error instanceof Error ? error.message : '账户不可写',
        context.accountId,
      );
    }
    const asset = await context.transaction.asset.findUnique({
      where: { symbol: event.payload.symbol },
    });
    if (!asset || asset.identityStatus !== 'confirmed')
      throw ledgerConflict(
        'LEDGER_VALIDATION_FAILED',
        '成交资产必须先完成身份确认',
        context.accountId,
      );
    const assetType = inferAssetType(event.payload.symbol, asset.assetType);
    assertSymbolMatchesAssetType(event.payload.symbol, assetType);
    assertAccountCanHoldAsset(account, assetType);
  }

  async createExecution(rawCommand: unknown): Promise<LedgerCommandResponseV2> {
    const command = createExecutionCommandSchemaV2.parse(rawCommand);
    const result = await this.repository.withAccountWrite<SingleExecutionMutation>(
      command.accountId,
      async (context) => {
        const desired = this.createExecutionEvent(command, context.nextLedgerRevision);
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
        await this.assertExecutionWriteAllowed(context, desired);

        const event = await this.repository.appendRevision(context, desired);
        await rebuildLedgerProjection(
          context.transaction,
          context.accountId,
          'AVG',
          context.nextProjectionGeneration,
        );
        return {
          value: { event, replay: false },
          advanceRevision: true,
        };
      },
    );
    return this.singleResponse(
      result.value.event,
      result,
      result.value.replay,
      result.value.projectionGeneration,
    );
  }

  async replaceExecution(rawCommand: unknown): Promise<LedgerCommandResponseV2> {
    return this.correctExecution(replaceExecutionCommandSchemaV2.parse(rawCommand), 'REPLACE');
  }

  async voidExecution(rawCommand: unknown): Promise<LedgerCommandResponseV2> {
    return this.correctExecution(voidExecutionCommandSchemaV2.parse(rawCommand), 'VOID');
  }

  async restoreExecution(rawCommand: unknown): Promise<LedgerCommandResponseV2> {
    return this.correctExecution(restoreExecutionCommandSchemaV2.parse(rawCommand), 'RESTORE');
  }

  async moveExecutionAccount(rawCommand: unknown): Promise<LedgerCommandResponseV2> {
    const command = moveExecutionAccountCommandSchemaV2.parse(rawCommand);
    const result = await this.repository.withAccountsWrite<MoveExecutionMutation>(
      [command.sourceAccountId, command.targetAccountId],
      async (contexts) => {
        const sourceContext = contexts.get(command.sourceAccountId);
        const targetContext = contexts.get(command.targetAccountId);
        if (!sourceContext || !targetContext) throw new Error('跨账户账本锁定不完整');

        const target = await this.requireEvent(sourceContext, command.supersedesEventId);
        this.assertExecutionEvent(target, command.sourceAccountId);
        if (target.revisionAction === 'VOID')
          throw ledgerConflict(
            'LEDGER_CORRECTION_NOT_CHAIN_TIP',
            '已作废事实不能更正账户，请先恢复',
            command.sourceAccountId,
          );

        const sourceVoid = this.createVoidEvent(command, sourceContext.nextLedgerRevision, target);
        const targetCreate = this.createMovedExecutionEvent(
          command,
          targetContext.nextLedgerRevision,
        );
        const sourceReplay = await this.findIdempotentReplay(sourceContext, sourceVoid);
        const targetReplay = await this.findIdempotentReplay(targetContext, targetCreate);
        if (sourceReplay || targetReplay) {
          if (!sourceReplay || !targetReplay)
            throw ledgerConflict(
              'LEDGER_IDEMPOTENCY_CONFLICT',
              '跨账户幂等状态不完整，需要人工检查',
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
        await this.assertExecutionWriteAllowed(targetContext, targetCreate);

        await this.assertChainTip(sourceContext, target.eventId);
        assertExpectedRevision(sourceContext, command.expectedSourceLedgerRevision);
        assertExpectedRevision(targetContext, command.expectedTargetLedgerRevision);
        const sourceEvent = await this.repository.appendRevision(sourceContext, sourceVoid);
        const targetEvent = await this.repository.appendRevision(targetContext, targetCreate);
        await rebuildLedgerProjection(
          sourceContext.transaction,
          sourceContext.accountId,
          'AVG',
          sourceContext.nextProjectionGeneration,
        );
        await rebuildLedgerProjection(
          targetContext.transaction,
          targetContext.accountId,
          'AVG',
          targetContext.nextProjectionGeneration,
        );
        return {
          value: {
            events: [sourceEvent, targetEvent],
            replay: false,
          },
          advanceAccountIds: [command.sourceAccountId, command.targetAccountId],
        };
      },
    );

    const symbols = result.value.events
      .map(ledgerEventSymbol)
      .filter((value) => value !== undefined);
    const eventLedgerRevisions = Object.fromEntries(
      result.value.events.map((event) => [event.accountId, event.ledgerRevision]),
    );
    return {
      eventIds: result.value.events.map((event) => event.eventId),
      factIds: result.value.events.map((event) => event.factId),
      ledgerRevisions:
        Object.keys(eventLedgerRevisions).length > 0
          ? eventLedgerRevisions
          : result.ledgerRevisions,
      projectionGenerations: result.value.projectionGenerations ?? result.projectionGenerations,
      affectedSymbols: [...new Set(symbols)],
      idempotentReplay: result.value.replay,
    };
  }

  private async correctExecution(
    command: ExecutionCorrectionCommand,
    action: 'REPLACE' | 'VOID' | 'RESTORE',
  ): Promise<LedgerCommandResponseV2> {
    const result = await this.repository.withAccountWrite<SingleExecutionMutation>(
      command.accountId,
      async (context) => {
        const target = await this.requireEvent(context, command.supersedesEventId);
        this.assertExecutionEvent(target, command.accountId);
        const desired = this.createCorrectionEvent(
          command,
          action,
          context.nextLedgerRevision,
          target,
        );
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
        if (desired.revisionAction !== 'VOID')
          await this.assertExecutionWriteAllowed(context, desired);

        await this.assertChainTip(context, target.eventId);
        if (action === 'RESTORE' && target.revisionAction !== 'VOID')
          throw ledgerConflict(
            'LEDGER_RESTORE_REQUIRES_VOID',
            '只能恢复当前链末为 VOID 的事实',
            command.accountId,
          );
        if (action !== 'RESTORE' && target.revisionAction === 'VOID')
          throw ledgerConflict(
            'LEDGER_CORRECTION_NOT_CHAIN_TIP',
            '已作废事实只能恢复',
            command.accountId,
          );

        assertExpectedRevision(context, command.expectedLedgerRevision);
        const event = await this.repository.appendRevision(context, desired);
        await rebuildLedgerProjection(
          context.transaction,
          context.accountId,
          'AVG',
          context.nextProjectionGeneration,
        );
        return {
          value: { event, replay: false },
          advanceRevision: true,
        };
      },
    );
    return this.singleResponse(
      result.value.event,
      result,
      result.value.replay,
      result.value.projectionGeneration,
    );
  }

  private async requireEvent(context: AccountLedgerWriteContext, eventId: string) {
    const stored = await context.transaction.ledgerEvent.findUnique({ where: { id: eventId } });
    if (!stored || stored.factId === null)
      throw new NotFoundException({
        errorCode: 'LEDGER_FACT_NOT_FOUND',
        message: '找不到可修正的账本事实',
      });
    if (stored.accountId !== context.accountId)
      throw ledgerConflict(
        'LEDGER_CORRECTION_ACCOUNT_MISMATCH',
        '不能在当前账户修正其他账户的事实',
        context.accountId,
      );
    return toLedgerEventV2(stored);
  }

  private async assertChainTip(context: AccountLedgerWriteContext, eventId: string) {
    const child = await context.transaction.ledgerEvent.findUnique({
      where: { supersedesEventId: eventId },
    });
    if (child)
      throw ledgerConflict(
        'LEDGER_CORRECTION_NOT_CHAIN_TIP',
        '只能修正当前链末',
        context.accountId,
      );
  }

  private assertExecutionEvent(event: LedgerEventV2, accountId: string) {
    if (event.type === 'BUY_EXECUTION' || event.type === 'SELL_EXECUTION') return;
    throw ledgerConflict(
      'LEDGER_VALIDATION_FAILED',
      '成交修正命令只能操作买入或卖出成交',
      accountId,
    );
  }

  private async findIdempotentReplay(
    context: AccountLedgerWriteContext,
    desired: LedgerEventV2,
  ): Promise<IdempotentReplay | undefined> {
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
    if (isEqual(eventFingerprint(existing), eventFingerprint(desired)))
      return {
        event: existing,
        projectionGeneration: stored.projectionGeneration?.toString() ?? existing.ledgerRevision,
      };
    throw ledgerConflict(
      'LEDGER_IDEMPOTENCY_CONFLICT',
      '相同幂等键已用于不同内容',
      context.accountId,
      context.currentLedgerRevision.toString(),
    );
  }

  private createExecutionEvent(
    command: CreateExecutionCommandV2,
    ledgerRevision: bigint,
  ): ExecutionPayloadEvent {
    const envelope = createLedgerEventBase({
      accountId: command.accountId,
      ledgerRevision,
      occurredAt: command.occurredAt,
      timePrecision: command.timePrecision,
      sourceTimezone: command.sourceTimezone,
      economicOrderKey: command.economicOrderKey,
      source: command.source,
      actorId: command.actorId,
    });
    return createExecutionRevision({
      envelope,
      side: command.side,
      factId: randomUUID(),
      revisionAction: 'CREATE',
      payload: command.payload,
    });
  }

  private createCorrectionEvent(
    command: ExecutionCorrectionCommand,
    action: 'REPLACE' | 'VOID' | 'RESTORE',
    ledgerRevision: bigint,
    target: LedgerEventV2,
  ): ExecutionLedgerEvent {
    if (action === 'VOID') {
      if (command.command !== 'VOID_EXECUTION') throw new Error('VOID 动作需要 VOID 命令');
      return this.createVoidEvent(command, ledgerRevision, target);
    }
    if (command.command === 'VOID_EXECUTION') throw new Error('VOID 命令不包含替代载荷');
    const envelope = createLedgerEventBase({
      accountId: command.accountId,
      ledgerRevision,
      occurredAt: command.occurredAt,
      timePrecision: command.timePrecision,
      sourceTimezone: command.sourceTimezone,
      economicOrderKey: command.economicOrderKey,
      source: command.source,
      actorId: command.actorId,
    });
    return createExecutionRevision({
      envelope,
      side: command.side,
      factId: target.factId,
      revisionAction: action,
      supersedesEventId: target.eventId,
      reason: command.reason,
      payload: command.payload,
    });
  }

  private createVoidEvent(
    command: VoidExecutionCommandV2 | MoveExecutionAccountCommandV2,
    ledgerRevision: bigint,
    target: LedgerEventV2,
  ): ExecutionVoidEvent {
    return {
      ...createLedgerEventBase({
        accountId:
          command.command === 'MOVE_EXECUTION_ACCOUNT'
            ? command.sourceAccountId
            : command.accountId,
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
      type: target.type,
      revisionAction: 'VOID',
      supersedesEventId: target.eventId,
      reason: command.reason,
    };
  }

  private createMovedExecutionEvent(
    command: MoveExecutionAccountCommandV2,
    ledgerRevision: bigint,
  ): ExecutionPayloadEvent {
    const envelope = createLedgerEventBase({
      accountId: command.targetAccountId,
      ledgerRevision,
      occurredAt: command.occurredAt,
      timePrecision: command.timePrecision,
      sourceTimezone: command.sourceTimezone,
      economicOrderKey: command.economicOrderKey,
      source: command.source,
      actorId: command.actorId,
    });
    return createExecutionRevision({
      envelope,
      side: command.side,
      factId: randomUUID(),
      revisionAction: 'CREATE',
      payload: command.payload,
    });
  }

  private singleResponse(
    event: LedgerEventV2,
    result: { ledgerRevision: string; projectionGeneration: string },
    idempotentReplay: boolean,
    replayProjectionGeneration?: string,
  ): LedgerCommandResponseV2 {
    const symbol = ledgerEventSymbol(event);
    return {
      eventIds: [event.eventId],
      factIds: [event.factId],
      ledgerRevisions: { [event.accountId]: event.ledgerRevision },
      projectionGenerations: {
        [event.accountId]: replayProjectionGeneration ?? result.projectionGeneration,
      },
      affectedSymbols: symbol === undefined ? [] : [symbol],
      idempotentReplay,
    };
  }
}
