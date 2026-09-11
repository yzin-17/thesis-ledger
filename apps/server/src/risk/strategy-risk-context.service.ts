import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  tradingCalendars,
  tradingMarketForAssetMarket,
  type TradingMarket,
} from '@thesis-ledger/domain';
import { PrismaService } from '../platform/prisma.service.js';

export type StrategyRiskTarget = {
  executionInstrument: { symbol: string; assetType: string; market?: string };
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

const timeframeMinutes = (timeframe: string) => {
  const matched = timeframe.match(/^(1|5|15|30|60)m$/u);
  return matched ? Number(matched[1]) : null;
};

const localDateKey = (value: Date, timeZone: string) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(value)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const utcForLocalMinute = (date: string, minute: number, timeZone: string) => {
  const [year = Number.NaN, month = Number.NaN, day = Number.NaN] = date.split('-').map(Number);
  const hour = Math.floor(minute / 60);
  const localMinute = minute % 60;
  let candidate = new Date(Date.UTC(year, month - 1, day, hour, localMinute));
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const rendered = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(candidate);
    const values = Object.fromEntries(
      rendered.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]),
    );
    const renderedUtc = Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour),
      Number(values.minute),
    );
    const wantedUtc = Date.UTC(year, month - 1, day, hour, localMinute);
    const offset = renderedUtc - wantedUtc;
    if (offset === 0) return candidate;
    candidate = new Date(candidate.getTime() - offset);
  }
  return candidate;
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

  private tradingMarket(target: StrategyRiskTarget): TradingMarket | null {
    const market = target.executionInstrument.market;
    if (!market) return null;
    return tradingMarketForAssetMarket(market);
  }

  private completedAt(timestamp: Date, timeframe: string, market: TradingMarket | null) {
    const minutes = timeframeMinutes(timeframe);
    if (minutes !== null) return new Date(timestamp.getTime() + minutes * 60_000);
    if (timeframe !== '1d' || !market) return null;
    const calendar = tradingCalendars[market];
    const sessions = calendar.sessionsForDate(timestamp);
    const end = sessions.at(-1)?.end;
    if (end === undefined) return null;
    return utcForLocalMinute(localDateKey(timestamp, calendar.timezone), end, calendar.timezone);
  }

  private async exchangeContext(
    symbol: string,
    target: StrategyRiskTarget,
    source: StrategyRiskPositionTradeContext,
    evaluatedAt: Date,
  ): Promise<StrategyRiskActualContext> {
    const market = this.tradingMarket(target);
    const bars = await this.prisma.marketBar.findMany({
      where: {
        symbol,
        timeframe: target.primaryTimeframe,
        timestamp: { lte: evaluatedAt },
        fetchedAt: { lte: evaluatedAt },
      },
      orderBy: [{ timestamp: 'desc' }, { fetchedAt: 'desc' }],
      take: 32,
    });
    const bar = bars.find((candidate) => {
      const completedAt = this.completedAt(candidate.timestamp, target.primaryTimeframe, market);
      return completedAt !== null && completedAt <= evaluatedAt;
    });
    const holdingPeriods =
      source.trade?.openedAt && bar
        ? await this.prisma.marketBar.count({
            where: {
              symbol,
              timeframe: target.primaryTimeframe,
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
    return this.exchangeContext(symbol, target, source, evaluatedAt);
  }
}
