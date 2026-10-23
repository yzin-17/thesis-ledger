import { DecimalValue } from '@thesis-ledger/domain';
import { riskAccountContextSchema, riskPortfolioContextSchema } from '@thesis-ledger/schemas';
import type {
  AccountContext,
  PortfolioContext,
  PositionContext,
  SecurityContext,
} from './risk-types.js';

const latest = <T extends { marketTime: string }>(rows: readonly T[]) =>
  [...rows].sort((a, b) => b.marketTime.localeCompare(a.marketTime))[0];

const quality = (contexts: readonly SecurityContext[]) => {
  const combined: Record<string, string> = {};
  for (const context of contexts) {
    for (const [key, value] of Object.entries(context.dataQuality)) {
      if (combined[key] === 'unavailable' || combined[key] === 'stale') continue;
      combined[key] = value;
    }
  }
  return combined;
};

const positionsFor = (contexts: readonly SecurityContext[], scope: 'account' | 'portfolio') => {
  const explicit = latest(contexts.filter((context) => context.positions !== undefined));
  if (explicit?.positions) return explicit.positions;
  const bySymbol = new Map<string, PositionContext>();
  for (const context of contexts) {
    let weight = context.weight;
    if (scope === 'account' && context.dataQuality.accountWeight !== undefined)
      weight = context.accountWeight;
    if (weight === undefined) continue;
    const previous = bySymbol.get(context.symbol)?.weight ?? 0;
    const total = Number(DecimalValue.from(String(previous)).plus(String(weight)).toString());
    // 浮点接口的末位舍入不得把经济上等于 1 的权重变成非法输入。
    const bounded = total > 1 && total <= 1 + Number.EPSILON * 4 ? 1 : total;
    bySymbol.set(context.symbol, { symbol: context.symbol, weight: bounded });
  }
  return bySymbol.size > 0 ? [...bySymbol.values()] : undefined;
};

const aggregate = (contexts: readonly SecurityContext[], scope: 'account' | 'portfolio') => {
  const current = latest(contexts)!;
  const source = latest(
    contexts.filter(
      (row) =>
        row.portfolioValues !== undefined ||
        row.performance !== undefined ||
        row.returns !== undefined,
    ),
  );
  const positions = positionsFor(contexts, scope);
  return {
    mode: current.mode,
    marketTime: current.marketTime,
    dataQuality: quality(contexts),
    ...(positions === undefined ? {} : { positions }),
    ...(source?.portfolioValues === undefined ? {} : { portfolioValues: source.portfolioValues }),
    ...(source?.performance === undefined ? {} : { performance: source.performance }),
    ...(source?.returns === undefined ? {} : { returns: source.returns }),
  };
};

export const deriveAccountContexts = (security: readonly SecurityContext[]): AccountContext[] => {
  const grouped = new Map<string, SecurityContext[]>();
  for (const context of security) {
    if (!context.accountId) continue;
    const rows = grouped.get(context.accountId) ?? [];
    rows.push(context);
    grouped.set(context.accountId, rows);
  }
  return [...grouped].map(([accountId, contexts]) =>
    riskAccountContextSchema.parse({
      accountId,
      ...aggregate(contexts, 'account'),
    }),
  );
};

export const derivePortfolioContext = (
  security: readonly SecurityContext[],
): PortfolioContext | undefined =>
  security.length === 0
    ? undefined
    : riskPortfolioContextSchema.parse(aggregate(security, 'portfolio'));

export const concentrationGroups = (contexts: readonly SecurityContext[]) => {
  const grouped = new Map<string, SecurityContext[]>();
  for (const context of contexts) {
    const rows = grouped.get(context.symbol) ?? [];
    rows.push(context);
    grouped.set(context.symbol, rows);
  }
  return [...grouped.values()].map((rows) => ({
    context: { ...rows[0]!, dataQuality: quality(rows) },
    weight: rows.some((row) => row.weight === undefined)
      ? undefined
      : Number(
          rows
            .reduce((sum, row) => sum.plus(String(row.weight)), DecimalValue.from('0'))
            .toString(),
        ),
    affectedAccountIds: [
      ...new Set(rows.flatMap((row) => (row.accountId ? [row.accountId] : []))),
    ].sort(),
  }));
};
