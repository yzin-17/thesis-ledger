import { z } from 'zod';
import { currencySchema } from './market.js';
import { decimalStringSchema } from './monetary-values.js';
import { strategySchema } from './backtest-strategy.js';
import type { ResearchScopeSnapshotV2 } from './research-scope-v2.js';

const symbol = z.string().min(1).max(256);
const mode = z.enum(['actual', 'shadow']);
export const researchPortfolioMaterialV2Schema = z
  .strictObject({
    version: z.literal('research-portfolio-material-v2'),
    mode,
    scope: z.enum(['portfolio', 'account', 'position']),
    accounts: z
      .array(
        z.strictObject({
          accountId: z.uuid(),
          name: z.string().max(1000),
          currency: currencySchema.nullable(),
        }),
      )
      .max(1000),
    positions: z
      .array(
        z.strictObject({
          accountId: z.uuid(),
          symbol,
          quantity: decimalStringSchema,
          costPrice: decimalStringSchema,
          currency: currencySchema.nullable(),
          updatedAt: z.iso.datetime({ offset: true }),
        }),
      )
      .max(10_000),
    cashBalances: z
      .array(
        z.strictObject({
          accountId: z.uuid(),
          currency: currencySchema.nullable(),
          settledAmount: decimalStringSchema,
          pendingReceivable: decimalStringSchema,
          pendingPayable: decimalStringSchema,
          completeness: z.string().min(1).max(128),
          issues: z.json(),
          projectionGeneration: z.string().regex(/^\d+$/),
          asOfLedgerRevision: z.string().regex(/^\d+$/).nullable().default(null),
          asOfProjectionGeneration: z.string().regex(/^\d+$/).nullable().default(null),
          projectionStatus: z.enum(['current', 'stale', 'unknown']).default('unknown'),
          updatedAt: z.iso.datetime({ offset: true }),
        }),
      )
      .max(3000),
    unresolvedSymbols: z.array(symbol).max(1000),
  })
  .superRefine((value, context) => {
    const ids = new Set(value.accounts.map((account) => account.accountId));
    if (
      value.cashBalances.some(
        (balance) =>
          balance.projectionStatus === 'current' &&
          (balance.asOfLedgerRevision === null ||
            balance.asOfProjectionGeneration !== balance.projectionGeneration ||
            balance.projectionGeneration === '0'),
      )
    )
      context.addIssue({ code: 'custom', message: '当前现金材料缺少匹配的已记录投影代次' });
    if (
      ids.size !== value.accounts.length ||
      value.positions.some((position) => !ids.has(position.accountId))
    )
      context.addIssue({ code: 'custom', message: '账本材料的账户身份重复或持仓越界' });
    if (
      value.cashBalances.some((balance) => !ids.has(balance.accountId)) ||
      new Set(value.cashBalances.map((balance) => `${balance.accountId}:${balance.currency}`))
        .size !== value.cashBalances.length
    )
      context.addIssue({ code: 'custom', message: '现金材料的账户越界或身份重复' });
    if (
      new Set(value.positions.map((position) => `${position.accountId}:${position.symbol}`))
        .size !== value.positions.length
    )
      context.addIssue({ code: 'custom', message: '账本材料的持仓身份重复' });
    if (new Set(value.unresolvedSymbols).size !== value.unresolvedSymbols.length)
      context.addIssue({ code: 'custom', message: '未解析标的身份重复' });
  });
export const researchStrategyMaterialV2Schema = z
  .strictObject({
    version: z.literal('research-strategy-material-v2'),
    mode,
    strategyVersionId: z.uuid(),
    strategyId: z.uuid(),
    schemaVersion: z.number().int().positive(),
    definition: strategySchema,
    unresolvedSymbols: z.array(symbol).max(1000),
  })
  .refine(
    (value) => value.schemaVersion === Number(value.definition.schemaVersion),
    '策略版本与定义合同不一致',
  );
export const researchPrivateMaterialV2Schema = z.discriminatedUnion('version', [
  researchPortfolioMaterialV2Schema,
  researchStrategyMaterialV2Schema,
]);
export type ResearchPrivateMaterialV2 = z.infer<typeof researchPrivateMaterialV2Schema>;

/** 冻结的私人事实只能消费该次明确选择的账户、持仓或策略版本。 */
export function researchPrivateMaterialMatchesScopeV2(
  raw: unknown,
  scope: ResearchScopeSnapshotV2,
  kind: 'portfolio' | 'strategy',
) {
  const parsed = researchPrivateMaterialV2Schema.safeParse(raw);
  if (!parsed.success || parsed.data.mode !== scope.mode) return false;
  const material = parsed.data;
  if (material.version === 'research-strategy-material-v2')
    return (
      kind === 'strategy' &&
      scope.scope === 'strategy' &&
      material.strategyVersionId === scope.strategyVersionId
    );
  if (kind !== 'portfolio') return false;
  if (scope.scope === 'instrument' || scope.scope === 'strategy' || material.scope !== scope.scope)
    return false;
  let accountIds: string[];
  if (scope.scope === 'portfolio') accountIds = scope.accountIds;
  else accountIds = [scope.accountId];
  if (
    material.accounts.length !== accountIds.length ||
    material.accounts.some((account) => !accountIds.includes(account.accountId))
  )
    return false;
  if (scope.scope === 'position')
    return (
      material.cashBalances.length === 0 &&
      material.positions.length === 1 &&
      material.positions[0]?.accountId === scope.accountId &&
      material.positions[0].symbol === scope.instrument.symbol
    );
  const symbols = new Set(scope.instruments.map((instrument) => instrument.symbol));
  return (
    material.positions.every(
      (position) =>
        symbols.has(position.symbol) || material.unresolvedSymbols.includes(position.symbol),
    ) &&
    material.unresolvedSymbols.every((symbol) =>
      material.positions.some((position) => position.symbol === symbol),
    )
  );
}
