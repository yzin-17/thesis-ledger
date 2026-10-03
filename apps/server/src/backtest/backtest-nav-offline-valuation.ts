import {
  DecimalValue,
  projectBacktestTrades,
  type CnNavSimulationState,
  type SimulationFillRecord,
} from '@thesis-ledger/domain';
import { compareNavOfflineTime, type NavOfflineInputs } from './backtest-nav-offline-events.js';

export const valueNavOfflineResult = (
  input: NavOfflineInputs,
  initialState: CnNavSimulationState,
  state: CnNavSimulationState,
  through: string,
) => {
  const visible = input.facts
    .flatMap((fact) => {
      const value = input.pricingFactAt(fact.valuationDate, through);
      return value ? [value] : [];
    })
    .sort((a, b) => a.valuationDate.localeCompare(b.valuationDate));
  const latest = visible.at(-1);
  const cash = initialState.ledger.cash.CNY.settled;
  const equity = latest?.nav
    ? DecimalValue.from(state.ledger.cash.CNY.settled)
        .plus(state.ledger.cash.CNY.unsettled)
        .plus(DecimalValue.from(state.ledger.position.quantity).times(latest.nav))
        .toString()
    : undefined;
  const first = visible.find((fact) => fact.valuationDate === input.plan.executionDates[0]);
  const fills: SimulationFillRecord[] = state.requests.flatMap((request) => {
    if (
      !request.fillId ||
      !request.nav ||
      !request.confirmedShares ||
      !request.confirmationAt ||
      compareNavOfflineTime(request.confirmationAt, through) > 0
    )
      return [];
    return [
      {
        fillId: request.fillId,
        orderId: request.requestId,
        executionSymbol: request.executionSymbol,
        side: request.requestType === 'subscribe' ? 'buy' : 'sell',
        quantity: request.confirmedShares,
        price: request.nav,
        charges: [{ amount: request.fee, currency: 'CNY' }],
        occurredAt: request.confirmationAt,
        availableAt: request.confirmationAt,
        reason: 'signal',
      },
    ];
  });
  return {
    fills,
    trades: projectBacktestTrades(
      fills.map((fill) => ({ ...fill, charges: [...fill.charges] })),
      {
        executionSymbol: input.config.executionInstrument.symbol,
        currency: 'CNY',
      },
    ).trades,
    valuation: {
      evaluatedAt: through,
      initialCash: cash,
      equity:
        equity ?? (state.ledger.position.quantity === '0' ? state.ledger.cash.CNY.settled : null),
      navDate: latest?.valuationDate ?? null,
    },
    benchmark:
      first?.nav && latest?.nav
        ? {
            status: 'available' as const,
            symbol: input.config.executionInstrument.symbol,
            startDate: first.valuationDate,
            endDate: latest.valuationDate,
            totalReturn: DecimalValue.from(latest.nav).dividedBy(first.nav).minus('1').toString(),
          }
        : { status: 'unavailable' as const, reason: '执行窗口内没有可见基准净值' },
  };
};
