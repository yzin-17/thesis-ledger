import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { projectCashBalance } from '@thesis-ledger/domain';
import { positionInputSchema } from '@thesis-ledger/schemas';
import { roundMoney } from '@thesis-ledger/shared';
import { PrismaService } from '../platform/prisma.service.js';
import { MarketService } from '../market/market.service.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { InstrumentService } from '../market/instrument.service.js';

const isFundSymbol = (symbol: string) => /^\d{6}\.OF$/.test(symbol);

const asDomainLedgerEvents = (
  events: Array<{
    id?: string;
    accountId: string;
    type: string;
    occurredAt: Date;
    symbol?: string | null;
    quantity?: unknown;
    price?: unknown;
    amount?: unknown;
    fee?: unknown;
    tax?: unknown;
    metadata?: unknown;
  }>,
) =>
  events.map((event) => ({
    id: event.id ?? crypto.randomUUID(),
    accountId: event.accountId,
    type: event.type as never,
    occurredAt: event.occurredAt.toISOString(),
    ...(event.symbol === null || event.symbol === undefined ? {} : { symbol: event.symbol }),
    ...(event.quantity === null || event.quantity === undefined
      ? {}
      : { quantity: Number(event.quantity) }),
    ...(event.price === null || event.price === undefined ? {} : { price: Number(event.price) }),
    ...(event.amount === null || event.amount === undefined
      ? {}
      : { amount: Number(event.amount) }),
    ...(event.fee === null || event.fee === undefined ? {} : { fee: Number(event.fee) }),
    ...(event.tax === null || event.tax === undefined ? {} : { tax: Number(event.tax) }),
    ...(event.metadata && typeof event.metadata === 'object'
      ? { metadata: event.metadata as Record<string, unknown> }
      : {}),
  }));

@Injectable()
export class PortfolioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly market: MarketService,
    @Optional() private readonly ledger?: LedgerService,
    @Optional() private readonly instruments?: InstrumentService,
  ) {}

  private requireLedger() {
    if (!this.ledger) throw new Error('LedgerService 未配置，拒绝直接写入 Position');
    return this.ledger;
  }

  listPositions(accountId?: string, mode: 'actual' | 'shadow' = 'actual') {
    return this.prisma.position.findMany({
      where: accountId ? { accountId, account: { mode } } : { account: { mode } },
      include: { asset: true },
    });
  }

  async upsertPosition(input: unknown) {
    const data = positionInputSchema.parse(input);
    if (data.source === 'manual' && !data.instrumentId)
      throw new BadRequestException('新增手工持仓必须先从标的目录确认标的');
    const confirmedInstrument = data.instrumentId
      ? await this.instruments?.requireConfirmed(data.instrumentId)
      : undefined;
    if (data.instrumentId && !confirmedInstrument)
      throw new BadRequestException('标的目录服务未配置，不能确认新增持仓');
    if (confirmedInstrument && confirmedInstrument.symbol !== data.symbol)
      throw new BadRequestException('持仓代码与已确认标的不一致');
    const options =
      data.assetName === undefined && data.assetType === undefined && !confirmedInstrument
        ? undefined
        : {
            ...(data.assetName === undefined
              ? confirmedInstrument
                ? { assetName: confirmedInstrument.displayName }
                : {}
              : { assetName: data.assetName }),
            ...(data.assetType === undefined
              ? confirmedInstrument
                ? { assetType: confirmedInstrument.assetType as 'stock' | 'etf' | 'fund' }
                : {}
              : { assetType: data.assetType }),
          };
    if (options) {
      await this.requireLedger().setPosition(
        data.accountId,
        data.symbol,
        data.quantity,
        data.costPrice,
        data.source,
        '保存当前持仓',
        options,
      );
    } else {
      await this.requireLedger().setPosition(
        data.accountId,
        data.symbol,
        data.quantity,
        data.costPrice,
        data.source,
        '保存当前持仓',
      );
    }
    if (data.quantity === 0)
      return {
        accountId: data.accountId,
        symbol: data.symbol,
        removed: true,
        sourceOfTruth: 'ledger' as const,
      };
    return this.prisma.position.findUniqueOrThrow({
      where: { accountId_symbol: { accountId: data.accountId, symbol: data.symbol } },
      include: { asset: true },
    });
  }

  async setCashBalance(
    accountId: string,
    amount: number,
    source: 'manual' | 'screenshot' = 'manual',
  ) {
    await this.requireLedger().setCashBalance(accountId, amount, source);
    return { accountId, amount, sourceOfTruth: 'ledger' as const };
  }

  async updatePosition(id: string, input: unknown) {
    const data = positionInputSchema.partial().parse(input);
    const previous = await this.prisma.position.findUniqueOrThrow({ where: { id } });
    const accountId = data.accountId ?? previous.accountId;
    const symbol = data.symbol ?? previous.symbol;
    const quantity = data.quantity ?? Number(previous.quantity);
    const costPrice = data.costPrice ?? Number(previous.costPrice);
    const options =
      data.assetName === undefined && data.assetType === undefined
        ? undefined
        : {
            ...(data.assetName === undefined ? {} : { assetName: data.assetName }),
            ...(data.assetType === undefined ? {} : { assetType: data.assetType }),
          };
    if (accountId !== previous.accountId || symbol !== previous.symbol) {
      await this.requireLedger().setPosition(
        previous.accountId,
        previous.symbol,
        0,
        Number(previous.costPrice),
        'manual',
        '手工修改持仓并迁移原标的',
      );
    }
    if (options) {
      await this.requireLedger().setPosition(
        accountId,
        symbol,
        quantity,
        costPrice,
        data.source ?? 'manual',
        '手工修改持仓',
        options,
      );
    } else {
      await this.requireLedger().setPosition(
        accountId,
        symbol,
        quantity,
        costPrice,
        data.source ?? 'manual',
        '手工修改持仓',
      );
    }
    if (quantity === 0)
      return { id, accountId, symbol, removed: true, sourceOfTruth: 'ledger' as const };
    return this.prisma.position.findUniqueOrThrow({
      where: { accountId_symbol: { accountId, symbol } },
      include: { asset: true },
    });
  }

  async clearPositions(accountId: string) {
    if (!accountId) throw new BadRequestException('清空持仓需要 accountId');
    const positions = await this.prisma.position.findMany({ where: { accountId } });
    for (const position of positions) {
      await this.requireLedger().setPosition(
        accountId,
        position.symbol,
        0,
        Number(position.costPrice),
        'manual',
        '清空持仓',
      );
    }
    return { accountId, cleared: positions.length, sourceOfTruth: 'ledger' as const };
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

  async value(accountId?: string, mode: 'actual' | 'shadow' = 'actual') {
    const positions = await this.listPositions(accountId, mode);
    const valued = await Promise.all(
      positions.map(async (position) => {
        const quantity = Number(position.quantity);
        const costPrice = Number(position.costPrice);
        try {
          if (isFundSymbol(position.symbol)) {
            if (typeof (this.market as { getFundNav?: unknown }).getFundNav !== 'function')
              throw new Error('基金净值能力未配置');
            const nav = await (
              this.market as unknown as {
                getFundNav: (symbol: string) => Promise<{ unitNav: number; freshness: string }>;
              }
            ).getFundNav(position.symbol);
            const marketValue = roundMoney(quantity * nav.unitNav);
            const costValue = roundMoney(quantity * costPrice);
            return {
              ...position,
              quantity,
              costPrice,
              marketPrice: nav.unitNav,
              marketValue,
              costValue,
              pnl: roundMoney(marketValue - costValue),
              pnlRatio: costValue === 0 ? null : marketValue / costValue - 1,
              stale: nav.freshness === 'stale',
              freshness: nav.freshness,
            };
          }
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
            freshness: quote.freshness,
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

    let cashValue = 0;
    let cashByAccount: Array<{ accountId: string; amount: number }> = [];
    const ledgerDelegate = this.prisma.ledgerEvent as
      | {
          findMany?: (args: unknown) => Promise<unknown[]>;
        }
      | undefined;
    if (typeof ledgerDelegate?.findMany === 'function') {
      const stored = await ledgerDelegate.findMany({
        where: accountId ? { accountId, account: { mode } } : { account: { mode } },
        orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
      });
      const balances = projectCashBalance(
        asDomainLedgerEvents(
          stored as Array<{
            id?: string;
            accountId: string;
            type: string;
            occurredAt: Date;
            symbol?: string | null;
            quantity?: unknown;
            price?: unknown;
            amount?: unknown;
            fee?: unknown;
            tax?: unknown;
            metadata?: unknown;
          }>,
        ),
      );
      cashByAccount = [...balances.entries()].map(([id, amount]) => ({ accountId: id, amount }));
      cashValue = roundMoney(cashByAccount.reduce((sum, item) => sum + item.amount, 0));
    }

    return {
      positions: valued,
      cashValue,
      cashByAccount,
      totalCost: roundMoney(valued.reduce((sum, item) => sum + item.costValue, 0)),
      totalMarketValue: roundMoney(
        valued.reduce((sum, item) => sum + (item.marketValue ?? 0), 0) + cashValue,
      ),
      totalPnl: roundMoney(valued.reduce((sum, item) => sum + (item.pnl ?? 0), 0)),
      partial: valued.some((item) => item.marketValue === null),
      mode,
      valuedAt: new Date().toISOString(),
    };
  }
}
