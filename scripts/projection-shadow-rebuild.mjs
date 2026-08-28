import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { compareProjectionSnapshots } from '../packages/domain/dist/index.js';
import { rebuildCoreProjections } from '../apps/server/dist/src/ledger/core-projection.js';

const serverRequire = createRequire(new URL('../apps/server/dist/src/main.js', import.meta.url));
const { PrismaClient } = serverRequire('@prisma/client');

const argument = (name) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
};

const accountId = argument('--account-id');
const mode = argument('--mode');
const outputPath = argument('--output');
const baselinePath = argument('--baseline');
const prisma = new PrismaClient();

const snapshot = async (client, id) => {
  const [account, positions, trades, cash] = await Promise.all([
    client.account.findUnique({ where: { id }, select: { id: true, mode: true } }),
    client.position.findMany({
      where: { accountId: id },
      select: { symbol: true, quantity: true, costPrice: true },
      orderBy: { symbol: 'asc' },
    }),
    client.trade.findMany({
      where: { accountId: id },
      select: {
        id: true,
        symbol: true,
        lifecycle: true,
        closedQuantity: true,
        remainingQuantity: true,
        netRealizedPnl: true,
        costEstimated: true,
        completeness: true,
        projectionFingerprint: true,
        closeSlices: { select: { id: true } },
      },
      orderBy: { id: 'asc' },
    }),
    client.cashBalance.findMany({
      where: { accountId: id },
      select: {
        currency: true,
        settledAmount: true,
        pendingReceivable: true,
        pendingPayable: true,
      },
      orderBy: { currency: 'asc' },
    }),
  ]);
  if (!account) throw new Error(`账户不存在: ${id}`);
  const modeValue = account.mode === 'shadow' ? 'shadow' : 'actual';
  return {
    accountId: id,
    mode: modeValue,
    positions: positions.map((position) => ({
      symbol: position.symbol,
      quantity: position.quantity.toString(),
      averageCost: position.costPrice.toString(),
      realizedPnl: null,
      evidenceComplete: true,
    })),
    trades: trades.map((trade) => ({
      id: trade.id,
      symbol: trade.symbol,
      lifecycle: trade.lifecycle,
      closedQuantity: trade.closedQuantity.toString(),
      remainingQuantity: trade.remainingQuantity.toString(),
      netRealizedPnl: trade.netRealizedPnl?.toString() ?? null,
      costEstimated: trade.costEstimated,
      evidenceComplete: trade.completeness === 'COMPLETE',
    })),
    cash: cash.map((balance) => ({
      currency: balance.currency,
      settledAmount: balance.settledAmount.toString(),
      pendingReceivable: balance.pendingReceivable.toString(),
      pendingPayable: balance.pendingPayable.toString(),
    })),
    journal: {
      tradeCycleCount: trades.length,
      closeSliceCount: trades.reduce((count, trade) => count + trade.closeSlices.length, 0),
      statisticsEligibleCount: trades.filter(
        (trade) =>
          trade.lifecycle === 'ENDED' &&
          trade.completeness === 'COMPLETE' &&
          !trade.costEstimated &&
          trade.netRealizedPnl !== null &&
          trade.projectionFingerprint !== null,
      ).length,
    },
  };
};

const accountIds = accountId
  ? [accountId]
  : (
      await prisma.account.findMany({
        where: mode ? { mode } : {},
        select: { id: true },
        orderBy: { id: 'asc' },
      })
    ).map((account) => account.id);

const results = [];
try {
  for (const id of accountIds) {
    let dryRunResult;
    try {
      await prisma.$transaction(async (transaction) => {
        const before = await snapshot(transaction, id);
        const rebuild = await rebuildCoreProjections(transaction, id, { method: 'AVG' });
        const shadow = await snapshot(transaction, id);
        dryRunResult = {
          accountId: id,
          before,
          shadow,
          rebuild,
          rebuildStability: compareProjectionSnapshots(before, shadow),
          rolledBack: true,
        };
        throw new Error('__PROJECTION_SHADOW_ROLLBACK__');
      });
    } catch (error) {
      if (error?.message !== '__PROJECTION_SHADOW_ROLLBACK__') throw error;
    }
    results.push(dryRunResult);
  }
} finally {
  await prisma.$disconnect();
}

const output = {
  schemaVersion: 1,
  dryRun: true,
  sourceLedgerMutated: false,
  accounts: results,
};
if (results.some((result) => result.rebuildStability.gate.status !== 'PASS')) process.exitCode = 2;
if (baselinePath) {
  const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
  output.comparisons = results.map((result) => {
    const legacy =
      baseline.accounts?.find((item) => item.accountId === result.accountId) ?? baseline.legacy;
    if (!legacy) throw new Error(`缺少账户 ${result.accountId} 的 legacy 快照`);
    return {
      accountId: result.accountId,
      report: compareProjectionSnapshots(legacy, result.shadow),
    };
  });
  if (output.comparisons.some((comparison) => comparison.report.gate.status !== 'PASS'))
    process.exitCode = 2;
}
const serialized = `${JSON.stringify(
  output,
  (_key, value) => (typeof value === 'bigint' ? value.toString() : value),
  2,
)}\n`;
if (outputPath) await writeFile(outputPath, serialized, 'utf8');
else process.stdout.write(serialized);
