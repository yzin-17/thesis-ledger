import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  currencySchema,
  researchPortfolioMaterialV2Schema,
  researchScopeSnapshotV2Schema,
  type ResearchSubmissionV2,
} from '@thesis-ledger/schemas';
import type { InstrumentService } from '../market/instrument.service.js';
import type { ResearchPreparedContext } from './research-preparation-contract.js';

const knownCurrency = (value: string) => {
  const parsed = currencySchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};
const tooLarge = () =>
  new BadRequestException({
    code: 'RESEARCH_SCOPE_TOO_LARGE',
    message: '研究范围超过本次准备预算，请缩小范围',
  });
async function readCashRows(transaction: Prisma.TransactionClient, accountIds: string[]) {
  const [balances, states] = await Promise.all([
    transaction.cashBalance.findMany({
      where: { accountId: { in: accountIds } },
      take: 3001,
      orderBy: [{ accountId: 'asc' }, { currency: 'asc' }],
    }),
    transaction.accountLedgerState.findMany({ where: { accountId: { in: accountIds } } }),
  ]);
  if (balances.length > 3000) throw tooLarge();
  const stateByAccount = new Map(states.map((state) => [state.accountId, state]));
  return balances.map((balance) => {
    const state = stateByAccount.get(balance.accountId);
    let projectionStatus: 'current' | 'stale' | 'unknown' = 'unknown';
    if (state && state.projectionGeneration > 0n)
      projectionStatus =
        state.projectionGeneration === balance.projectionGeneration ? 'current' : 'stale';
    return {
      accountId: balance.accountId,
      currency: knownCurrency(balance.currency),
      settledAmount: balance.settledAmount.toFixed(),
      pendingReceivable: balance.pendingReceivable.toFixed(),
      pendingPayable: balance.pendingPayable.toFixed(),
      completeness: balance.completeness,
      issues: balance.issues,
      projectionGeneration: balance.projectionGeneration.toString(),
      asOfLedgerRevision: state?.ledgerRevision.toString() ?? null,
      asOfProjectionGeneration: state?.projectionGeneration.toString() ?? null,
      projectionStatus,
      updatedAt: balance.updatedAt.toISOString(),
    };
  });
}

export async function readLedgerResearchContext(
  transaction: Prisma.TransactionClient,
  instruments: InstrumentService,
  input: ResearchSubmissionV2,
): Promise<ResearchPreparedContext> {
  const selection = input.scope;
  if (selection.scope === 'instrument' || selection.scope === 'strategy')
    throw new BadRequestException('账本范围无效');
  const accounts = await transaction.account.findMany({
    where: {
      mode: input.mode,
      active: true,
      ...(selection.scope === 'portfolio' ? {} : { id: selection.accountId }),
    },
    select: { id: true, name: true, currency: true },
    take: 1001,
    orderBy: { id: 'asc' },
  });
  if (accounts.length > 1000) throw tooLarge();
  if (selection.scope !== 'portfolio' && accounts.length !== 1)
    throw new BadRequestException('账户已停用或与当前模式不一致');
  const accountIds = accounts.map((account) => account.id);
  const positions = await transaction.position.findMany({
    where: {
      accountId: { in: accountIds },
      ...(selection.scope === 'position' ? { symbol: selection.symbol } : {}),
    },
    select: {
      accountId: true,
      symbol: true,
      quantity: true,
      costPrice: true,
      updatedAt: true,
      asset: { select: { currency: true } },
    },
    take: 10001,
    orderBy: [{ accountId: 'asc' }, { symbol: 'asc' }],
  });
  if (positions.length > 10000) throw tooLarge();
  const balances =
    selection.scope === 'position' ? [] : await readCashRows(transaction, accountIds);
  const symbols = [...new Set(positions.map((position) => position.symbol))].sort();
  if (symbols.length > 1000) throw tooLarge();
  const canonical = await instruments.resolveCanonicalSymbols(symbols, transaction);
  if (canonical.items.length > 10) throw tooLarge();
  const fetchedAt = new Date().toISOString();
  const base = { version: 'research-scope-v2', mode: input.mode, confirmedAt: fetchedAt };
  let scope: unknown;
  if (selection.scope === 'portfolio')
    scope = {
      ...base,
      scope: 'portfolio',
      portfolioId: null,
      accountIds,
      instruments: canonical.items,
    };
  else if (selection.scope === 'account')
    scope = {
      ...base,
      scope: 'account',
      accountId: selection.accountId,
      instruments: canonical.items,
    };
  else {
    const instrument = canonical.items.find((item) => item.symbol === selection.symbol);
    if (positions.length !== 1 || !instrument)
      throw new NotFoundException('持仓不存在或规范标的身份尚未解析');
    scope = { ...base, scope: 'position', accountId: selection.accountId, instrument };
  }
  const data = researchPortfolioMaterialV2Schema.parse({
    version: 'research-portfolio-material-v2',
    mode: input.mode,
    scope: selection.scope,
    accounts: accounts.map((account) => ({
      accountId: account.id,
      name: account.name,
      currency: knownCurrency(account.currency),
    })),
    positions: positions.map((position) => ({
      accountId: position.accountId,
      symbol: position.symbol,
      quantity: position.quantity.toFixed(),
      costPrice: position.costPrice.toFixed(),
      currency: knownCurrency(position.asset.currency),
      updatedAt: position.updatedAt.toISOString(),
    })),
    cashBalances: balances,
    unresolvedSymbols: canonical.unresolvedSymbols,
  });
  return {
    scopeSnapshot: researchScopeSnapshotV2Schema.parse(scope),
    privateMaterial: data,
    fetchedAt,
    reasons: [],
  };
}
