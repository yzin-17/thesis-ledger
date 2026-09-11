import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { MarketBar } from '@prisma/client';
import {
  aggregateMinuteBars,
  tradingCalendars,
  tradingMarketForAssetMarket,
  type BacktestMinuteBar,
  type DerivedBacktestBar,
  type TradingMarket,
} from '@thesis-ledger/domain';
import { PrismaService } from '../platform/prisma.service.js';

export type StrategyRiskTarget = {
  executionInstrument: { symbol: string; assetType: string; market?: string };
  primaryTimeframe: string;
  requiresHoldingPeriods?: boolean;
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

type ExchangeValues = {
  price?: string;
  holdingPeriods?: number;
  occurredAt?: string;
  availableAt?: string;
};

const timeframeMinutes = (timeframe: string) => {
  const matched = timeframe.match(/^(1|5|15|30|60)m$/u);
  return matched ? Number(matched[1]) : null;
};

const isDerivedTimeframe = (
  timeframe: string,
): timeframe is DerivedBacktestBar['timeframe'] =>
  timeframe === '5m' || timeframe === '15m' || timeframe === '30m' || timeframe === '60m';

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
    requiresHoldingPeriods: boolean,
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
      requiresHoldingPeriods && source.trade?.openedAt && nav
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
    const tradingDate = timestamp.toISOString().slice(0, 10);
    const localNoon = utcForLocalMinute(tradingDate, 12 * 60, calendar.timezone);
    const sessions = calendar.sessionsForDate(localNoon);
    const end = sessions.at(-1)?.end;
    if (end === undefined) return null;
    return utcForLocalMinute(tradingDate, end, calendar.timezone);
  }

  private effectiveBars(rows: MarketBar[]) {
    const seen = new Set<number>();
    const result: MarketBar[] = [];
    for (const row of rows) {
      const timestamp = row.timestamp.getTime();
      if (seen.has(timestamp)) continue;
      seen.add(timestamp);
      result.push(row);
    }
    return result.sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime());
  }

  private async storedBars(
    symbol: string,
    timeframe: '1m' | '1d',
    evaluatedAt: Date,
    start?: Date,
    take?: number,
  ) {
    const rows = await this.prisma.marketBar.findMany({
      where: {
        symbol,
        timeframe,
        timestamp: {
          ...(start ? { gte: start } : {}),
          lte: evaluatedAt,
        },
        fetchedAt: { lte: evaluatedAt },
      },
      orderBy: [
        { timestamp: start ? 'asc' : 'desc' },
        { fallbackUsed: 'asc' },
        { fetchedAt: 'desc' },
        { provider: 'asc' },
      ],
      ...(take ? { take } : {}),
    });
    return this.effectiveBars(rows);
  }

  private minuteInputs(rows: MarketBar[], market: TradingMarket): BacktestMinuteBar[] {
    return rows.map((row) => ({
      symbol: row.symbol,
      market,
      timeframe: '1m',
      occurredAt: row.timestamp.toISOString(),
      availableAt: row.fetchedAt.toISOString(),
      open: row.open.toString(),
      high: row.high.toString(),
      low: row.low.toString(),
      close: row.close.toString(),
      volume: row.volume.toString(),
      amount: row.amount.toString(),
      provider: row.provider,
      quality: row.freshness === 'stale' ? 'stale' : 'complete',
    }));
  }

  private async derivedBars(
    symbol: string,
    timeframe: DerivedBacktestBar['timeframe'],
    market: TradingMarket,
    evaluatedAt: Date,
    start?: Date,
  ) {
    const rows = await this.storedBars(symbol, '1m', evaluatedAt, start, start ? undefined : 1000);
    return aggregateMinuteBars(this.minuteInputs(rows, market), timeframe, {
      calendar: tradingCalendars[market],
      includePartialTail: false,
    }).filter(
      (bar) =>
        bar.completeness === 'complete' &&
        new Date(bar.occurredAt) <= evaluatedAt &&
        new Date(bar.availableAt) <= evaluatedAt,
    );
  }

  private async directBars(
    symbol: string,
    timeframe: '1m' | '1d',
    market: TradingMarket,
    evaluatedAt: Date,
    start?: Date,
  ) {
    const rows = await this.storedBars(symbol, timeframe, evaluatedAt, start, start ? undefined : 64);
    return rows.filter((row) => {
      const completedAt = this.completedAt(row.timestamp, timeframe, market);
      return completedAt !== null && completedAt <= evaluatedAt;
    });
  }

  private async derivedExchangeValues(
    symbol: string,
    timeframe: DerivedBacktestBar['timeframe'],
    market: TradingMarket,
    source: StrategyRiskPositionTradeContext,
    evaluatedAt: Date,
    requiresHoldingPeriods: boolean,
  ): Promise<ExchangeValues> {
    const bars = await this.derivedBars(symbol, timeframe, market, evaluatedAt);
    const bar = bars.at(-1);
    const holdingPeriods =
      requiresHoldingPeriods && source.trade?.openedAt && bar
        ? Math.max(
            0,
            (
              await this.derivedBars(
                symbol,
                timeframe,
                market,
                evaluatedAt,
                source.trade.openedAt,
              )
            ).length - 1,
          )
        : undefined;
    return {
      ...(bar ? { price: bar.close, occurredAt: bar.occurredAt, availableAt: bar.availableAt } : {}),
      ...(holdingPeriods === undefined ? {} : { holdingPeriods }),
    };
  }

  private async directExchangeValues(
    symbol: string,
    timeframe: '1m' | '1d',
    market: TradingMarket,
    source: StrategyRiskPositionTradeContext,
    evaluatedAt: Date,
    requiresHoldingPeriods: boolean,
  ): Promise<ExchangeValues> {
    const bars = await this.directBars(symbol, timeframe, market, evaluatedAt);
    const bar = bars.at(-1);
    const holdingPeriods =
      requiresHoldingPeriods && source.trade?.openedAt && bar
        ? Math.max(
            0,
            (
              await this.directBars(
                symbol,
                timeframe,
                market,
                evaluatedAt,
                source.trade.openedAt,
              )
            ).length - 1,
          )
        : undefined;
    return {
      ...(bar
        ? {
            price: bar.close.toString(),
            occurredAt: bar.timestamp.toISOString(),
            availableAt: bar.fetchedAt.toISOString(),
          }
        : {}),
      ...(holdingPeriods === undefined ? {} : { holdingPeriods }),
    };
  }

  private async exchangeContext(
    symbol: string,
    target: StrategyRiskTarget,
    source: StrategyRiskPositionTradeContext,
    evaluatedAt: Date,
  ): Promise<StrategyRiskActualContext> {
    const market = this.tradingMarket(target);
    if (!market) throw new BadRequestException('策略风险应用缺少可识别的交易市场');

    let values: ExchangeValues = {};
    if (isDerivedTimeframe(target.primaryTimeframe)) {
      values = await this.derivedExchangeValues(
        symbol,
        target.primaryTimeframe,
        market,
        source,
        evaluatedAt,
        target.requiresHoldingPeriods === true,
      );
    } else if (target.primaryTimeframe === '1m' || target.primaryTimeframe === '1d') {
      values = await this.directExchangeValues(
        symbol,
        target.primaryTimeframe,
        market,
        source,
        evaluatedAt,
        target.requiresHoldingPeriods === true,
      );
    }

    const base = this.baseContext(source);
    return {
      ...(base.positionId ? { positionId: base.positionId } : {}),
      ...(base.tradeId ? { tradeId: base.tradeId } : {}),
      ...(base.openedAt ? { openedAt: base.openedAt } : {}),
      context: {
        ...(base.quantity ? { quantity: base.quantity } : {}),
        ...(base.averageCost ? { averageCost: base.averageCost } : {}),
        ...(values.price ? { price: values.price } : {}),
        ...(values.holdingPeriods === undefined ? {} : { holdingPeriods: values.holdingPeriods }),
        ...(values.occurredAt ? { occurredAt: values.occurredAt } : {}),
        ...(values.availableAt ? { availableAt: values.availableAt } : {}),
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
      return this.fundContext(
        symbol,
        source,
        evaluatedAt,
        target.requiresHoldingPeriods === true,
      );
    return this.exchangeContext(symbol, target, source, evaluatedAt);
  }
}
