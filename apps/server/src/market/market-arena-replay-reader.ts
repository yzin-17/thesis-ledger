import { Inject, Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  arenaDateAt,
  DecimalValue,
  projectMarketSession,
  type ArenaPaperContext,
} from '@thesis-ledger/domain';
import {
  type ArenaLiveProtocol,
  type BarPoint,
} from '@thesis-ledger/schemas';
import { MarketPeriodCalendarReader } from './market-period-calendar-reader.js';
import { MarketBarReader } from './market-bar-reader.js';
import { DsaClient } from '../integration/dsa/dsa.client.js';
import { MarketLifecycleReaderV3 } from './market-lifecycle-reader-v3.js';
import { MarketActionCoverage } from './market-action-coverage.js';
import { readReplayExecutionEvidence, replayResearchExecutionReason } from './market-arena-replay-execution.js';
import { sampledCalendar } from './market-sampled-calendar.js';
import { MarketArenaHistorySource } from './market-arena-history-source.js';

export type ArenaReplayObservation = {
  at: string;
  session: ReturnType<typeof projectMarketSession>;
  context: ArenaPaperContext;
  prices: Map<string, string>;
  evidence: Record<string, unknown>;
  observations?: Pick<
    ArenaPaperContext['quotes'][number],
    'symbol' | 'price' | 'marketTime' | 'observedAt'
  >[];
};

/** 历史观察只消费已发布的冻结证据；不访问交互图表或当前行情。 */
@Injectable()
export class MarketArenaReplayReader {
  constructor(
    @Inject(MarketPeriodCalendarReader)
    private readonly calendars: Pick<MarketPeriodCalendarReader, 'read'>,
    @Inject(MarketBarReader) private readonly bars: Pick<MarketBarReader, 'readRetainedResearch'>,
    @Inject(DsaClient) private readonly dsa: Pick<DsaClient, 'backtestInstrumentFacts'> &
      Partial<Pick<DsaClient, 'historicalExecution'>>,
    @Inject(MarketLifecycleReaderV3)
    private readonly status: Pick<MarketLifecycleReaderV3, 'readComposition'>,
    @Inject(MarketActionCoverage) private readonly actions: Pick<MarketActionCoverage, 'read'>,
    @Optional()
    @Inject(MarketArenaHistorySource)
    private readonly history?: Pick<MarketArenaHistorySource, 'resolve' | 'prices'> &
      Partial<Pick<MarketArenaHistorySource, 'research' | 'search'>>,
  ) {}
  async next(p: ArenaLiveProtocol, after: string, target: string) {
    const start = arenaDateAt(after, p.timeZone),
      end = arenaDateAt(target, p.timeZone);
    const result = await this.calendars.read({
      market: p.market,
      start,
      end,
      evaluationAsOf: after,
    });
    if (result.status !== 'ready') throw new Error('replay_calendar_unavailable');
    for (const session of result.calendar.sessions) {
      const at = Math.max(
        Date.parse(session.startAt) + 60000,
        Math.ceil((Date.parse(after) + 1) / 60000) * 60000,
      );
      if (at <= Date.parse(session.endAt) && at <= Date.parse(target))
        return new Date(at).toISOString();
    }
    return target;
  }
  async observe(
    p: ArenaLiveProtocol,
    at: string,
    symbols: readonly string[],
    held: readonly { symbol: string; acquiredOn: string }[] = [],
    executionSymbols: readonly string[] = symbols,
    expiryDates: readonly string[] = [],
    buySymbols: readonly string[] = executionSymbols,
    readPrices = true,
  ): Promise<ArenaReplayObservation> {
    const day = arenaDateAt(at, p.timeZone);
    if (!readPrices) {
      const instruments = await this.resolve(p, symbols, at);
      return { at, session: projectMarketSession(null, new Date(at)), prices: new Map(), evidence: {},
        context: { at, tradingDate: day, fees: p.fees, matching: p.matching,
          maxPositionBps: p.maxPositionBps, maxActiveSymbols: p.resources.maxActiveSymbols,
          allowedSymbols: new Set(instruments.map(i => i.symbol)), quotes: [], newId: randomUUID,
          expiresAt: () => { throw new Error('expiry_calendar_unavailable'); } } };
    }
    const defaultEnd = new Date(Date.parse(day + 'T00:00:00Z') + 14 * 86400000).toISOString().slice(0, 10);
    const settlement = p.simulationPolicy && p.market === 'CN' && buySymbols.length
      ? await sampledCalendar(this.calendars, p.market, day, new Date(at), true, []) : null;
    if (p.simulationPolicy && p.market === 'CN' && buySymbols.length && !settlement)
      throw new Error('replay_calendar_unavailable');
    const end = [p.simulationPolicy ? settlement?.positionAvailableOn ?? day : defaultEnd, ...expiryDates].sort().at(-1)!;
    const start = p.simulationPolicy ? day : new Date(Date.parse(day + 'T00:00:00Z') - 14 * 86400000)
      .toISOString()
      .slice(0, 10);
    let result = await this.calendars.read({ market: p.market, start, end, evaluationAsOf: at });
    if (result.status !== 'ready') throw new Error('replay_calendar_unavailable');
    let session = projectMarketSession(result.calendar, new Date(at));
    for (let days = 1; p.simulationPolicy && symbols.length && session.state === 'closed' && !session.latestTradingDate && days <= 31; days++) {
      const previous = new Date(Date.parse(day + 'T00:00:00Z') - days * 86400000).toISOString().slice(0, 10);
      result = await this.calendars.read({ market: p.market, start: previous, end, evaluationAsOf: at });
      if (result.status !== 'ready') throw new Error('replay_calendar_unavailable');
      session = projectMarketSession(result.calendar, new Date(at));
    }
    const instruments = await this.resolve(p, symbols, at);
    const quotes: ArenaPaperContext['quotes'][number][] = [],
      prices = new Map<string, string>();
    const observations: NonNullable<ArenaReplayObservation['observations']> = [];
    const evidence: Record<string, unknown> = { calendar: result.calendar };
    for (const symbol of new Set(symbols)) {
      const instrument = instruments.find((item) => item.symbol === symbol);
      if (!instrument) throw new Error('replay_tools_unavailable');
      const priceDay = session.state === 'open' ? day : session.latestTradingDate;
      if (!priceDay) throw new Error('replay_calendar_unavailable');
      const { reconstructed, frozen, point, sourceRef } = await this.retainedReplayPrice(
        p,
        at,
        symbol,
        instrument,
        priceDay,
        result.calendar,
        session.state === 'open',
      );
      evidence[symbol] = {
        ...replayPriceEvidence(instrument, reconstructed, frozen, point, sourceRef),
      };
      prices.set(symbol, String(point.close));
      observations.push({
        symbol,
        price: String(point.close),
        marketTime: point.timestamp,
        observedAt: at,
      });
      const acquiredOn = held.filter(item => item.symbol === symbol).map(item => item.acquiredOn).sort()[0];
      const events = acquiredOn ? await this.actions.read({ symbol, assetType: instrument.assetType,
        market: p.market, previousDay: acquiredOn, now: new Date(at) }, day, p.simulationPolicy) : [];
      if (events === null) {
        prices.delete(symbol);
        evidence[symbol] = { ...evidence[symbol] as object, reason: 'corporate_action_unprocessed' };
        continue;
      }
      if (!executionSymbols.includes(symbol)) continue;
      // 休市估值沿用已完成分钟的执行证据，保留原始时钟；新订单仍受 session 门禁约束。
      const executionAt = session.state === 'closed' ? point.timestamp : at;
      const { fact, rule, lot, tick, status, tradingDay, priceRule } =
        await readReplayExecutionEvidence(this.dsa, this.status, p, instrument, at, executionAt, day);
      const dates = [...new Set(result.calendar.sessions.map((s) => s.tradingDate))].sort();
      const sellable = p.simulationPolicy && !buySymbols.includes(symbol) ? day
        : dates[dates.indexOf(day) + rule.positionSettlement.sellableAfterTradingDays];
      const cashDate = dates[dates.indexOf(day) + rule.cashSettlement.sellCreditAfterTradingDays];
      if (!sellable || !cashDate) throw new Error('replay_calendar_unavailable');
      const charge = (side: 'buy' | 'sell', amount: string) =>
        rule.statutoryCharges
          .filter((c) => c.side === side || c.side === 'both')
          .reduce((sum, c) => {
            const fee = DecimalValue.from(amount).times(c.rate);
            return sum.plus(c.minimum && fee.compareTo(c.minimum) < 0 ? c.minimum : fee);
          }, DecimalValue.from('0'))
          .toString();
      evidence[symbol] = {
        ...replayPriceEvidence(instrument, reconstructed, frozen, point, sourceRef),
        fact,
        status,
        events,
      };
      const suspended =
        tradingDay.state === 'suspended' ||
        tradingDay.intradayHalts.some(
          (halt) =>
            Date.parse(halt.startedAt) <= Date.parse(at) &&
            (!halt.endedAt || Date.parse(halt.endedAt) > Date.parse(at)),
        );
      quotes.push({
        symbol,
        price: String(point.close),
        marketTime: point.timestamp,
        observedAt: at,
        tradingDate: day,
        positionAvailableOn: sellable,
        cashAvailableOn: cashDate,
        lot,
        tick,
        sourceRef,
        evidence: evidence[symbol],
        buyBlocked: suspended ? 'suspended' : null,
        sellBlocked: suspended ? 'suspended' : null,
        ...(!p.simulationPolicy && priceRule.kind === 'exact'
          ? { upperLimit: priceRule.upper, lowerLimit: priceRule.lower }
          : {}),
        statutoryBuyFee: (amount) => charge('buy', amount),
        statutorySellFee: (amount) => charge('sell', amount),
      });
    }
    return {
      at,
      session,
      prices,
      evidence,
      observations,
      context: {
        at,
        tradingDate: day,
        fees: p.fees,
        matching: p.matching,
        maxPositionBps: p.maxPositionBps,
        maxActiveSymbols: p.resources.maxActiveSymbols,
        allowedSymbols: new Set(instruments.map((item) => item.symbol)),
        quotes,
        valuationPrices: prices,
        newId: randomUUID,
        expiresAt: (requested, kind) => {
          const date = requested ?? day;
          if (p.endsOn && date > p.endsOn) throw new Error('expiry_outside_season');
          if (date > end) throw new Error('expiry_calendar_unavailable');
          const sessions = result.calendar.sessions.filter((s) =>
            kind === 'market'
              ? Date.parse(s.startAt) <= Date.parse(at) && Date.parse(s.endAt) > Date.parse(at)
              : s.tradingDate >= day && s.tradingDate <= date,
          );
          const last = sessions.at(-1);
          if (!last) throw new Error('expiry_calendar_unavailable');
          return last.endAt;
        },
      },
    };
  }

  private async retainedReplayPrice(
    p: ArenaLiveProtocol,
    at: string,
    symbol: string,
    instrument: ReplayInstrument,
    priceDay: string,
    calendar: ReplayCalendar,
    exact: boolean,
  ) {
    const reconstructed =
      this.history && p.market === 'CN'
        ? await this.history.prices(p, symbol, instrument.assetType, priceDay, at)
        : null;
    const acquired = reconstructed
      ? null
      : await this.bars.readRetainedResearch({
          market: p.market,
          symbol,
          routeKey: {
            kind: 'bar',
            market: p.market,
            assetType: instrument.assetType,
            capability: 'MINUTE_BAR',
            timeframe: '1m',
            adjustment: 'none',
          },
          window: { start: priceDay, end: priceDay },
        });
    if (!reconstructed && (!acquired || acquired.status !== 'selected'))
      throw new Error('replay_prices_unavailable');
    const frozen = acquired?.status === 'selected' ? acquired : null;
    const sourcePoints =
      reconstructed?.points ??
      (acquired?.status === 'selected' ? acquired.selection.response.bars : []);
    const regularPoints = sourcePoints.filter((point) =>
      calendar.sessions.some(
        (period) =>
          Date.parse(point.timestamp) > Date.parse(period.startAt) &&
          Date.parse(point.timestamp) <= Date.parse(period.endAt),
      ),
    );
    const point = visibleReplayPoint(regularPoints, at, exact);
    if (!point) throw new Error('replay_prices_unavailable');
    const sourceRef = reconstructed?.seriesVersion ?? frozen!.seriesVersion;

    return { reconstructed, frozen, point, sourceRef };
  }
  private async resolve(p: ArenaLiveProtocol, symbols: readonly string[], at: string) {
    if (!symbols.length) return [];
    if (this.history) return this.history.resolve(p, symbols, at);
    const rows = p.instruments
      .filter((i) => symbols.includes(i.symbol))
      .map((i) => ({ ...i, name: i.symbol }));
    if (p.universe !== 'fixed' || symbols.some((symbol) => !rows.some((i) => i.symbol === symbol)))
      throw new Error('symbol_outside_universe');
    return rows;
  }
  async search(p: ArenaLiveProtocol, at: string, query: string) {
    if (!this.history?.search) throw new Error('replay_tools_unavailable');
    return {
      asOf: at,
      identitySource: 'current-directory',
      historicalEligibility: 'unverified',
      items: await this.history.search(p, query, at),
    };
  }
  async quote(p: ArenaLiveProtocol, at: string, symbol: string) {
    const read = await this.observe(p, at, [symbol], [], []);
    const evidence = read.evidence[symbol];
    let execution: { status: 'available' | 'unavailable'; reason?: string };
    try {
      await this.observe(p, at, [symbol]);
      execution = { status: 'available' };
    } catch (error) {
      execution = {
        status: 'unavailable',
        reason: replayResearchExecutionReason(error),
      };
    }
    const { point, sourceRef } = evidence as { point: BarPoint; sourceRef: string };
    return {
      symbol,
      price: read.prices.get(symbol),
      marketTime: point.timestamp,
      asOf: at,
      sourceRef,
      evidence,
      execution,
    };
  }
  async research(
    p: ArenaLiveProtocol,
    at: string,
    input: { symbol: string; timeframe: string; limit: number; indicator?: 'MA' | 'MACD' | 'RSI' },
  ) {
    if (!this.history?.research) throw new Error('replay_tools_unavailable');
    return this.history.research(p, at, input);
  }
}

/** 只有完整、恰好落在该观察点且已可见的分钟记录能用于撮合。 */
export function visibleReplayPoint(points: readonly BarPoint[], at: string, exact = true) {
  return (
    [...points]
      .reverse()
      .find(
        (point) =>
          point.completionStatus === 'complete' &&
          (exact
            ? Date.parse(point.timestamp) === Date.parse(at)
            : Date.parse(point.timestamp) <= Date.parse(at)) &&
          Date.parse(point.availableAt) <= Date.parse(at) &&
          point.close > 0,
      ) ?? null
  );
}

type ReplayInstrument = { symbol: string; assetType: 'STOCK' | 'ETF' };
type ReplayCalendar = NonNullable<Parameters<typeof projectMarketSession>[0]>;

function replayPriceEvidence(
  instrument: ReplayInstrument,
  reconstructed: { evidence?: unknown } | null | undefined,
  frozen: { evidence?: unknown } | null | undefined,
  point: BarPoint,
  sourceRef: string,
) {
  return {
    identity: instrument,
    frozenWindow: reconstructed?.evidence ?? frozen?.evidence,
    point,
    sourceRef,
  };
}
