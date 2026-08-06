import { Injectable, Optional } from '@nestjs/common';
import { positionInputSchema } from '@thesis-ledger/schemas';
import { roundMoney } from '@thesis-ledger/shared';
import { PrismaService } from '../platform/prisma.service.js';
import { MarketService } from '../market/market.service.js';
import { LedgerService } from '../ledger/ledger.service.js';

@Injectable()
export class PortfolioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly market: MarketService,
    @Optional() private readonly ledger?: LedgerService,
  ) {}

  private requireLedger() {
    if (!this.ledger) throw new Error('LedgerService 未配置，拒绝直接写入 Position');
    return this.ledger;
  }
  listPositions(accountId?: string) {
    return this.prisma.position.findMany({
      where: accountId ? { accountId } : {},
      include: { asset: true },
    });
  }
  async upsertPosition(input: unknown) {
    const data = positionInputSchema.parse(input);
    await this.requireLedger().setPosition(
      data.accountId,
      data.symbol,
      data.quantity,
      data.costPrice,
      data.source,
      '手工设置持仓余额',
    );
    return this.prisma.position.findUniqueOrThrow({
      where: { accountId_symbol: { accountId: data.accountId, symbol: data.symbol } },
      include: { asset: true },
    });
  }
  async updatePosition(id: string, input: unknown) {
    const data = positionInputSchema.partial().parse(input);
    const previous = await this.prisma.position.findUniqueOrThrow({ where: { id } });
    const accountId = data.accountId ?? previous.accountId;
    const symbol = data.symbol ?? previous.symbol;
    const quantity = data.quantity ?? Number(previous.quantity);
    const costPrice = data.costPrice ?? Number(previous.costPrice);
    if (accountId !== previous.accountId || symbol !== previous.symbol)
      await this.requireLedger().setPosition(
        previous.accountId,
        previous.symbol,
        0,
        Number(previous.costPrice),
        'manual',
        '手工修改持仓并迁移原标的',
      );
    await this.requireLedger().setPosition(
      accountId,
      symbol,
      quantity,
      costPrice,
      data.source ?? 'manual',
      '手工修改持仓',
    );
    return this.prisma.position.findUniqueOrThrow({
      where: { accountId_symbol: { accountId, symbol } },
      include: { asset: true },
    });
  }
  async removePosition(id: string) {
    const previous = await this.prisma.position.findUniqueOrThrow({ where: { id } });
    await this.requireLedger().setPosition(
      previous.accountId,
      previous.symbol,
      0,
      Number(previous.costPrice),
      'manual',
      '手工移除持仓',
    );
    return { id, removed: true, sourceOfTruth: 'ledger' as const };
  }
  async value(accountId?: string) {
    const positions = await this.listPositions(accountId);
    const valued = await Promise.all(
      positions.map(async (position) => {
        const quantity = Number(position.quantity);
        const costPrice = Number(position.costPrice);
        try {
          const quote = await this.market.getQuote(position.symbol);
          const marketValue = roundMoney(quantity * quote.price);
          const costValue = roundMoney(quantity * costPrice);
          return {
            ...position,
            quantity,
            costPrice,
            marketPrice: quote.price,
            marketValue,
            costValue,
            pnl: roundMoney(marketValue - costValue),
            pnlRatio: costValue === 0 ? null : marketValue / costValue - 1,
            stale: quote.stale,
          };
        } catch (error) {
          return {
            ...position,
            quantity,
            costPrice,
            marketPrice: null,
            marketValue: null,
            costValue: roundMoney(quantity * costPrice),
            pnl: null,
            pnlRatio: null,
            stale: true,
            error: error instanceof Error ? error.message : '行情不可用',
          };
        }
      }),
    );
    return {
      positions: valued,
      totalCost: roundMoney(valued.reduce((sum, item) => sum + item.costValue, 0)),
      totalMarketValue: roundMoney(valued.reduce((sum, item) => sum + (item.marketValue ?? 0), 0)),
      totalPnl: roundMoney(valued.reduce((sum, item) => sum + (item.pnl ?? 0), 0)),
      partial: valued.some((item) => item.marketValue === null),
      valuedAt: new Date().toISOString(),
    };
  }
}
