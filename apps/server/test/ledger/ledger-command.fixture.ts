import { vi } from 'vitest';
import type { LedgerEvent } from '@thesis-ledger/schemas';
import { cashBalanceEvent } from './ledger-event-fixtures.js';
import type {
  AccountLedgerMutation,
  AccountLedgerWriteContext,
  MultiAccountLedgerMutation,
} from '../../src/ledger/ledger-v2.repository.js';

export const accountA = '11111111-1111-4111-8111-111111111111';
export const accountB = '22222222-2222-4222-8222-222222222222';

export const commandBase = {
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
    capabilityVerification: 'UNVERIFIED' as const,
    charges: [],
  },
  source: {
    category: 'MANUAL' as const,
    channel: 'desktop',
    externalId: 'command-create',
  },
  actorId: 'user-1',
};

export const storedFromEvent = (event: LedgerEvent) => ({
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
  envelopeVersion: 3,
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

export class InMemoryLedgerRepository {
  readonly revisions = new Map([
    [accountA, 2n],
    [accountB, 2n],
  ]);
  readonly generations = new Map([
    [accountA, 2n],
    [accountB, 2n],
  ]);
  readonly events: LedgerEvent[] = [];
  readonly openingBalances = new Map([
    [accountA, { CNY: '10000', USD: '10000' }],
    [accountB, { CNY: '10000', USD: '10000' }],
  ]);
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

  async appendRevision(context: AccountLedgerWriteContext, event: LedgerEvent) {
    if (this.failAppendForAccount === context.accountId) throw new Error('append failed');
    this.events.push(event);
    return event;
  }

  private contexts(accountIds: string[]) {
    const contexts = new Map<string, AccountLedgerWriteContext>();
    const ledgerEvent = {
      findUnique: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        let event: LedgerEvent | undefined;
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
      findMany: vi.fn(async ({ where }: { where: { accountId: string } }) => {
        const opening = this.openingBalances.get(where.accountId);
        const baselines = Object.entries(opening ?? {}).map(([currency, amount], index) => ({
          ...cashBalanceEvent({
            id: `opening-${where.accountId}-${currency}`,
            accountId: where.accountId,
            amount,
            currency,
            occurredAt: '2025-01-01T00:00:00Z',
          }),
          ledgerRevision: BigInt(index + 1),
        }));
        return [
          ...baselines,
          ...this.events
            .filter((event) => event.accountId === where.accountId)
            .map(storedFromEvent),
        ];
      }),
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

export const errorCode = async (operation: Promise<unknown>) => {
  try {
    await operation;
  } catch (error) {
    const response = (error as { getResponse?: () => unknown }).getResponse?.();
    return (response as { errorCode?: string } | undefined)?.errorCode;
  }
  throw new Error('期望命令失败');
};
