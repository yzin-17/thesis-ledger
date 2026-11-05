import { describe, expect, it, vi } from 'vitest';
import { LedgerCommandService } from '../../src/ledger/ledger-command.service.js';
import {
  accountA,
  accountB,
  commandBase,
  InMemoryLedgerRepository,
  errorCode,
} from './ledger-command.fixture.js';
const command = { command: 'CREATE_EXECUTION', ...commandBase };

describe('成交命令现金不足的原子边界', () => {
  it('新买入在本金加手续费不足时不追加、不推进版本、不调用定投副作用', async () => {
    const repository = new InMemoryLedgerRepository();
    repository.openingBalances.set(accountA, { CNY: '0', USD: '400' });
    const effect = vi.fn();
    const service = new LedgerCommandService(repository as never);
    await expect(
      errorCode(
        service.createExecutionWithEffect(
          {
            ...command,
            payload: {
              ...command.payload,
              charges: [{ category: 'COMMISSION', amount: '1', currency: 'USD' }],
            },
          },
          effect,
        ),
      ),
    ).resolves.toBe('LEDGER_INSUFFICIENT_CASH');
    expect(repository.events).toHaveLength(0);
    expect(repository.revisions.get(accountA)).toBe(2n);
    expect(effect).not.toHaveBeenCalled();
  });
  it('足额创建后原幂等重放仍成功，更正不重复扣除旧成交', async () => {
    const repository = new InMemoryLedgerRepository();
    repository.openingBalances.set(accountA, { CNY: '0', USD: '400' });
    const service = new LedgerCommandService(repository as never);
    const created = await service.createExecution(command);
    expect((await service.createExecution(command)).idempotentReplay).toBe(true);
    const base = {
      ...command,
      command: 'REPLACE_EXECUTION',
      expectedLedgerRevision: '3',
      supersedesEventId: created.eventIds[0],
      reason: '修正价格',
      source: { ...command.source, externalId: 'replace' },
    };
    await expect(
      errorCode(
        service.replaceExecution({ ...base, payload: { ...command.payload, price: '201' } }),
      ),
    ).resolves.toBe('LEDGER_INSUFFICIENT_CASH');
    await expect(
      service.replaceExecution({ ...base, payload: { ...command.payload, price: '199' } }),
    ).resolves.toMatchObject({ ledgerRevisions: { [accountA]: '4' } });
    repository.openingBalances.set(accountA, { CNY: '0', USD: '0' });
    await expect(service.createExecution(command)).resolves.toMatchObject({
      idempotentReplay: true,
    });
  });
  it('恢复和移入目标账户都重新校验，失败不追加任一账户事实', async () => {
    const repository = new InMemoryLedgerRepository();
    const service = new LedgerCommandService(repository as never);
    const created = await service.createExecution(command);
    const removed = await service.voidExecution({
      command: 'VOID_EXECUTION',
      accountId: accountA,
      expectedLedgerRevision: '3',
      supersedesEventId: created.eventIds[0],
      reason: '撤销',
      source: { ...command.source, externalId: 'void' },
      actorId: command.actorId,
    });
    repository.openingBalances.set(accountA, { CNY: '0', USD: '0' });
    await expect(
      errorCode(
        service.restoreExecution({
          ...command,
          command: 'RESTORE_EXECUTION',
          expectedLedgerRevision: '4',
          supersedesEventId: removed.eventIds[0],
          reason: '恢复',
          source: { ...command.source, externalId: 'restore' },
        }),
      ),
    ).resolves.toBe('LEDGER_INSUFFICIENT_CASH');
    expect(repository.events).toHaveLength(2);
    const other = new InMemoryLedgerRepository();
    const moving = new LedgerCommandService(other as never);
    const trade = await moving.createExecution(command);
    other.openingBalances.set(accountB, { CNY: '0', USD: '399' });
    await expect(
      errorCode(
        moving.moveExecutionAccount({
          command: 'MOVE_EXECUTION_ACCOUNT',
          sourceAccountId: accountA,
          targetAccountId: accountB,
          expectedSourceLedgerRevision: '3',
          expectedTargetLedgerRevision: '2',
          supersedesEventId: trade.eventIds[0],
          reason: '更正账户',
          occurredAt: command.occurredAt,
          timePrecision: command.timePrecision,
          sourceTimezone: command.sourceTimezone,
          economicOrderKey: 'move',
          side: 'BUY',
          payload: command.payload,
          source: { ...command.source, externalId: 'move' },
          actorId: command.actorId,
        }),
      ),
    ).resolves.toBe('LEDGER_INSUFFICIENT_CASH');
    expect(other.events).toHaveLength(1);
    expect(other.revisions.get(accountA)).toBe(3n);
    expect(other.revisions.get(accountB)).toBe(2n);
  });
});
