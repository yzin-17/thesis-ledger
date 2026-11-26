import {
  activeBacktestTradePlan,
  availabilityForDecision,
  isAvailableForDecisionAt,
  type SimulationTargetIntent,
  type runExchangeSimulation,
} from '@thesis-ledger/domain';
import type {
  BacktestVerticalInput,
  executionBars,
  fxRatesFrom,
  instrumentFact,
  tradingCalendarFromFact,
} from './backtest-v2-execution-shared.js';
import { buildBacktestSizingEquity } from './backtest-sizing-equity.js';
type ExchangeVerticalInput = BacktestVerticalInput;
type ExchangeBars = ReturnType<typeof executionBars>;
type ExchangeCalendar = ReturnType<typeof tradingCalendarFromFact>;
type ExchangeSizing = Parameters<typeof runExchangeSimulation>[0]['exchange']['sizingForIntent'];

function sizingPrice(bar: ExchangeBars[number] | undefined, closing: boolean) {
  if (!bar) return undefined;
  const clock = closing ? bar.researchClock : bar.openResearchClock;
  return {
    value: closing ? bar.close : bar.open,
    occurredAt: closing ? bar.occurredAt : bar.openedAt,
    availableAt: closing ? bar.availableAt : bar.openAvailableAt,
    ...(clock ? { researchClock: clock } : {}),
  };
}

export function exchangeSizing(
  input: ExchangeVerticalInput,
  bars: ExchangeBars,
  calendar: ExchangeCalendar,
  fact: ReturnType<typeof instrumentFact>,
  fxRates: ReturnType<typeof fxRatesFrom>,
  actualBars: ExchangeBars,
  isNormalizedSeries: boolean,
): ExchangeSizing {
  const instrument = input.strategy.executionInstrument;
  const plan = activeBacktestTradePlan(input.strategy.tradePlan);
  const closing = Boolean(plan?.riskBudget || plan?.volatilityTarget || input.strategy.execution.timing === 'dailyBarOrders');
  return (intent: SimulationTargetIntent, state) => {
    const nextOpen = bars.find(
      (b) =>
        Date.parse(b.openedAt) > Date.parse(intent.occurredAt) &&
        calendar.isTradingSession(b.openedAt),
    );
    const bar = closing
      ? [...bars]
          .reverse()
          .find(
            (b) =>
              Date.parse(b.occurredAt) <= Date.parse(intent.occurredAt) &&
              isAvailableForDecisionAt(b, intent.occurredAt),
          )
      : nextOpen;
    const projection = (selected: ExchangeBars[number] | undefined, close: boolean) => {
      const price = sizingPrice(selected, close);
      const evaluationAt = close || !price ? intent.occurredAt : availabilityForDecision(price)!;
      return {
        evaluationAt,
        ...(price
          ? {
              price,
              ...buildBacktestSizingEquity({
                state,
                executionCurrency: fact.currency,
                evaluationAt,
                policy: input.runConfig.valuationPolicy,
                price: {
                  symbol: instrument.symbol,
                  market: instrument.market,
                  assetType: instrument.assetType,
                  currency: fact.currency,
                  price: price.value,
                  occurredAt: price.occurredAt,
                  availableAt: price.availableAt,
                  ...(price.researchClock ? { researchClock: price.researchClock } : {}),
                },
                fxRates,
              }),
            }
          : {}),
      };
    };
    const decision = projection(bar, closing);
    let rule = input.strategy.sizing;
    if (intent.side === 'sell')
      rule = isNormalizedSeries
        ? { type: 'targetWeight', weight: '0' }
        : { type: 'fixedQuantity', quantity: state.position.quantity };
    const actual = bar ? actualBars.find((b) => b.openedAt === bar.openedAt) : undefined;
    return {
      rule,
      executionCurrency: fact.currency,
      lotSize: fact.lotSize,
      currentQuantity: state.position.quantity,
      ...decision,
      executionProjection: projection(nextOpen, false),
      ...(input.runConfig.priceResearch && rule.type === 'fixedQuantity'
        ? {
            priceResearchReference: {
              protocolVersion: input.runConfig.priceResearch.protocolVersion,
              ...(actual ? { actualPrice: sizingPrice(actual, closing)! } : {}),
            },
          }
        : {}),
    };
  };
}
