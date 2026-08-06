import { BadRequestException, Injectable } from '@nestjs/common';
import {
  allocation,
  projectCashBalance,
  rebalanceGap,
  ttwror,
  xirr,
  type LedgerEvent,
} from '@thesis-ledger/domain';
import { PrismaService } from '../platform/prisma.service.js';
import { MarketService } from '../market/market.service.js';

@Injectable()
export class PerformanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly market: MarketService,
  ) {}

  async capture(accountId?: string, capturedAt = new Date()) {
    const [positions, ledger] = await Promise.all([
      this.prisma.position.findMany({
        ...(accountId ? { where: { accountId } } : {}),
        include: { asset: true },
      }),
      this.prisma.ledgerEvent.findMany({
        ...(accountId ? { where: { accountId } } : {}),
        orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);
    const valued = await Promise.all(
      positions.map(async (position) => {
        try {
          const quote = await this.market.getQuote(position.symbol);
          return {
            symbol: position.symbol,
            quantity: Number(position.quantity),
            costPrice: Number(position.costPrice),
            assetType: position.asset.assetType,
            marketValue: Number(position.quantity) * quote.price,
            provider: quote.provider,
            stale: quote.stale,
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
    const marketValue = valued.reduce((sum, position) => sum + (position.marketValue ?? 0), 0);
    const costValue = valued.reduce(
      (sum, position) => sum + position.quantity * position.costPrice,
      0,
    );
    const cash = projectCashBalance(
      ledger.map((event): LedgerEvent => ({
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
      })),
    );
    const cashValue = accountId
      ? (cash.get(accountId) ?? 0)
      : [...cash.values()].reduce((sum, value) => sum + value, 0);
    const payload = {
      positions: valued,
      dataQuality: {
        partial: valued.some((position) => position.marketValue === null),
        missingSymbols: valued
          .filter((position) => position.marketValue === null)
          .map((position) => position.symbol),
      },
    };
    const existing = await this.prisma.portfolioSnapshot.findFirst({
      where: { accountId: accountId ?? null, capturedAt },
    });
    if (existing) return existing;
    return this.prisma.portfolioSnapshot.create({
      data: {
        ...(accountId ? { accountId } : {}),
        capturedAt,
        marketValue,
        costValue,
        cashValue,
        payload,
      },
    });
  }

  async summary(accountId?: string, start?: string, end?: string) {
    const snapshots = await this.history(accountId, start, end);
    if (snapshots.length < 2)
      return { accountId: accountId ?? null, snapshots, ttwror: 0, xirr: null };
    const valuations = snapshots.map((snapshot, index) => ({
      date: snapshot.capturedAt.toISOString(),
      value: Number(snapshot.marketValue) + Number(snapshot.cashValue),
      ...(index === 0 ? {} : { externalFlow: 0 }),
    }));
    const cashFlows = snapshots.map((snapshot) => ({
      date: snapshot.capturedAt.toISOString(),
      amount: Number(snapshot.cashValue),
    }));
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
    const values = Object.values(targets);
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
        targets,
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

  async history(accountId?: string, start?: string, end?: string) {
    return this.prisma.portfolioSnapshot.findMany({
      where: {
        accountId: accountId ?? null,
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
  }

  calculate(input: {
    valuations: { date: string; value: number; externalFlow?: number }[];
    cashFlows: { date: string; amount: number }[];
  }) {
    let moneyWeightedReturn: number | null = null;
    try {
      moneyWeightedReturn = xirr(input.cashFlows);
    } catch {
      // XIRR 无解时返回 null，调用方可向用户说明原因。
    }
    return { ttwror: ttwror(input.valuations), xirr: moneyWeightedReturn };
  }

  allocate(input: {
    positions: { category: string; marketValue: number }[];
    targets?: Record<string, number>;
  }) {
    if (input.positions.some((position) => position.marketValue < 0))
      throw new BadRequestException('资产市值不能为负数');
    return {
      allocation: allocation(input.positions),
      rebalance: input.targets ? rebalanceGap(input.positions, input.targets) : [],
    };
  }

  async layers(accountId?: string, symbol?: string) {
    const positions = await this.prisma.position.findMany({
      ...(accountId || symbol
        ? { where: { ...(accountId ? { accountId } : {}), ...(symbol ? { symbol } : {}) } }
        : {}),
      include: { asset: true },
    });
    const security = await Promise.all(
      positions.map(async (position) => {
        let marketValue: number | null = null;
        try {
          marketValue =
            Number(position.quantity) * (await this.market.getQuote(position.symbol)).price;
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
    const byAccount = new Map<
      string,
      { costValue: number; marketValue: number; partial: boolean }
    >();
    for (const item of security) {
      const current = byAccount.get(item.accountId) ?? {
        costValue: 0,
        marketValue: 0,
        partial: false,
      };
      current.costValue += item.costValue;
      current.marketValue += item.marketValue ?? 0;
      current.partial ||= item.marketValue === null;
      byAccount.set(item.accountId, current);
    }
    const account = [...byAccount.entries()].map(([id, value]) => ({ accountId: id, ...value }));
    const portfolio = account.reduce(
      (total, value) => ({
        costValue: total.costValue + value.costValue,
        marketValue: total.marketValue + value.marketValue,
        partial: total.partial || value.partial,
      }),
      { costValue: 0, marketValue: 0, partial: false },
    );
    return { security, account, portfolio };
  }
}
