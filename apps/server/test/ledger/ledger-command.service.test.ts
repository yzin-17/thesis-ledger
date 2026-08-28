import { describe, expect, it, vi } from 'vitest';
import type { LedgerEventV2 } from '@thesis-ledger/schemas';
import { LedgerCommandService } from '../../src/ledger/ledger-command.service.js';
import type {
  AccountLedgerMutation,
  AccountLedgerWriteContext,
  MultiAccountLedgerMutation,
} from '../../src/ledger/ledger-v2.repository.js';

const accountA = '11111111-1111-4111-8111-111111111111';
const accountB = '22222222-2222-4222-8222-222222222222';

const commandBase = {
  accountId: accountA,
  occurredAt: '2026-08-26T02:30:00.000Z',
  timePrecision: 'INSTANT' as const,
  sourceTimezone: 'Asia/Shanghai',
  economicOrderKey: 'a0',
  side: 'BUY' as const,
  payload: {
    symbol: 'AAPL.US',
    quantity: '2',
    price: '200',
    currency: 'USD',
    capabilityVerification: 'VERIFIED' as const,
    charges: [],
  },
  source: {
    category: 'MANUAL' as const,
    channel: 'desktop',
    externalId: 'command-create',
  },
  actorId: 'user-1',
};

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

class InMemoryLedgerRepository {
  readonly revisions = new Map([
    [accountA, 0n],
    [accountB, 0n],
  ]);
  readonly generations = new Map([
    [accountA, 0n],
    [accountB, 0n],
  ]);
  readonly events: LedgerEventV2[] = [];
  readonly lockedAccountOrders: string[][] = [];
  failAppendForAccount?: string;

  async withAccountWrite<T>(
    accountId: string,
    operation: (context: AccountLedgerWriteContext) => Promise<AccountLedgerMutation<T>>,
  ) {
    const contexts = this.contexts([accountId]);
    const context = contexts.get(accountId)!;
    const mutation = await operation(context);
    if (mutation.advanceRevision) this.advance(accountId);
    return {
      value: mutation.value,
      ledgerRevision: this.revisions.get(accountId)!.toString(),
      projectionGeneration: this.generations.get(accountId)!.toString(),
    };
  }

  async withAccountsWrite<T>(
    accountIds: string[],
    operation: (
      contexts: Map<string, AccountLedgerWriteContext>,
    ) => Promise<MultiAccountLedgerMutation<T>>,
  ) {
    const ordered = [...new Set(accountIds)].sort();
    this.lockedAccountOrders.push(ordered);
    const contexts = this.contexts(ordered);
    const beforeEvents = [...this.events];
    try {
      const mutation = await operation(contexts);
      for (const accountId of mutation.advanceAccountIds) this.advance(accountId);
      return {
        value: mutation.value,
        ledgerRevisions: Object.fromEntries(
          ordered.map((accountId) => [accountId, this.revisions.get(accountId)!.toString()]),
        ),
        projectionGenerations: Object.fromEntries(
          ordered.map((accountId) => [accountId, this.generations.get(accountId)!.toString()]),
        ),
      };
    } catch (error) {
      this.events.splice(0, this.events.length, ...beforeEvents);
      throw error;
    }
  }

  async appendRevision(context: AccountLedgerWriteContext, event: LedgerEventV2) {
    if (this.failAppendForAccount === context.accountId) throw new Error('append failed');
    this.events.push(event);
    return event;
  }

  private contexts(accountIds: string[]) {
    const contexts = new Map<string, AccountLedgerWriteContext>();
    const ledgerEvent = {
      findUnique: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        let event: LedgerEventV2 | undefined;
        if (typeof where.id === 'string') {
          event = this.events.find((candidate) => candidate.eventId === where.id);
        } else if (typeof where.supersedesEventId === 'string') {
          event = this.events.find(
            (candidate) => candidate.supersedesEventId === where.supersedesEventId,
          );
        } else if (where.accountId_sourceChannel_externalId) {
          const key = where.accountId_sourceChannel_externalId as {
            accountId: string;
            sourceChannel: string;
            externalId: string;
          };
          event = this.events.find(
            (candidate) =>
              candidate.accountId === key.accountId &&
              candidate.source.channel === key.sourceChannel &&
              candidate.source.externalId === key.externalId,
          );
        }
        return event ? storedFromEvent(event) : null;
      }),
      create: vi.fn(),
      findMany: vi.fn(async () => this.events.map(storedFromEvent)),
    };
    const account = {
      findUnique: vi.fn(async () => ({ active: true, currency: 'CNY', type: 'securities' })),
    };
    const asset = {
      findUnique: vi.fn(async () => ({ identityStatus: 'confirmed', assetType: 'stock' })),
    };
    const position = {
      findMany: vi.fn(async () => []),
      update: vi.fn(),
      delete: vi.fn(),
      create: vi.fn(),
    };
    for (const accountId of accountIds) {
      const revision = this.revisions.get(accountId) ?? 0n;
      const generation = this.generations.get(accountId) ?? 0n;
      contexts.set(accountId, {
        transaction: { ledgerEvent, account, asset, position } as never,
        accountId,
        currentLedgerRevision: revision,
        nextLedgerRevision: revision + 1n,
        currentProjectionGeneration: generation,
        nextProjectionGeneration: generation + 1n,
      });
    }
    return contexts;
  }

  private advance(accountId: string) {
    this.revisions.set(accountId, (this.revisions.get(accountId) ?? 0n) + 1n);
    this.generations.set(accountId, (this.generations.get(accountId) ?? 0n) + 1n);
  }
}

const errorCode = async (operation: Promise<unknown>) => {
  try {
    await operation;
  } catch (error) {
    const response = (error as { getResponse?: () => unknown }).getResponse?.();
    return (response as { errorCode?: string } | undefined)?.errorCode;
  }
  throw new Error('期望命令失败');
};

describe('Ledger V2 成交命令', () => {
  it('相同幂等命令重放返回原事件且不增加 Revision', async () => {
    const repository = new InMemoryLedgerRepository();
    const service = new LedgerCommandService(repository as never);
    const command = { command: 'CREATE_EXECUTION', ...commandBase };

    const first = await service.createExecution(command);
    const replay = await service.createExecution(command);

    expect(first.idempotentReplay).toBe(false);
    expect(replay).toMatchObject({
      eventIds: first.eventIds,
      factIds: first.factIds,
      idempotentReplay: true,
      ledgerRevisions: { [accountA]: '1' },
    });
    expect(repository.events).toHaveLength(1);
  });

  it('买入和卖出使用同一执行事件构造路径并保持类型映射', async () => {
    const repository = new InMemoryLedgerRepository();
    const service = new LedgerCommandService(repository as never);

    await service.createExecution({ command: 'CREATE_EXECUTION', ...commandBase });
    await service.createExecution({
      command: 'CREATE_EXECUTION',
      ...commandBase,
      side: 'SELL',
      economicOrderKey: 'a1',
      source: { ...commandBase.source, externalId: 'command-create-sell' },
      payload: { ...commandBase.payload, quantity: '1' },
    });

    expect(repository.events.map((event) => event.type)).toEqual([
      'BUY_EXECUTION',
      'SELL_EXECUTION',
    ]);
  });

  it('相同幂等键的不同内容返回稳定冲突码', async () => {
    const repository = new InMemoryLedgerRepository();
    const service = new LedgerCommandService(repository as never);
    await service.createExecution({ command: 'CREATE_EXECUTION', ...commandBase });

    await expect(
      errorCode(
        service.createExecution({
          command: 'CREATE_EXECUTION',
          ...commandBase,
          payload: { ...commandBase.payload, quantity: '3' },
        }),
      ),
    ).resolves.toBe('LEDGER_IDEMPOTENCY_CONFLICT');
    expect(repository.revisions.get(accountA)).toBe(1n);
  });

  it('替代只能连接链末，且重放不受旧 expected Revision 影响', async () => {
    const repository = new InMemoryLedgerRepository();
    const service = new LedgerCommandService(repository as never);
    const created = await service.createExecution({ command: 'CREATE_EXECUTION', ...commandBase });
    const supersedesEventId = created.eventIds[0]!;
    const replace = {
      command: 'REPLACE_EXECUTION',
      ...commandBase,
      expectedLedgerRevision: '1',
      supersedesEventId,
      reason: '修正数量',
      source: { ...commandBase.source, externalId: 'command-replace' },
      payload: { ...commandBase.payload, quantity: '3' },
    };

    const replaced = await service.replaceExecution(replace);
    await expect(service.replaceExecution(replace)).resolves.toMatchObject({
      eventIds: replaced.eventIds,
      idempotentReplay: true,
      ledgerRevisions: { [accountA]: '2' },
    });
    await expect(
      errorCode(
        service.replaceExecution({
          ...replace,
          expectedLedgerRevision: '2',
          source: { ...replace.source, externalId: 'parallel-branch' },
        }),
      ),
    ).resolves.toBe('LEDGER_CORRECTION_NOT_CHAIN_TIP');
  });

  it('状态命令拒绝陈旧 Ledger Revision', async () => {
    const repository = new InMemoryLedgerRepository();
    const service = new LedgerCommandService(repository as never);
    const created = await service.createExecution({ command: 'CREATE_EXECUTION', ...commandBase });

    await expect(
      errorCode(
        service.voidExecution({
          command: 'VOID_EXECUTION',
          accountId: accountA,
          expectedLedgerRevision: '0',
          supersedesEventId: created.eventIds[0],
          source: { ...commandBase.source, externalId: 'command-void-stale' },
          actorId: 'user-1',
          reason: '重复导入',
        }),
      ),
    ).resolves.toBe('LEDGER_REVISION_CONFLICT');
  });

  it('VOID 后只能 RESTORE，恢复后保留同一 factId', async () => {
    const repository = new InMemoryLedgerRepository();
    const service = new LedgerCommandService(repository as never);
    const created = await service.createExecution({ command: 'CREATE_EXECUTION', ...commandBase });
    const voided = await service.voidExecution({
      command: 'VOID_EXECUTION',
      accountId: accountA,
      expectedLedgerRevision: '1',
      supersedesEventId: created.eventIds[0],
      source: { ...commandBase.source, externalId: 'command-void' },
      actorId: 'user-1',
      reason: '重复导入',
    });
    const restored = await service.restoreExecution({
      command: 'RESTORE_EXECUTION',
      ...commandBase,
      expectedLedgerRevision: '2',
      supersedesEventId: voided.eventIds[0],
      reason: '撤销误作废',
      source: { ...commandBase.source, externalId: 'command-restore' },
    });

    expect(restored.factIds).toEqual(created.factIds);
    expect(repository.events.map((event) => event.revisionAction)).toEqual([
      'CREATE',
      'VOID',
      'RESTORE',
    ]);
  });

  it('REPLACE、VOID、RESTORE 修正链保留来源行 ID', async () => {
    const repository = new InMemoryLedgerRepository();
    const service = new LedgerCommandService(repository as never);
    const source = (externalId: string) => ({
      ...commandBase.source,
      externalId,
      sourceRowId: 'draft-row-1',
    });
    const created = await service.createExecution({
      command: 'CREATE_EXECUTION',
      ...commandBase,
      source: source('draft-create'),
    });
    const replaced = await service.replaceExecution({
      command: 'REPLACE_EXECUTION',
      ...commandBase,
      expectedLedgerRevision: '1',
      supersedesEventId: created.eventIds[0],
      reason: '修正数量',
      source: source('draft-replace'),
      payload: { ...commandBase.payload, quantity: '3' },
    });
    const voided = await service.voidExecution({
      command: 'VOID_EXECUTION',
      accountId: accountA,
      expectedLedgerRevision: '2',
      supersedesEventId: replaced.eventIds[0],
      source: source('draft-void'),
      actorId: 'user-1',
      reason: '重复导入',
    });
    await service.restoreExecution({
      command: 'RESTORE_EXECUTION',
      ...commandBase,
      expectedLedgerRevision: '3',
      supersedesEventId: voided.eventIds[0],
      reason: '撤销误作废',
      source: source('draft-restore'),
    });

    expect(repository.events.map((event) => event.source.sourceRowId)).toEqual([
      'draft-row-1',
      'draft-row-1',
      'draft-row-1',
      'draft-row-1',
    ]);
  });

  it('跨账户更正按稳定账户 ID 顺序锁定并原子写入 VOID + CREATE', async () => {
    const repository = new InMemoryLedgerRepository();
    const service = new LedgerCommandService(repository as never);
    const created = await service.createExecution({ command: 'CREATE_EXECUTION', ...commandBase });
    const moveCommand = {
      command: 'MOVE_EXECUTION_ACCOUNT',
      sourceAccountId: accountA,
      targetAccountId: accountB,
      expectedSourceLedgerRevision: '1',
      expectedTargetLedgerRevision: '0',
      supersedesEventId: created.eventIds[0],
      occurredAt: commandBase.occurredAt,
      timePrecision: commandBase.timePrecision,
      sourceTimezone: commandBase.sourceTimezone,
      economicOrderKey: commandBase.economicOrderKey,
      side: commandBase.side,
      payload: commandBase.payload,
      source: { ...commandBase.source, externalId: 'command-move' },
      actorId: 'user-1',
      reason: '原成交归属账户错误',
    };

    const moved = await service.moveExecutionAccount(moveCommand);
    const replay = await service.moveExecutionAccount(moveCommand);

    expect(repository.lockedAccountOrders[0]).toEqual([accountA, accountB].sort());
    expect(moved.ledgerRevisions).toEqual({ [accountA]: '2', [accountB]: '1' });
    expect(moved.factIds[0]).not.toBe(moved.factIds[1]);
    expect(replay).toMatchObject({ eventIds: moved.eventIds, idempotentReplay: true });
    expect(repository.events).toHaveLength(3);
  });

  it('跨账户第二条写入失败时回滚第一条事件和两个账户版本', async () => {
    const repository = new InMemoryLedgerRepository();
    const service = new LedgerCommandService(repository as never);
    const created = await service.createExecution({ command: 'CREATE_EXECUTION', ...commandBase });
    repository.failAppendForAccount = accountB;

    await expect(
      service.moveExecutionAccount({
        command: 'MOVE_EXECUTION_ACCOUNT',
        sourceAccountId: accountA,
        targetAccountId: accountB,
        expectedSourceLedgerRevision: '1',
        expectedTargetLedgerRevision: '0',
        supersedesEventId: created.eventIds[0],
        occurredAt: commandBase.occurredAt,
        timePrecision: commandBase.timePrecision,
        sourceTimezone: commandBase.sourceTimezone,
        economicOrderKey: commandBase.economicOrderKey,
        side: commandBase.side,
        payload: commandBase.payload,
        source: { ...commandBase.source, externalId: 'command-move-failed' },
        actorId: 'user-1',
        reason: '测试回滚',
      }),
    ).rejects.toThrow('append failed');
    expect(repository.events).toHaveLength(1);
    expect(repository.revisions.get(accountA)).toBe(1n);
    expect(repository.revisions.get(accountB)).toBe(0n);
  });
});
