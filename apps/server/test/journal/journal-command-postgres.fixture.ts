import { PrismaClient } from '@prisma/client';
import { createExecutionCommandSchema } from '@thesis-ledger/schemas';
import { LedgerCommandService } from '../../src/ledger/ledger-command.service.js';
import { LedgerV2Repository } from '../../src/ledger/ledger-v2.repository.js';
import { TradeQueryService } from '../../src/ledger/trade-query.service.js';
import { JournalReviewQuery } from '../../src/journal/journal-review-query.js';
import { JournalReviewSnapshots } from '../../src/journal/journal-review-snapshots.js';

export const readJournalEconomicRows = async (client: PrismaClient, accountId: string) => ({
  events: await client.ledgerEvent.findMany({ where: { accountId }, orderBy: { id: 'asc' } }),
  state: await client.accountLedgerState.findUnique({ where: { accountId } }),
  trade: await client.trade.findMany({
    where: { accountId },
    include: {
      entryLegs: true,
      closeSlices: { include: { allocations: true } },
      evidenceSources: true,
    },
  }),
  cash: await client.cashBalance.findMany({ where: { accountId } }),
});

export function journalExecutionFixture(accountId: string, symbol: string, prefix: string) {
  return (side: 'BUY' | 'SELL', quantity: string, price: string, day: number, label: string) =>
    createExecutionCommandSchema.parse({
      command: 'CREATE_EXECUTION',
      accountId,
      side,
      occurredAt: `2026-01-0${day}T09:00:00Z`,
      timePrecision: 'INSTANT',
      sourceTimezone: 'UTC',
      economicOrderKey: `${day}-${label}`,
      actorId: 'journal-isolated-fixture',
      source: { category: 'MANUAL', channel: 'journal-isolated', externalId: `${prefix}-${label}` },
      payload: {
        symbol,
        quantity,
        price,
        currency: 'USD',
        capabilityVerification: 'VERIFIED',
        charges: [
          { category: 'COMMISSION', amount: side === 'BUY' ? '0.2' : '0.1', currency: 'USD' },
        ],
      },
    });
}

export async function createJournalCommandFixture(
  owner: PrismaClient,
  databaseUrl: string,
  accountId: string,
  symbol: string,
  execution: ReturnType<typeof journalExecutionFixture>,
) {
  const url = new URL(databaseUrl);
  if (url.hostname !== '127.0.0.1' || url.pathname !== '/journal_review_fixture')
    throw new Error('仅允许复盘专用隔离数据库');
  const rows = await owner.$queryRaw<
    Array<{ name: string; owner: string }>
  >`SELECT current_database() AS name, current_user AS owner`;
  if (
    rows.length !== 1 ||
    rows[0]!.name !== 'journal_review_fixture' ||
    rows[0]!.owner !== 'fixture_owner'
  )
    throw new Error('隔离数据库身份不符');
  await owner.account.create({
    data: { id: accountId, name: '隔离复盘真实命令账户', type: 'securities', mode: 'actual' },
  });
  await owner.asset.create({
    data: {
      symbol,
      name: '隔离命令资产',
      market: 'US',
      assetType: 'stock',
      currency: 'USD',
      identityStatus: 'confirmed',
    },
  });
  url.username = 'fixture_app';
  const app = new PrismaClient({ datasourceUrl: url.toString() });
  try {
    const trades = new TradeQueryService(app as never);
    const candidates = new JournalReviewQuery(app as never, trades);
    const snapshots = new JournalReviewSnapshots(app as never, candidates);
    const commands = new LedgerCommandService(new LedgerV2Repository(app as never));
    await commands.createExecution(execution('BUY', '2.000000000000000001', '10', 1, 'buy'));
    await commands.createExecution(execution('SELL', '1', '12', 2, 'sell-1'));
    const last = await commands.createExecution(
      execution('SELL', '1.000000000000000001', '13', 3, 'sell-2'),
    );
    const tradeId = (await trades.readAccountProjection({ accountId, mode: 'actual' })).details[0]!
      .id;
    const plan = await app.tradePlan.create({
      data: {
        accountId,
        tradeId,
        symbol,
        plannedEntry: '10',
        plannedExit: '13',
        stopLoss: '9',
        thesis: '隔离计划',
        expectedHoldingDays: 2,
      },
    });
    return {
      app,
      trades,
      candidates,
      snapshots,
      commands,
      tradeId,
      planId: plan.id,
      lastSellEventId: last.eventIds[0]!,
    };
  } catch (error) {
    await app.$disconnect();
    throw error;
  }
}
