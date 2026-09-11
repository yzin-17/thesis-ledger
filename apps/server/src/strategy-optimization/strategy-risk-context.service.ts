import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { StrategySchemaV2 } from '@thesis-ledger/schemas';
import { PrismaService } from '../platform/prisma.service.js';
import type {
  ActualRiskContext,
  PositionTradeContext,
} from './strategy-risk-application.types.js';

@Injectable()
export class StrategyRiskContextService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertTarget(accountId: string, symbol: string, strategy: StrategySchemaV2) {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { active: true },
    });
    if (!account) throw new NotFoundException('账户不存在');
    if (!account.active) throw new BadRequestException('账户已停用');
    if (strategy.executionInstrument.symbol !== symbol)
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
    ]).then(([position, trade]) => ({ position, trade }) satisfies PositionTradeContext);
  }

  private baseContext(source: PositionTradeContext) {
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
    source: PositionTradeContext,
  ): Promise<ActualRiskContext> {
    const nav = await this.prisma.fundNavPoint.findFirst({
      where: { symbol },
      orderBy: { navDate: 'desc' },
    });
    const holdingPeriods =
      source.trade?.openedAt && nav
        ? await this.prisma.fundNavPoint.count({
            where: { symbol, navDate: { gte: source.trade.openedAt, lte: nav.navDate } },
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
    source: PositionTradeContext,
  ): Promise<ActualRiskContext> {
    const bar = await this.prisma.marketBar.findFirst({
      where: { symbol, timeframe },
      orderBy: { timestamp: 'desc' },
    });
    const holdingPeriods =
      source.trade?.openedAt && bar
        ? await this.prisma.marketBar.count({
            where: {
              symbol,
              timeframe,
              timestamp: { gte: source.trade.openedAt, lte: bar.timestamp },
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
    strategy: StrategySchemaV2,
  ): Promise<ActualRiskContext> {
    await this.assertTarget(accountId, symbol, strategy);
    const source = await this.loadPositionTrade(accountId, symbol);
    if (strategy.executionInstrument.assetType === 'fund')
      return this.fundContext(symbol, source);
    return this.exchangeContext(symbol, strategy.primaryTimeframe, source);
  }
}
