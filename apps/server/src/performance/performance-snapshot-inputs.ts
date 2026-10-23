import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { projectCashBalances } from '../ledger/cash-projection.js';
import { supportedCurrency } from '../market/fx-conversion.js';
import type { PrismaService } from '../platform/prisma.service.js';
import { performanceRelationWhere } from './performance-account-scope.js';
import type { PerformanceDataService } from './performance-data.service.js';
import {
  snapshotPayload,
  type Currency,
  type PerformanceSnapshot,
  type PortfolioMode,
} from './performance-types.js';

type EconomicPosition = {
  symbol: string;
  quantity: number;
  costPrice: number;
  assetType: string;
  currency: Currency;
};
export type SnapshotEconomicInputs = {
  baseCurrency: Currency;
  accountScopePolicy: string;
  disclosureCoverage: number;
  positions: EconomicPosition[];
  cashAmounts: Array<{ accountId: string; currency: Currency; amount: number }>;
};

export async function readCurrentSnapshotInputs(
  prisma: PrismaService,
  data: PerformanceDataService,
  accountId: string | undefined,
  capturedAt: Date,
  mode: PortfolioMode,
  requestedCurrency?: Currency,
): Promise<SnapshotEconomicInputs> {
  const where = performanceRelationWhere(mode, accountId);
  const [positions, ledger, currencies] = await Promise.all([
    prisma.position.findMany({ where, include: { asset: true } }),
    prisma.ledgerEvent.findMany({ where, orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }] }),
    data.accountCurrencies(accountId, mode),
  ]);
  const baseCurrency =
    requestedCurrency ?? (accountId ? currencies.get(accountId) : undefined) ?? 'CNY';
  const cash = projectCashBalances(ledger, capturedAt);
  return {
    baseCurrency,
    accountScopePolicy: accountId ? 'account-v1' : 'investment-only-v1',
    disclosureCoverage: 1,
    positions: positions
      .filter((position) => Number(position.quantity) !== 0)
      .map((position) => ({
        symbol: position.symbol,
        quantity: Number(position.quantity),
        costPrice: Number(position.costPrice),
        assetType: position.asset.assetType,
        currency:
          supportedCurrency(position.asset.currency) ??
          currencies.get(position.accountId) ??
          baseCurrency,
      })),
    cashAmounts: [...cash.entries()].flatMap(([id, byCurrency]) =>
      [...byCurrency.entries()].map(([currency, amount]) => ({
        accountId: id,
        currency: supportedCurrency(currency) ?? baseCurrency,
        amount: amount.toNumber(),
      })),
    ),
  };
}

const invalidFrozenInput = () => new Error('估算快照的冻结经济输入不完整，保持待补齐');
const frozenNumber = (value: unknown) => {
  if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '')
    throw invalidFrozenInput();
  const number = Number(value);
  if (!Number.isFinite(number)) throw invalidFrozenInput();
  return number;
};
const frozenRow = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalidFrozenInput();
  return value as Record<string, unknown>;
};

export function frozenSnapshotInputs(
  snapshot: Pick<PerformanceSnapshot, 'payload' | 'disclosureCoverage'> & {
    baseCurrency?: unknown;
  },
): SnapshotEconomicInputs {
  const payload = snapshotPayload(snapshot.payload);
  const baseCurrency = supportedCurrency(snapshot.baseCurrency);
  const rawCoverage = snapshot.disclosureCoverage;
  const disclosureCoverage = frozenNumber(
    Prisma.Decimal.isDecimal(rawCoverage) ? rawCoverage.toString() : rawCoverage,
  );
  if (disclosureCoverage < 0 || disclosureCoverage > 1) throw invalidFrozenInput();
  if (!baseCurrency || !Array.isArray(payload.positions) || !Array.isArray(payload.cashByCurrency))
    throw invalidFrozenInput();
  const positions = payload.positions
    .map((value) => {
      const row = frozenRow(value);
      const quantity = frozenNumber(row.quantity);
      const costPrice = frozenNumber(row.costPrice);
      const currency = supportedCurrency(row.currency);
      if (
        typeof row.symbol !== 'string' ||
        !row.symbol.trim() ||
        typeof row.assetType !== 'string' ||
        !row.assetType.trim() ||
        !currency ||
        quantity < 0 ||
        costPrice < 0
      )
        throw invalidFrozenInput();
      return { symbol: row.symbol, quantity, costPrice, currency, assetType: row.assetType };
    })
    .filter((position) => position.quantity !== 0);
  const cashAmounts = payload.cashByCurrency.map((value) => {
    const row = frozenRow(value);
    const currency = supportedCurrency(row.currency);
    if (!currency || typeof row.accountId !== 'string' || !row.accountId.trim())
      throw invalidFrozenInput();
    return { accountId: row.accountId, currency, amount: frozenNumber(row.amount) };
  });
  return {
    baseCurrency,
    positions,
    cashAmounts,
    disclosureCoverage,
    accountScopePolicy:
      typeof payload.accountScopePolicy === 'string'
        ? payload.accountScopePolicy
        : 'legacy-all-accounts-v0',
  };
}

export function officialSnapshotEvidenceVersion(
  inputs: SnapshotEconomicInputs,
  positions: Array<
    EconomicPosition & { marketValue: number | null; provider: string; valuationEvidence?: unknown }
  >,
  fxEvidenceVersion: string,
) {
  const prices = positions.map((position) => [
    position.symbol,
    position.assetType,
    position.currency,
    position.quantity,
    position.costPrice,
    position.marketValue,
    position.provider,
    position.valuationEvidence ?? null,
  ]);
  const cash = inputs.cashAmounts.map((row) => [row.accountId, row.currency, row.amount]);
  const byContent = (left: unknown, right: unknown) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right));
  return createHash('sha256')
    .update(
      JSON.stringify({
        version: 'snapshot-official-evidence-v1',
        baseCurrency: inputs.baseCurrency,
        accountScopePolicy: inputs.accountScopePolicy,
        disclosureCoverage: inputs.disclosureCoverage,
        prices: prices.sort(byContent),
        cash: cash.sort(byContent),
        fxEvidenceVersion,
      }),
    )
    .digest('hex');
}
