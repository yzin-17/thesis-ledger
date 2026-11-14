import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import {
  marketSessionDate,
  marketTimezones,
  marketCivilInstant,
  tradingMarketForAssetMarket,
  type DerivedBacktestBar,
  type TradingMarket,
  type StrategyMonitoringContext,
  DecimalValue,
} from '@thesis-ledger/domain';
import type { BarPoint } from '@thesis-ledger/schemas';
import { PrismaService } from '../platform/prisma.service.js';
import { MarketService } from '../market/market.service.js';
import { MarketBackgroundBarReader } from '../market/market-background-bar-reader.js';
import { currentFundRiskContext } from './strategy-risk-nav-context.js';
import { assertStrategyRiskTargetAccount } from './strategy-risk-target-account.js';
import {
  isMarketBarTemporarilyUnavailable,
  MarketBarReader,
  MarketBarUnavailableError,
  type MarketBarWindowReadInputV3,
} from '../market/market-bar-reader.js';

export type StrategyRiskTarget = {
  executionInstrument: { symbol: string; assetType: string; market?: string };
  primaryTimeframe: string;
  requiresHoldingPeriods?: boolean;
};

export type StrategyRiskPositionTradeContext = {
  position: {
    id: string;
    quantity: { toString(): string };
    costPrice: { toString(): string };
  } | null;
  trade: { id: string; openedAt: Date | null } | null;
};

export type StrategyRiskActualContext = {
  positionId?: string;
  tradeId?: string;
  openedAt?: string;
  context: StrategyMonitoringContext;
};

type ExchangeValues = {
  price?: string;
  holdingPeriods?: number;
  occurredAt?: string;
  availableAt?: string;
};

type RiskBar = Omit<BarPoint, 'timestamp' | 'availableAt'> & {
  symbol: string;
  provider: string;
  timestamp: Date;
  availableAt: Date;
};

const timeframeMinutes = (timeframe: string) => {
  const matched = timeframe.match(/^(1|5|15|30|60)m$/u);
  return matched ? Number(matched[1]) : null;
};

const isDerivedTimeframe = (timeframe: string): timeframe is DerivedBacktestBar['timeframe'] =>
  timeframe === '5m' || timeframe === '15m' || timeframe === '30m' || timeframe === '60m';

@Injectable()
export class StrategyRiskContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bars?: MarketBarReader,
    private readonly market?: MarketService,
    @Optional() private readonly backgroundBars?: MarketBackgroundBarReader,
  ) {}

  private async assertTarget(accountId: string, symbol: string, target: StrategyRiskTarget) {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { active: true, mode: true, type: true },
    });
    assertStrategyRiskTargetAccount(account, symbol, target.executionInstrument.symbol);
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
    ]).then(
      ([position, trade]) => ({ position, trade }) satisfies StrategyRiskPositionTradeContext,
    );
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

  private tradingMarket(target: StrategyRiskTarget): TradingMarket | null {
    const market = target.executionInstrument.market;
    if (!market) return null;
    return tradingMarketForAssetMarket(market);
  }

  private async completedAt(timestamp: Date, timeframe: string, market: TradingMarket | null) {
    const minutes = timeframeMinutes(timeframe);
    if (minutes !== null) return new Date(timestamp.getTime() + minutes * 60_000);
    if (timeframe !== '1d' || !market || !this.market) return null;
    const tradingDate = timestamp.toISOString().slice(0, 10);
    const probe = marketCivilInstant(tradingDate, 12 * 60, marketTimezones[market]);
    const session = await this.market.getSession(market, new Date(probe));
    if (session.state === 'unknown') return null;
    const end = session.sessions
      .filter((window) => window.tradingDate === tradingDate)
      .at(-1)?.endAt;
    return end ? new Date(end) : null;
  }

  private effectiveBars(rows: RiskBar[]) {
    const seen = new Set<number>();
    const result: RiskBar[] = [];
    for (const row of rows) {
      const timestamp = row.timestamp.getTime();
      if (seen.has(timestamp)) continue;
      seen.add(timestamp);
      result.push(row);
    }
    return result.sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime());
  }

  private async latestCompletedDailyDate(evaluatedAt: Date, market: TradingMarket) {
    const session = await this.market?.getSession(market, evaluatedAt);
    if (!session || session.state === 'unknown')
      throw new MarketBarUnavailableError(
        '交易日历未覆盖评价时点，无法确认已完成日线',
        'calendar_unavailable',
      );
    if (!session.latestCompletedTradingDate)
      throw new MarketBarUnavailableError('缺少可确认的已收盘交易日', 'calendar_unavailable');
    return session.latestCompletedTradingDate;
  }

  private async storedBars(
    symbol: string,
    timeframe: '1m' | '1d',
    evaluatedAt: Date,
    assetType: string,
    start?: Date,
    take?: number,
    availabilityCutoff = () => evaluatedAt,
    background = false,
  ): Promise<RiskBar[]> {
    if (!this.bars) throw new BadRequestException('行情 Reader 不可用，策略风险拒绝读取行情');
    if (timeframe === '1m')
      throw new MarketBarUnavailableError(
        '风险监控尚无可用的已完成分钟线数据',
        'timeframe_unsupported',
      );
    const normalizedAssetType = assetType.toUpperCase();
    if (normalizedAssetType !== 'STOCK' && normalizedAssetType !== 'ETF')
      throw new MarketBarUnavailableError('策略风险日线资产类型尚无现行精确来源');
    let market: TradingMarket;
    if (/\.(SH|SZ|BJ)$/.test(symbol)) market = 'CN';
    else if (/\.HK$/.test(symbol)) market = 'HK';
    else if (/\.US$/.test(symbol)) market = 'US';
    else throw new MarketBarUnavailableError('策略风险标的市场无法识别');
    const end = await this.latestCompletedDailyDate(evaluatedAt, market);
    const first = start ? marketSessionDate(start, marketTimezones[market]) : end;
    if (first > end) return [];
    const input: MarketBarWindowReadInputV3 = {
      market,
      symbol,
      routeKey: {
        kind: 'bar' as const,
        market,
        assetType: normalizedAssetType,
        capability: 'DAILY_BAR' as const,
        timeframe: '1d' as const,
        adjustment: 'none' as const,
      },
      window: {
        start: first,
        end,
      },
    };
    if (background && !this.backgroundBars)
      throw new MarketBarUnavailableError('后台日线读取器未就绪', 'daily_bars_unavailable');
    const selected = background
      ? await this.backgroundBars!.read(input)
      : await this.bars.readV3(input);
    if (selected.status !== 'selected') {
      const reasons = {
        route_not_configured: '尚未选择日线数据来源',
        invalid_input: '日线请求参数无效',
        policy_mismatch: '日线路由与来源能力不匹配',
        catalog_unavailable: '日线数据来源目录暂不可用',
        incompatible_backup: '备用来源不支持当前日线口径',
        unsupported_granularity: '数据来源不支持当前周期',
        primary_unavailable: '日线主要来源和可用备用来源暂不可用',
      };
      throw new MarketBarUnavailableError(
        reasons[selected.selection.reason],
        `daily_bars_${selected.selection.reason}`,
      );
    }
    const availableBy = availabilityCutoff();
    const rows = selected.selection.response.bars
      .filter(
        (point) =>
          new Date(point.timestamp) <= evaluatedAt && new Date(point.availableAt) <= availableBy,
      )
      .map((point) => ({
        ...point,
        timestamp: new Date(point.timestamp),
        availableAt: new Date(point.availableAt),
        symbol,
        provider: selected.selection.response.provenance.providerId,
      }));
    return this.effectiveBars(take ? rows.slice(-take) : rows);
  }

  private async directBars(
    symbol: string,
    timeframe: '1m' | '1d',
    market: TradingMarket,
    assetType: string,
    evaluatedAt: Date,
    start?: Date,
    availabilityCutoff?: () => Date,
    background = false,
  ) {
    const rows = await this.storedBars(
      symbol,
      timeframe,
      evaluatedAt,
      assetType,
      start,
      start ? undefined : 64,
      availabilityCutoff,
      background,
    );
    const completed = await Promise.all(
      rows.map((row) => this.completedAt(row.timestamp, timeframe, market)),
    );
    return rows.filter((_, index) => {
      const completedAt = completed[index];
      return completedAt !== null && completedAt !== undefined && completedAt <= evaluatedAt;
    });
  }

  private async directExchangeValues(
    symbol: string,
    timeframe: '1m' | '1d',
    market: TradingMarket,
    assetType: string,
    source: StrategyRiskPositionTradeContext,
    evaluatedAt: Date,
    requiresHoldingPeriods: boolean,
    availabilityCutoff?: () => Date,
    background = false,
  ): Promise<ExchangeValues> {
    const start = requiresHoldingPeriods ? (source.trade?.openedAt ?? undefined) : undefined;
    const bars = await this.directBars(
      symbol,
      timeframe,
      market,
      assetType,
      evaluatedAt,
      start,
      availabilityCutoff,
      background,
    );
    const bar = bars.at(-1);
    const holdingPeriods =
      requiresHoldingPeriods && source.trade?.openedAt && bar
        ? Math.max(0, bars.length - 1)
        : undefined;
    return {
      ...(bar
        ? {
            price: bar.close.toString(),
            occurredAt: bar.timestamp.toISOString(),
            availableAt: bar.availableAt.toISOString(),
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
    availabilityCutoff?: () => Date,
    background = false,
  ): Promise<StrategyRiskActualContext> {
    const market = this.tradingMarket(target);

    let values: ExchangeValues = {};
    let inputIssue: StrategyMonitoringContext['inputIssue'];
    try {
      if (!market)
        throw new MarketBarUnavailableError(
          '缺少可识别的标的交易市场',
          'instrument_identity_unavailable',
        );
      if (isDerivedTimeframe(target.primaryTimeframe)) {
        throw new MarketBarUnavailableError(
          '风险监控尚无可用的已完成分钟线数据',
          'timeframe_unsupported',
        );
      } else if (target.primaryTimeframe === '1m' || target.primaryTimeframe === '1d') {
        values = await this.directExchangeValues(
          symbol,
          target.primaryTimeframe,
          market,
          target.executionInstrument.assetType,
          source,
          evaluatedAt,
          target.requiresHoldingPeriods === true,
          availabilityCutoff,
          background,
        );
      } else {
        throw new MarketBarUnavailableError(
          '风险监控尚无此周期的已完成行情数据',
          'timeframe_unsupported',
        );
      }
    } catch (error) {
      if (!isMarketBarTemporarilyUnavailable(error)) throw error;
      inputIssue = {
        code:
          error instanceof MarketBarUnavailableError ? error.reasonCode : 'daily_bars_unavailable',
        reason: error instanceof MarketBarUnavailableError ? error.message : '日线来源暂不可用',
      };
    }

    const base = this.baseContext(source);
    return this.exchangeContextProjection(target, source, base, values, inputIssue);
  }

  private exchangeContextProjection(
    target: StrategyRiskTarget,
    source: StrategyRiskPositionTradeContext,
    base: ReturnType<StrategyRiskContextService['baseContext']>,
    values: ExchangeValues,
    inputIssue: StrategyMonitoringContext['inputIssue'],
  ): StrategyRiskActualContext {
    return {
      ...(base.positionId ? { positionId: base.positionId } : {}),
      ...(base.tradeId ? { tradeId: base.tradeId } : {}),
      ...(base.openedAt ? { openedAt: base.openedAt } : {}),
      context: {
        ...(inputIssue ? { inputIssue } : {}),
        ...(target.requiresHoldingPeriods
          ? { holdingStartKnown: Boolean(source.trade?.openedAt) }
          : {}),
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
    evaluatedAt?: Date,
    background = false,
  ): Promise<StrategyRiskActualContext> {
    const requestedAt = evaluatedAt ?? new Date();
    await this.assertTarget(accountId, symbol, target);
    const source = await this.loadPositionTrade(accountId, symbol);
    const base = this.baseContext(source);
    if (background && (!base.quantity || !DecimalValue.from(base.quantity).isPositive()))
      return {
        context: {
          ...(base.quantity ? { quantity: base.quantity } : {}),
          ...(base.averageCost ? { averageCost: base.averageCost } : {}),
        },
      };
    if (target.executionInstrument.assetType === 'fund')
      return currentFundRiskContext(
        this.market,
        symbol,
        source,
        requestedAt,
        target.requiresHoldingPeriods === true,
      );
    return this.exchangeContext(
      symbol,
      target,
      source,
      requestedAt,
      evaluatedAt === undefined || background ? () => new Date() : undefined,
      background,
    );
  }
}
