import { BadRequestException, Injectable } from '@nestjs/common';
import {
  allocation,
  normalizeAllocationCategory,
  normalizeAllocationTargets,
  projectCashBalance,
  rebalanceGap,
  ttwror,
  xirr,
  type LedgerEvent,
} from '@thesis-ledger/domain';
import { PrismaService } from '../platform/prisma.service.js';
import { MarketService } from '../market/market.service.js';

type PortfolioMode = 'actual' | 'shadow';

type PerformanceSnapshot = {
  id?: string;
  capturedAt: Date;
  marketValue: unknown;
  cashValue: unknown;
  payload: unknown;
};

type PerformanceLedgerEvent = {
  type: string;
  occurredAt: Date;
  amount: unknown;
};

type PrismaLedgerEvent = {
  id: string;
  accountId: string;
  type: string;
  occurredAt: Date;
  symbol: string | null;
  quantity: unknown;
  price: unknown;
  amount: unknown;
  fee: unknown;
  tax: unknown;
  metadata?: unknown;
};

const EXTERNAL_FLOW_TYPES = [
  'CASH_DEPOSIT',
  'CASH_WITHDRAW',
  'TRANSFER_IN',
  'TRANSFER_OUT',
] as const;

const snapshotPayload = (payload: unknown) =>
  payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};

const partialSnapshot = (snapshot: Pick<PerformanceSnapshot, 'payload'>) => {
  const payload = snapshotPayload(snapshot.payload);
  if (payload.partial === true) return true;
  const dataQuality = snapshotPayload(payload.dataQuality);
  return dataQuality.partial === true;
};

const snapshotMissingSymbols = (snapshot: Pick<PerformanceSnapshot, 'payload'>) => {
  const payload = snapshotPayload(snapshot.payload);
  const direct = payload.missingSymbols;
  if (Array.isArray(direct)) return direct.map(String);
  const dataQuality = snapshotPayload(payload.dataQuality);
  return Array.isArray(dataQuality.missingSymbols) ? dataQuality.missingSymbols.map(String) : [];
};

const snapshotValue = (snapshot: Pick<PerformanceSnapshot, 'marketValue' | 'cashValue'>) =>
  Number(snapshot.marketValue) + Number(snapshot.cashValue);

const toLedgerEvent = (event: PrismaLedgerEvent): LedgerEvent => ({
  id: event.id,
  accountId: event.accountId,
  type: event.type as LedgerEvent['type'],
  occurredAt: event.occurredAt.toISOString(),
  ...(event.symbol === null ? {} : { symbol: event.symbol }),
  ...(event.quantity === null ? {} : { quantity: Number(event.quantity) }),
  ...(event.price === null ? {} : { price: Number(event.price) }),
  ...(event.amount === null ? {} : { amount: Number(event.amount) }),
  ...(event.fee === null ? {} : { fee: Number(event.fee) }),
  ...(event.tax === null ? {} : { tax: Number(event.tax) }),
  ...(event.metadata && typeof event.metadata === 'object'
    ? { metadata: event.metadata as Record<string, unknown> }
    : {}),
});

const externalPortfolioFlow = (event: Pick<PerformanceLedgerEvent, 'type' | 'amount'>) => {
  const amount = Number(event.amount ?? 0);
  if (!Number.isFinite(amount) || amount === 0) return 0;
  if (event.type === 'CASH_DEPOSIT' || event.type === 'TRANSFER_IN') return amount;
  if (event.type === 'CASH_WITHDRAW' || event.type === 'TRANSFER_OUT') return -amount;
  return 0;
};

@Injectable()
export class PerformanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly market: MarketService,
  ) {}

  private async assertCurrencyScope(accountId: string | undefined, mode: PortfolioMode) {
    if (accountId) return;
    const accountDelegate = (this.prisma as unknown as { account?: unknown }).account as
      { findMany?: (args: unknown) => Promise<Array<{ currency?: string | null }>> } | undefined;
    if (typeof accountDelegate?.findMany !== 'function') return;
    const accounts = await accountDelegate.findMany({
      where: { mode },
      select: { currency: true },
    });
    const currencies = new Set(accounts.map((account) => account.currency ?? 'CNY'));
    if (currencies.size > 1) {
      throw new BadRequestException({
        code: 'MIXED_CURRENCY_SCOPE',
        message: '当前范围包含多个币种，请选择单个账户后再分析',
        currencies: [...currencies],
      });
    }
  }

  async capture(accountId?: string, capturedAt = new Date(), mode: PortfolioMode = 'actual') {
    await this.assertCurrencyScope(accountId, mode);
    const accountWhere = accountId ? { accountId, account: { mode } } : { account: { mode } };
    const [positions, ledger] = await Promise.all([
      this.prisma.position.findMany({
        where: accountWhere,
        include: { asset: true },
      }),
      this.prisma.ledgerEvent.findMany({
        where: accountWhere,
        orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);
    const valued = await Promise.all(
      positions.map(async (position) => {
        try {
          if (position.asset.assetType === 'fund' || /\.OF$/.test(position.symbol)) {
            const nav = await this.market.getFundNav(position.symbol, { allowStale: false });
            return {
              symbol: position.symbol,
              quantity: Number(position.quantity),
              costPrice: Number(position.costPrice),
              assetType: position.asset.assetType,
              marketValue: Number(position.quantity) * nav.unitNav,
              provider: nav.provider,
              stale: nav.freshness === 'stale',
              freshness: nav.freshness,
            };
          }
          const quote = await this.market.getQuote(position.symbol, { allowStale: false });
          return {
            symbol: position.symbol,
            quantity: Number(position.quantity),
            costPrice: Number(position.costPrice),
            assetType: position.asset.assetType,
            marketValue: Number(position.quantity) * quote.price,
            provider: quote.provider,
            stale: quote.stale,
            freshness: quote.freshness,
          };
        } catch (error) {
          return {
            symbol: position.symbol,
            quantity: Number(position.quantity),
            costPrice: Number(position.costPrice),
            assetType: position.asset.assetType,
            marketValue: null,
            provider: 'unavailable',
            stale: true,
            error: error instanceof Error ? error.message : '行情不可用',
          };
        }
      }),
    );
    const knownMarketValue = valued.reduce((sum, position) => sum + (position.marketValue ?? 0), 0);
    const costValue = valued.reduce(
      (sum, position) => sum + position.quantity * position.costPrice,
      0,
    );
    const cash = projectCashBalance(ledger.map(toLedgerEvent));
    const cashValue = accountId
      ? (cash.get(accountId) ?? 0)
      : [...cash.values()].reduce((sum, value) => sum + value, 0);
    const missingSymbols = valued
      .filter((position) => position.marketValue === null)
      .map((position) => position.symbol);
    const partial = missingSymbols.length > 0;
    const payload = {
      positions: valued,
      mode,
      knownMarketValue,
      totalMarketValue: partial ? null : knownMarketValue,
      partial,
      missingSymbols,
      dataQuality: {
        partial,
        missingSymbols,
      },
    };
    const snapshotDelegate = this.prisma.portfolioSnapshot as unknown as {
      findMany?: (args: unknown) => Promise<Array<{ payload: unknown }>>;
      findFirst?: (args: unknown) => Promise<{ payload: unknown } | null>;
    };
    const existingSnapshots =
      typeof snapshotDelegate.findMany === 'function'
        ? await snapshotDelegate.findMany({
            where: { accountId: accountId ?? null, capturedAt },
          })
        : [
            await snapshotDelegate.findFirst?.({
              where: { accountId: accountId ?? null, capturedAt },
            }),
          ].filter(
            (snapshot): snapshot is { payload: unknown } =>
              snapshot !== null && snapshot !== undefined,
          );
    const existing = existingSnapshots.find((snapshot) => {
      const payload = snapshot.payload;
      return typeof payload !== 'object' || payload === null || !('mode' in payload)
        ? mode === 'actual'
        : (payload as { mode?: unknown }).mode === mode;
    });
    if (existing) return existing;
    return this.prisma.portfolioSnapshot.create({
      data: {
        ...(accountId ? { accountId } : {}),
        capturedAt,
        marketValue: knownMarketValue,
        costValue,
        cashValue,
        payload,
      },
    });
  }

  async summary(accountId?: string, start?: string, end?: string, mode: PortfolioMode = 'actual') {
    const snapshots = (await this.history(accountId, start, end, mode)) as PerformanceSnapshot[];
    const partialSnapshots = snapshots.filter(partialSnapshot);
    if (partialSnapshots.length > 0) {
      throw new BadRequestException({
        code: 'PARTIAL_PORTFOLIO_SNAPSHOT',
        message: '收益分析包含行情缺失的 partial snapshot，请补齐行情后重试',
        snapshotIds: partialSnapshots.flatMap((snapshot) => (snapshot.id ? [snapshot.id] : [])),
        missingSymbols: [...new Set(partialSnapshots.flatMap(snapshotMissingSymbols))],
      });
    }
    if (snapshots.length < 2) {
      return {
        accountId: accountId ?? null,
        snapshots,
        ttwror: 0,
        xirr: null,
        xirrReason: '至少需要两个完整快照',
      };
    }

    const firstSnapshot = snapshots[0]!;
    const lastSnapshot = snapshots[snapshots.length - 1]!;
    const accountWhere = accountId ? { accountId, account: { mode } } : { account: { mode } };
    const externalEvents = (await this.prisma.ledgerEvent.findMany({
      where: {
        ...accountWhere,
        type: { in: [...EXTERNAL_FLOW_TYPES] },
        occurredAt: { gt: firstSnapshot.capturedAt, lte: lastSnapshot.capturedAt },
      },
      orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
    })) as PerformanceLedgerEvent[];

    const valuations = snapshots.map((snapshot, index) => {
      const previous = index === 0 ? undefined : snapshots[index - 1];
      const externalFlow = previous
        ? externalEvents.reduce((sum, event) => {
            if (event.occurredAt <= previous.capturedAt || event.occurredAt > snapshot.capturedAt)
              return sum;
            return sum + externalPortfolioFlow(event);
          }, 0)
        : 0;
      return {
        date: snapshot.capturedAt.toISOString(),
        value: snapshotValue(snapshot),
        ...(index === 0 ? {} : { externalFlow }),
      };
    });

    const cashFlows = [
      {
        date: firstSnapshot.capturedAt.toISOString(),
        amount: -snapshotValue(firstSnapshot),
      },
      ...externalEvents.flatMap((event) => {
        const portfolioFlow = externalPortfolioFlow(event);
        return portfolioFlow === 0
          ? []
          : [{ date: event.occurredAt.toISOString(), amount: -portfolioFlow }];
      }),
      {
        date: lastSnapshot.capturedAt.toISOString(),
        amount: snapshotValue(lastSnapshot),
      },
    ];

    return {
      accountId: accountId ?? null,
      snapshots,
      ...this.calculate({ valuations, cashFlows }),
    };
  }

  async saveTargets(
    scope: 'account' | 'portfolio',
    targets: Record<string, number>,
    accountId?: string,
  ) {
    const normalizedTargetResult = normalizeAllocationTargets(targets);
    if (normalizedTargetResult.unknown.length > 0)
      throw new BadRequestException(
        `无法识别配置类别: ${normalizedTargetResult.unknown.join('、')}`,
      );
    const normalizedTargets = normalizedTargetResult.targets;
    const values = Object.values(normalizedTargets);
    if (values.length === 0 || values.some((value) => !Number.isFinite(value) || value < 0))
      throw new BadRequestException('目标权重必须是非负有限数字');
    if (Math.abs(values.reduce((sum, value) => sum + value, 0) - 1) > 1e-8)
      throw new BadRequestException('目标权重之和必须为 100%');
    await this.prisma.targetAllocation.updateMany({
      where: { scope, accountId: accountId ?? null, active: true },
      data: { active: false },
    });
    const latest = await this.prisma.targetAllocation.findFirst({
      where: { scope, accountId: accountId ?? null },
      orderBy: { version: 'desc' },
    });
    return this.prisma.targetAllocation.create({
      data: {
        scope,
        ...(accountId === undefined ? {} : { accountId }),
        version: (latest?.version ?? 0) + 1,
        targets: normalizedTargets,
        active: true,
      },
    });
  }

  targets(scope: 'account' | 'portfolio', accountId?: string) {
    return this.prisma.targetAllocation.findFirst({
      where: { scope, accountId: accountId ?? null, active: true },
      orderBy: { version: 'desc' },
    });
  }

  async history(accountId?: string, start?: string, end?: string, mode: PortfolioMode = 'actual') {
    await this.assertCurrencyScope(accountId, mode);
    const snapshots = await this.prisma.portfolioSnapshot.findMany({
      where: {
        accountId: accountId ?? null,
        ...(accountId ? { account: { mode } } : {}),
        ...(start || end
          ? {
              capturedAt: {
                ...(start ? { gte: new Date(start) } : {}),
                ...(end ? { lte: new Date(end) } : {}),
              },
            }
          : {}),
      },
      orderBy: { capturedAt: 'asc' },
    });
    if (accountId) return snapshots;
    return snapshots.filter((snapshot) => {
      const payload = snapshot.payload;
      if (typeof payload !== 'object' || payload === null || !('mode' in payload))
        return mode === 'actual';
      return (payload as { mode?: unknown }).mode === mode;
    });
  }

  calculate(input: {
    valuations: { date: string; value: number; externalFlow?: number }[];
    cashFlows: { date: string; amount: number }[];
  }) {
    let moneyWeightedReturn: number | null = null;
    let xirrReason: string | null = null;
    try {
      moneyWeightedReturn = xirr(input.cashFlows);
    } catch (error) {
      xirrReason = error instanceof Error ? error.message : 'XIRR 无法计算';
    }
    return { ttwror: ttwror(input.valuations), xirr: moneyWeightedReturn, xirrReason };
  }

  allocate(input: {
    positions: { category: string; marketValue: number }[];
    targets?: Record<string, number>;
    dataQuality?: { partial: boolean; missingSymbols: string[] };
  }) {
    if (input.positions.some((position) => position.marketValue < 0))
      throw new BadRequestException('资产市值不能为负数');
    const positions = input.positions.map((position) => {
      const category = normalizeAllocationCategory(position.category);
      if (!category) throw new BadRequestException(`无法识别配置类别: ${position.category}`);
      return { ...position, category };
    });
    const normalizedTargetResult = normalizeAllocationTargets(input.targets);
    if (normalizedTargetResult.unknown.length > 0)
      throw new BadRequestException(
        `无法识别配置类别: ${normalizedTargetResult.unknown.join('、')}`,
      );
    const targets = input.targets ? normalizedTargetResult.targets : undefined;
    const partial = input.dataQuality?.partial === true;
    const missingSymbols = input.dataQuality?.missingSymbols ?? [];
    const calculatedAllocation = allocation(positions);
    return {
      allocation: partial
        ? calculatedAllocation.map((item) => ({ ...item, weight: null }))
        : calculatedAllocation,
      rebalance: partial || !targets ? [] : rebalanceGap(positions, targets),
      partial,
      missingSymbols,
    };
  }

  async layers(accountId?: string, symbol?: string, mode: PortfolioMode = 'actual') {
    await this.assertCurrencyScope(accountId, mode);
    const positionWhere = {
      ...(accountId ? { accountId } : {}),
      ...(symbol ? { symbol } : {}),
      account: { mode },
    };
    const ledgerWhere = accountId ? { accountId, account: { mode } } : { account: { mode } };
    const ledgerDelegate = (this.prisma as unknown as { ledgerEvent?: unknown }).ledgerEvent as
      | {
          findMany?: (args: unknown) => Promise<unknown[]>;
        }
      | undefined;
    const [positions, storedLedger] = await Promise.all([
      this.prisma.position.findMany({ where: positionWhere, include: { asset: true } }),
      typeof ledgerDelegate?.findMany === 'function'
        ? ledgerDelegate.findMany({
            where: ledgerWhere,
            orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
          })
        : Promise.resolve([]),
    ]);
    const ledger = storedLedger as PrismaLedgerEvent[];
    const security = await Promise.all(
      positions.map(async (position) => {
        let marketValue: number | null = null;
        try {
          marketValue =
            position.asset.assetType === 'fund' || /\.OF$/.test(position.symbol)
              ? Number(position.quantity) *
                (await this.market.getFundNav(position.symbol, { allowStale: false })).unitNav
              : Number(position.quantity) *
                (await this.market.getQuote(position.symbol, { allowStale: false })).price;
        } catch {
          // 保留 null，调用方可以区分缺行情和零市值。
        }
        const costValue = Number(position.quantity) * Number(position.costPrice);
        return {
          accountId: position.accountId,
          symbol: position.symbol,
          assetType: position.asset.assetType,
          costValue,
          marketValue,
          unrealizedPnl: marketValue === null ? null : marketValue - costValue,
        };
      }),
    );
    const cashBalances = projectCashBalance(ledger.map(toLedgerEvent));
    const byAccount = new Map<
      string,
      {
        costValue: number;
        marketValue: number;
        cashValue: number;
        partial: boolean;
        missingSymbols: string[];
      }
    >();
    for (const [id, cashValue] of cashBalances.entries()) {
      byAccount.set(id, {
        costValue: 0,
        marketValue: 0,
        cashValue,
        partial: false,
        missingSymbols: [],
      });
    }
    if (accountId && !byAccount.has(accountId)) {
      byAccount.set(accountId, {
        costValue: 0,
        marketValue: 0,
        cashValue: 0,
        partial: false,
        missingSymbols: [],
      });
    }
    for (const item of security) {
      const current = byAccount.get(item.accountId) ?? {
        costValue: 0,
        marketValue: 0,
        cashValue: 0,
        partial: false,
        missingSymbols: [],
      };
      current.costValue += item.costValue;
      current.marketValue += item.marketValue ?? 0;
      if (item.marketValue === null) {
        current.partial = true;
        current.missingSymbols.push(item.symbol);
      }
      byAccount.set(item.accountId, current);
    }
    const account = [...byAccount.entries()].map(([id, value]) => ({ accountId: id, ...value }));
    const portfolio = account.reduce(
      (total, value) => ({
        costValue: total.costValue + value.costValue,
        marketValue: total.marketValue + value.marketValue,
        cashValue: total.cashValue + value.cashValue,
        partial: total.partial || value.partial,
        missingSymbols: [...total.missingSymbols, ...value.missingSymbols],
      }),
      {
        costValue: 0,
        marketValue: 0,
        cashValue: 0,
        partial: false,
        missingSymbols: [] as string[],
      },
    );
    return {
      security,
      account,
      portfolio: {
        ...portfolio,
        missingSymbols: [...new Set(portfolio.missingSymbols)],
      },
      valuedAt: new Date().toISOString(),
      dataQuality: {
        partial: portfolio.partial,
        missingSymbols: [...new Set(portfolio.missingSymbols)],
      },
    };
  }
}
