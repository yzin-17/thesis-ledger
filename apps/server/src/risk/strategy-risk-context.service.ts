import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../platform/prisma.service.js';

export type StrategyRiskTarget = {
  executionInstrument: { symbol: string; assetType: string };
  primaryTimeframe: string;
};

export type StrategyRiskPositionTradeContext = {
  position: { id: string; quantity: { toString(): string }; costPrice: { toString(): string } } | null;
  trade: { id: string; openedAt: Date | null } | null;
};

export type StrategyRiskActualContext = {
  positionId?: string;
  tradeId?: string;
  openedAt?: string;
  context: {
    quantity?: string;
    price?: string;
    averageCost?: string;
    holdingPeriods?: number;
    occurredAt?: string;
    availableAt?: string;
  };
};

@Injectable()
export class StrategyRiskContextService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertTarget(accountId: string, symbol: string, target: StrategyRiskTarget) {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { active: true },
    });
    if (!account) throw new NotFoundException('账户不存在');
    if (!account.active) throw new BadRequestException('账户已停用');
    if (target.executionInstrument.symbol !== symbol)
      throw new BadRequestException('风险应用标的必须与策略执行标的一致');
  }

  private loadPositionTrade(accountId: string, symbol: string) {
    return Promise.all([
      this.prisma.position.findUnique({
        where: { accountId_symbol: { accountId, symbol } },
        select: { id: true, quantity: true, costPrice: true },
      }),
      this.prisma.trade.findFirst({
        where: { accountId, symbol, accountMode: 'actual', lifecycle: 'ACTIVE' },
        orderBy: [{ openedAt: 'desc' }, { createdAt: 'desc' }],
        select: { id: true, openedAt: true },
      }),
    ]).then(([position, trade]) => ({ position, trade }) satisfies StrategyRiskPositionTradeContext);
  }

  private baseContext(source: StrategyRiskPositionTradeContext) {
    return {
      ...(source.position?.id ? { positionId: source.position.id } : {}),
      ...(source.trade?.id ? { tradeId: source.trade.id } : {}),
      ...(source.trade?.openedAt ? { openedAt: source.trade.openedAt.toISOString() } : {}),
      quantity: source.position?.quantity.toString(),
      averageCost: source.position?.costPrice.toString(),
    };
  }

  private async fundContext(
    symbol: string,
    source: StrategyRiskPositionTradeContext,
    evaluatedAt: Date,
  ): Promise<StrategyRiskActualContext> {
    const nav = await this.prisma.fundNavPoint.findFirst({
      where: {
        symbol,
        navDate: { lte: evaluatedAt },
        fetchedAt: { lte: evaluatedAt },
      },
      orderBy: [{ navDate: 'desc' }, { fetchedAt: 'desc' }],
    });
    const holdingPeriods =
      source.trade?.openedAt && nav
        ? await this.prisma.fundNavPoint.count({
            where: {
              symbol,
              navDate: { gte: source.trade.openedAt, lte: nav.navDate },
              fetchedAt: { lte: evaluatedAt },
            },
          })
        : undefined;
    const base = this.baseContext(source);
    return {
      ...(base.positionId ? { positionId: base.positionId } : {}),
      ...(base.tradeId ? { tradeId: base.tradeId } : {}),
      ...(base.openedAt ? { openedAt: base.openedAt } : {}),
      context: {
        ...(base.quantity ? { quantity: base.quantity } : {}),
        ...(base.averageCost ? { averageCost: base.averageCost } : {}),
        ...(nav ? { price: nav.unitNav.toString() } : {}),
        ...(holdingPeriods === undefined
          ? {}
          : { holdingPeriods: Math.max(0, holdingPeriods - 1) }),
        ...(nav
          ? {
              occurredAt: nav.navDate.toISOString(),
              availableAt: nav.fetchedAt.toISOString(),
            }
          : {}),
      },
    };
  }

  private async exchangeContext(
    symbol: string,
    timeframe: string,
    source: StrategyRiskPositionTradeContext,
    evaluatedAt: Date,
  ): Promise<StrategyRiskActualContext> {
    const bar = await this.prisma.marketBar.findFirst({
      where: {
        symbol,
        timeframe,
        timestamp: { lte: evaluatedAt },
        fetchedAt: { lte: evaluatedAt },
      },
      orderBy: [{ timestamp: 'desc' }, { fetchedAt: 'desc' }],
    });
    const holdingPeriods =
      source.trade?.openedAt && bar
        ? await this.prisma.marketBar.count({
            where: {
              symbol,
              timeframe,
              timestamp: { gte: source.trade.openedAt, lte: bar.timestamp },
              fetchedAt: { lte: evaluatedAt },
            },
          })
        : undefined;
    const base = this.baseContext(source);
    return {
      ...(base.positionId ? { positionId: base.positionId } : {}),
      ...(base.tradeId ? { tradeId: base.tradeId } : {}),
      ...(base.openedAt ? { openedAt: base.openedAt } : {}),
      context: {
        ...(base.quantity ? { quantity: base.quantity } : {}),
        ...(base.averageCost ? { averageCost: base.averageCost } : {}),
        ...(bar ? { price: bar.close.toString() } : {}),
        ...(holdingPeriods === undefined
          ? {}
          : { holdingPeriods: Math.max(0, holdingPeriods - 1) }),
        ...(bar
          ? {
              occurredAt: bar.timestamp.toISOString(),
              availableAt: bar.fetchedAt.toISOString(),
            }
          : {}),
      },
    };
  }

  async load(
    accountId: string,
    symbol: string,
    target: StrategyRiskTarget,
    evaluatedAt = new Date(),
  ): Promise<StrategyRiskActualContext> {
    await this.assertTarget(accountId, symbol, target);
    const source = await this.loadPositionTrade(accountId, symbol);
    if (target.executionInstrument.assetType === 'fund')
      return this.fundContext(symbol, source, evaluatedAt);
    return this.exchangeContext(symbol, target.primaryTimeframe, source, evaluatedAt);
  }
}
