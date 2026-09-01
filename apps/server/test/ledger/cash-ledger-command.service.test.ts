import { describe, expect, it, vi } from 'vitest';
import type { LedgerEventV2 } from '@thesis-ledger/schemas';
import { CashLedgerCommandService } from '../../src/ledger/cash-ledger-command.service.js';
import { projectCashBalances, type StoredCashEvent } from '../../src/ledger/cash-projection.js';
import type {
  AccountLedgerMutation,
  AccountLedgerWriteContext,
  MultiAccountLedgerMutation,
} from '../../src/ledger/ledger-v2.repository.js';

vi.mock('../../src/ledger/ledger-projection.js', () => ({
  rebuildLedgerProjection: vi.fn(async () => ({ positions: [], cash: [] })),
}));

const cashAccount = '11111111-1111-4111-8111-111111111111';
const investmentAccount = '22222222-2222-4222-8222-222222222222';

const storedFromEvent = (event: LedgerEventV2) => ({
  id: event.eventId,
  accountId: event.accountId,
  type: event.type,
  occurredAt: event.occurredAt === null ? null : new Date(event.occurredAt),
  createdAt: new Date(event.recordedAt),
  factId: event.factId,
  ledgerRevision: BigInt(event.ledgerRevision),
  timePrecision: event.timePrecision,
  sourceTimezone: event.sourceTimezone,
  economicOrderKey: event.economicOrderKey,
  recordedAt: new Date(event.recordedAt),
  projectionGeneration: BigInt(event.ledgerRevision),
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

class InMemoryCashRepository {
  readonly events: LedgerEventV2[] = [];
  readonly revisions = new Map([
    [cashAccount, 0n],
    [investmentAccount, 0n],
  ]);
  readonly generations = new Map([
    [cashAccount, 0n],
    [investmentAccount, 0n],
  ]);
  readonly accounts = new Map([
    [cashAccount, { id: cashAccount, active: true, mode: 'actual', type: 'cash', currency: 'CNY' }],
    [
      investmentAccount,
      {
        id: investmentAccount,
        active: true,
        mode: 'actual',
        type: 'securities',
        currency: 'CNY',
      },
    ],
  ]);
  failAppendForAccount?: string;

  async withAccountWrite<T>(
    accountId: string,
    operation: (context: AccountLedgerWriteContext) => Promise<AccountLedgerMutation<T>>,
  ) {
    const context = this.context(accountId);
    const before = [...this.events];
    try {
      const mutation = await operation(context);
      if (mutation.advanceRevision) this.advance(accountId);
      return {
        value: mutation.value,
        ledgerRevision: this.revisions.get(accountId)!.toString(),
        projectionGeneration: this.generations.get(accountId)!.toString(),
      };
    } catch (error) {
      this.events.splice(0, this.events.length, ...before);
      throw error;
    }
  }

  async withAccountsWrite<T>(
    accountIds: string[],
    operation: (
      contexts: Map<string, AccountLedgerWriteContext>,
    ) => Promise<MultiAccountLedgerMutation<T>>,
  ) {
    const ordered = [...new Set(accountIds)].sort();
    const contexts = new Map(ordered.map((accountId) => [accountId, this.context(accountId)]));
    const before = [...this.events];
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
      this.events.splice(0, this.events.length, ...before);
      throw error;
    }
  }

  async appendRevision(context: AccountLedgerWriteContext, event: LedgerEventV2) {
    if (this.failAppendForAccount === context.accountId) throw new Error('append failed');
    this.events.push(event);
    return event;
  }

  balances() {
    return projectCashBalances(this.events.map(storedFromEvent) as StoredCashEvent[]);
  }

  private context(accountId: string): AccountLedgerWriteContext {
    const ledgerEvent = {
      findUnique: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        let event: LedgerEventV2 | undefined;
        if (typeof where.id === 'string')
          event = this.events.find((candidate) => candidate.eventId === where.id);
        else if (typeof where.supersedesEventId === 'string')
          event = this.events.find(
            (candidate) => candidate.supersedesEventId === where.supersedesEventId,
          );
        else if (where.accountId_sourceChannel_externalId) {
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
      findMany: vi.fn(async () => this.events.map(storedFromEvent)),
    };
    const account = {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => this.accounts.get(where.id)),
    };
    const revision = this.revisions.get(accountId) ?? 0n;
    const generation = this.generations.get(accountId) ?? 0n;
    return {
      transaction: { ledgerEvent, account } as never,
      accountId,
      currentLedgerRevision: revision,
      nextLedgerRevision: revision + 1n,
      currentProjectionGeneration: generation,
      nextProjectionGeneration: generation + 1n,
    };
  }

  private advance(accountId: string) {
    this.revisions.set(accountId, (this.revisions.get(accountId) ?? 0n) + 1n);
    this.generations.set(accountId, (this.generations.get(accountId) ?? 0n) + 1n);
  }
}

const source = (externalId: string) => ({
  category: 'MANUAL' as const,
  channel: 'desktop',
  externalId,
});

const cashFlowCommand = (externalId = 'salary-2026-08') => ({
  command: 'CREATE_CASH_FLOW' as const,
  accountId: cashAccount,
  occurredAt: '2026-08-30T01:00:00.000Z',
  timePrecision: 'INSTANT' as const,
  sourceTimezone: 'Asia/Shanghai',
  economicOrderKey: `cash:${externalId}`,
  payload: {
    direction: 'INFLOW' as const,
    category: 'DEPOSIT' as const,
    amount: '1000',
    currency: 'CNY',
    note: '工资',
  },
  source: source(externalId),
  actorId: 'user-1',
});

const transferCommand = (externalId = 'transfer-2026-08') => ({
  command: 'CREATE_CASH_TRANSFER' as const,
  transferId: '33333333-3333-4333-8333-333333333333',
  sourceAccountId: cashAccount,
  targetAccountId: investmentAccount,
  expectedSourceLedgerRevision: '1',
  expectedTargetLedgerRevision: '0',
  occurredAt: '2026-08-30T02:00:00.000Z',
  timePrecision: 'INSTANT' as const,
  sourceTimezone: 'Asia/Shanghai',
  economicOrderKey: 'transfer:2026-08',
  amount: '400',
  currency: 'CNY',
  source: source(externalId),
  actorId: 'user-1',
});

const errorCode = async (operation: Promise<unknown>) => {
  try {
    await operation;
  } catch (error) {
    const response = (error as { getResponse?: () => unknown }).getResponse?.();
    return (response as { errorCode?: string } | undefined)?.errorCode;
  }
  throw new Error('期望命令失败');
};

describe('现金 Ledger 命令', () => {
  it('外部入金幂等重放且只写入一次', async () => {
    const repository = new InMemoryCashRepository();
    const commands = new CashLedgerCommandService(repository as never);

    const first = await commands.createCashFlow(cashFlowCommand());
    const replay = await commands.createCashFlow(cashFlowCommand());

    expect(first.idempotentReplay).toBe(false);
    expect(replay).toMatchObject({ eventIds: first.eventIds, idempotentReplay: true });
    expect(repository.events).toHaveLength(1);
    expect(repository.balances().get(cashAccount)?.get('CNY')?.toString()).toBe('1000');
  });

  it('现金划转原子写入两端并保留共同 transferId', async () => {
    const repository = new InMemoryCashRepository();
    const commands = new CashLedgerCommandService(repository as never);
    await commands.createCashFlow(cashFlowCommand());

    const result = await commands.createCashTransfer(transferCommand());
    const legs = repository.events.slice(-2);

    expect(result.ledgerRevisions).toEqual({ [cashAccount]: '2', [investmentAccount]: '1' });
    expect(legs.map((event) => event.accountId)).toEqual([cashAccount, investmentAccount]);
    expect(
      legs.map((event) =>
        event.type === 'CASH_FLOW' && 'payload' in event
          ? event.payload.transfer?.transferId
          : undefined,
      ),
    ).toEqual(['33333333-3333-4333-8333-333333333333', '33333333-3333-4333-8333-333333333333']);
    expect(repository.balances().get(cashAccount)?.get('CNY')?.toString()).toBe('600');
    expect(repository.balances().get(investmentAccount)?.get('CNY')?.toString()).toBe('400');
  });

  it('余额不足时两端都不写入', async () => {
    const repository = new InMemoryCashRepository();
    const commands = new CashLedgerCommandService(repository as never);
    await commands.createCashFlow(cashFlowCommand());

    await expect(
      errorCode(commands.createCashTransfer({ ...transferCommand(), amount: '1200' })),
    ).resolves.toBe('LEDGER_INSUFFICIENT_CASH');
    expect(repository.events).toHaveLength(1);
    expect(repository.revisions.get(cashAccount)).toBe(1n);
    expect(repository.revisions.get(investmentAccount)).toBe(0n);
  });

  it('第二端写入失败时回滚第一端', async () => {
    const repository = new InMemoryCashRepository();
    const commands = new CashLedgerCommandService(repository as never);
    await commands.createCashFlow(cashFlowCommand());
    repository.failAppendForAccount = investmentAccount;

    await expect(commands.createCashTransfer(transferCommand())).rejects.toThrow('append failed');
    expect(repository.events).toHaveLength(1);
    expect(repository.revisions.get(cashAccount)).toBe(1n);
    expect(repository.revisions.get(investmentAccount)).toBe(0n);
  });

  it('划转作废与恢复始终成对改变余额', async () => {
    const repository = new InMemoryCashRepository();
    const commands = new CashLedgerCommandService(repository as never);
    await commands.createCashFlow(cashFlowCommand());
    const created = await commands.createCashTransfer(transferCommand());

    const voided = await commands.voidCashTransfer({
      command: 'VOID_CASH_TRANSFER',
      transferId: transferCommand().transferId,
      sourceAccountId: cashAccount,
      targetAccountId: investmentAccount,
      expectedSourceLedgerRevision: '2',
      expectedTargetLedgerRevision: '1',
      supersedesSourceEventId: created.eventIds[0],
      supersedesTargetEventId: created.eventIds[1],
      source: source('transfer-void'),
      actorId: 'user-1',
      reason: '录入错误',
    });
    expect(repository.balances().get(cashAccount)?.get('CNY')?.toString()).toBe('1000');
    expect(repository.balances().get(investmentAccount)?.get('CNY')?.toString() ?? '0').toBe('0');

    await commands.restoreCashTransfer({
      ...transferCommand('transfer-restore'),
      command: 'RESTORE_CASH_TRANSFER',
      expectedSourceLedgerRevision: '3',
      expectedTargetLedgerRevision: '2',
      supersedesSourceEventId: voided.eventIds[0],
      supersedesTargetEventId: voided.eventIds[1],
      reason: '撤销误作废',
    });
    expect(repository.balances().get(cashAccount)?.get('CNY')?.toString()).toBe('600');
    expect(repository.balances().get(investmentAccount)?.get('CNY')?.toString()).toBe('400');
  });
});
