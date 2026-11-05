import { describe, expect, it } from 'vitest';
import { LedgerCommandService } from '../../src/ledger/ledger-command.service.js';
import {
  accountA,
  accountB,
  commandBase,
  InMemoryLedgerRepository,
  errorCode,
} from './ledger-command.fixture.js';

describe('Ledger V2 成交命令', () => {
  it('客户端自报 VERIFIED 不能追加新成交或推进账本状态', async () => {
    const repository = new InMemoryLedgerRepository();
    const service = new LedgerCommandService(repository as never);
    await expect(
      errorCode(
        service.createExecution({
          command: 'CREATE_EXECUTION',
          ...commandBase,
          payload: { ...commandBase.payload, capabilityVerification: 'VERIFIED' },
        }),
      ),
    ).resolves.toBe('LEDGER_VALIDATION_FAILED');
    expect(repository.events).toHaveLength(0);
    expect(repository.revisions.get(accountA)).toBe(2n);
    expect(repository.generations.get(accountA)).toBe(2n);
  });

  it('旧 VERIFIED 命令重放仍返回原事件；新的更正不得继承该标记', async () => {
    const repository = new InMemoryLedgerRepository();
    const service = new LedgerCommandService(repository as never);
    const created = await service.createExecution({ command: 'CREATE_EXECUTION', ...commandBase });
    const original = repository.events[0]!;
    if (original.revisionAction === 'VOID' || !('capabilityVerification' in original.payload))
      throw new Error('测试要求成交事实');
    original.payload.capabilityVerification = 'VERIFIED'; // 明确模拟既有历史事实。
    const historicalCommand = {
      command: 'CREATE_EXECUTION',
      ...commandBase,
      payload: { ...commandBase.payload, capabilityVerification: 'VERIFIED' },
    };
    await expect(service.createExecution(historicalCommand)).resolves.toMatchObject({
      idempotentReplay: true,
      eventIds: created.eventIds,
      ledgerRevisions: { [accountA]: '3' },
    });
    await expect(
      errorCode(
        service.replaceExecution({
          ...historicalCommand,
          command: 'REPLACE_EXECUTION',
          expectedLedgerRevision: '3',
          supersedesEventId: created.eventIds[0],
          reason: '本次必须重新校验',
          source: { ...commandBase.source, externalId: 'untrusted-verification-replace' },
        }),
      ),
    ).resolves.toBe('LEDGER_VALIDATION_FAILED');
    expect(repository.events).toHaveLength(1);
    expect(original.payload.capabilityVerification).toBe('VERIFIED');
    expect(repository.revisions.get(accountA)).toBe(3n);
  });

  it('带新载荷恢复同样拒绝客户端 VERIFIED，VOID 历史及版本保持原状', async () => {
    const repository = new InMemoryLedgerRepository();
    const service = new LedgerCommandService(repository as never);
    const created = await service.createExecution({ command: 'CREATE_EXECUTION', ...commandBase });
    const removed = await service.voidExecution({
      command: 'VOID_EXECUTION',
      accountId: accountA,
      expectedLedgerRevision: '3',
      supersedesEventId: created.eventIds[0],
      reason: '受控作废',
      actorId: commandBase.actorId,
      source: { ...commandBase.source, externalId: 'verification-void' },
    });
    await expect(
      errorCode(
        service.restoreExecution({
          command: 'RESTORE_EXECUTION',
          ...commandBase,
          expectedLedgerRevision: '4',
          supersedesEventId: removed.eventIds[0],
          reason: '受控恢复',
          source: { ...commandBase.source, externalId: 'untrusted-verification-restore' },
          payload: { ...commandBase.payload, capabilityVerification: 'VERIFIED' },
        }),
      ),
    ).resolves.toBe('LEDGER_VALIDATION_FAILED');
    expect(repository.events).toHaveLength(2);
    expect(repository.events[1]?.revisionAction).toBe('VOID');
    expect(repository.revisions.get(accountA)).toBe(4n);
  });

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
      ledgerRevisions: { [accountA]: '3' },
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
    expect(repository.revisions.get(accountA)).toBe(3n);
  });

  it('替代只能连接链末，且重放不受旧 expected Revision 影响', async () => {
    const repository = new InMemoryLedgerRepository();
    const service = new LedgerCommandService(repository as never);
    const created = await service.createExecution({ command: 'CREATE_EXECUTION', ...commandBase });
    const supersedesEventId = created.eventIds[0]!;
    const replace = {
      command: 'REPLACE_EXECUTION',
      ...commandBase,
      expectedLedgerRevision: '3',
      supersedesEventId,
      reason: '修正数量',
      source: { ...commandBase.source, externalId: 'command-replace' },
      payload: { ...commandBase.payload, quantity: '3' },
    };

    const replaced = await service.replaceExecution(replace);
    await expect(service.replaceExecution(replace)).resolves.toMatchObject({
      eventIds: replaced.eventIds,
      idempotentReplay: true,
      ledgerRevisions: { [accountA]: '4' },
    });
    await expect(
      errorCode(
        service.replaceExecution({
          ...replace,
          expectedLedgerRevision: '4',
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
          expectedLedgerRevision: '2',
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
      expectedLedgerRevision: '3',
      supersedesEventId: created.eventIds[0],
      source: { ...commandBase.source, externalId: 'command-void' },
      actorId: 'user-1',
      reason: '重复导入',
    });
    const restored = await service.restoreExecution({
      command: 'RESTORE_EXECUTION',
      ...commandBase,
      expectedLedgerRevision: '4',
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
      expectedLedgerRevision: '3',
      supersedesEventId: created.eventIds[0],
      reason: '修正数量',
      source: source('draft-replace'),
      payload: { ...commandBase.payload, quantity: '3' },
    });
    const voided = await service.voidExecution({
      command: 'VOID_EXECUTION',
      accountId: accountA,
      expectedLedgerRevision: '4',
      supersedesEventId: replaced.eventIds[0],
      source: source('draft-void'),
      actorId: 'user-1',
      reason: '重复导入',
    });
    await service.restoreExecution({
      command: 'RESTORE_EXECUTION',
      ...commandBase,
      expectedLedgerRevision: '5',
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
      expectedSourceLedgerRevision: '3',
      expectedTargetLedgerRevision: '2',
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

    await expect(
      errorCode(
        service.moveExecutionAccount({
          ...moveCommand,
          payload: { ...commandBase.payload, capabilityVerification: 'VERIFIED' },
        }),
      ),
    ).resolves.toBe('LEDGER_VALIDATION_FAILED');
    expect(repository.events).toHaveLength(1);
    expect(repository.revisions.get(accountA)).toBe(3n);
    expect(repository.revisions.get(accountB)).toBe(2n);
    const moved = await service.moveExecutionAccount(moveCommand);
    const replay = await service.moveExecutionAccount(moveCommand);

    expect(repository.lockedAccountOrders[0]).toEqual([accountA, accountB].sort());
    expect(moved.ledgerRevisions).toEqual({ [accountA]: '4', [accountB]: '3' });
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
        expectedSourceLedgerRevision: '3',
        expectedTargetLedgerRevision: '2',
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
    expect(repository.revisions.get(accountA)).toBe(3n);
    expect(repository.revisions.get(accountB)).toBe(2n);
  });
});
