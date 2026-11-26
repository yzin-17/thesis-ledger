import { DecimalValue as D } from './decimal.js';
import { floorLotUnits } from './backtest-sizing.js';
import { availabilityForDecision } from './backtest-observation-clock.js';
import {
  resolveExecutionModelSegment,
  resolveNormalizedExecutionModelSegment,
} from './backtest-execution-model.js';
import { settlementAvailability } from './backtest-exchange.js';
import type { ExchangeSimulationRunInput } from './backtest-engine.js';
import type { BacktestDailyLedger } from './backtest-daily-ledger.js';

type Config = ConstructorParameters<typeof BacktestDailyLedger>[0];

/** 委托生命周期由撮合器管理；此处复用冻结的实际成交约束、费用及交收日历。 */
export function dailyBacktestVenue(input: ExchangeSimulationRunInput) {
  const { rules, calendar, executionModel, dataAsOf } = input.exchange;
  const normalized = input.accountingBasis === 'normalized-series';
  const bars = [...input.exchange.bars]
    .sort((a, b) => Date.parse(a.openedAt) - Date.parse(b.openedAt))
    .map((fact, index) => {
      if (fact.high === undefined || fact.low === undefined || fact.close === undefined)
        throw new Error('日线委托撮合需要冻结的完整 OHLC');
      const opening = availabilityForDecision({
        availableAt: fact.openAvailableAt,
        ...(fact.openResearchClock ? { researchClock: fact.openResearchClock } : {}),
      });
      const previous = availabilityForDecision({
        availableAt: fact.previousCloseAvailableAt,
        ...(fact.previousCloseResearchClock
          ? { researchClock: fact.previousCloseResearchClock }
          : {}),
      });
      const completed = availabilityForDecision(fact);
      if (!opening || !previous || !completed) throw new Error('日线委托行情的冻结可见性无效');
      return {
        key: fact.openedAt,
        index,
        openedAt: fact.openedAt,
        completedAt: fact.occurredAt,
        openAvailableAt: opening,
        completedAvailableAt: completed,
        open: fact.open,
        high: fact.high,
        low: fact.low,
        close: fact.close,
        tradable:
          fact.status !== 'unavailable' &&
          !fact.suspended &&
          calendar.isTradingSession(fact.openedAt) &&
          Date.parse(opening) <= Date.parse(fact.openedAt) &&
          Date.parse(previous) <= Date.parse(fact.openedAt),
        fact,
      };
    });
  const byTime = new Map(
    bars.flatMap(
      (bar) =>
        [
          [bar.openedAt, bar],
          [bar.completedAt, bar],
        ] as const,
    ),
  );
  const barAt = (at: string) => {
    const bar = byTime.get(at);
    if (!bar) throw new Error('成交时点不在冻结日线中');
    return bar;
  };
  const segmentAt = (at: string) => {
    if (!executionModel || !dataAsOf) {
      if (normalized) throw new Error('归一化日线撮合缺少冻结执行模型');
      return undefined;
    }
    const facts = {
      expectedVersion: executionModel.version,
      symbol: rules.instrumentFact.symbol,
      market: rules.instrumentFact.market,
      instrumentType: rules.instrumentFact.instrumentType,
      currency: rules.instrumentCurrency,
      evaluatedAt: barAt(at).openedAt,
      dataAsOf,
    };
    const segment = normalized
      ? resolveNormalizedExecutionModelSegment(executionModel, facts)
      : resolveExecutionModelSegment(executionModel, facts);
    if (segment.execution.mode !== 'exchange' || !segment.fees)
      throw new Error('日线委托需要交易所执行分段及费用');
    return segment;
  };
  const rulesAt = (at: string) => {
    const segment = segmentAt(at);
    if (!segment) return rules;
    return rules.withExecutionModel(segment);
  };
  const normalizePrice: NonNullable<Config['normalizePrice']> = (value, order, at) => {
    if (normalized) return value;
    const view = rulesAt(at);
    let price = view.normalizePrice(value);
    if (order.price.kind === 'limit') {
      const limit = D.from(order.price.price),
        tick = rules.instrumentFact.tickSize;
      const floor = D.from(floorLotUnits(limit.toString(), tick)).times(tick);
      if (order.side === 'buy' && price.compareTo(limit) > 0) price = floor;
      if (order.side === 'sell' && price.compareTo(limit) < 0)
        price = floor.compareTo(limit) === 0 ? floor : floor.plus(tick);
    }
    return price.toString();
  };
  const validateFill: Config['validateFill'] = (fill, order, at) => {
    const bar = barAt(at);
    if (normalized) {
      segmentAt(at);
      return bar.tradable
        ? { accepted: true }
        : { accepted: false, reason: '冻结交易日或标的不可交易' };
    }
    // 日线区间只有收盘桶，交易时段资格沿用本根实际开盘；不伪造盘中秒数。
    const decision = rulesAt(at).evaluate({
      symbol: input.simulation.strategy.executionInstrument.symbol,
      market: rules.instrumentFact.market,
      side: order.side,
      quantity: fill.quantity,
      rawPrice: fill.price,
      previousClose: bar.fact.previousClose,
      evaluatedAt: bar.openedAt,
      availableQuantity: input.ledger.snapshot().position.settledQuantity,
    });
    return decision.accepted
      ? { accepted: true }
      : { accepted: false, reason: `${decision.reasonCode}: ${decision.reason}` };
  };
  const settlementFor: Config['settlementFor'] = (fill) => {
    const bar = barAt(fill.occurredAt),
      dates = rulesAt(fill.occurredAt).settlementDates(
        fill.side,
        calendar.status(bar.openedAt).date,
      );
    return {
      cashAt: settlementAvailability(calendar, dates.cashAvailableOn, fill.occurredAt),
      positionAt: settlementAvailability(calendar, dates.positionAvailableOn, fill.occurredAt),
    };
  };
  return {
    bars,
    normalizePrice,
    validateFill,
    settlementFor,
    normalizedExecutionAt: (at: string) => {
      const segment = segmentAt(at);
      return segment?.execution.mode === 'exchange'
        ? segment.execution.normalizedExecution
        : undefined;
    },
    feesFor: (at: string) => segmentAt(at)?.fees,
    statutoryCharges: (side: 'buy' | 'sell', turnover: string, at: string) =>
      executionModel ? [] : rulesAt(at).statutoryCharges(side, turnover),
  };
}
