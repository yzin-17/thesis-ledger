import type { TradeChartQuery, TradeChartResponse } from '@thesis-ledger/schemas';

type TradeChartDisplayScope = { [K in keyof TradeChartQuery]: TradeChartQuery[K] | undefined };

export function tradeChartForScope(
  data: TradeChartResponse | undefined,
  scope: TradeChartDisplayScope,
) {
  return data?.version === 'trade-chart-v1' &&
    data.accountId === scope.accountId &&
    data.mode === scope.mode &&
    data.symbol === scope.symbol &&
    data.start === scope.start &&
    data.end === scope.end
    ? data
    : undefined;
}
