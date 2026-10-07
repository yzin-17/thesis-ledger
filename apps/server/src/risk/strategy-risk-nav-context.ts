import { ServiceUnavailableException } from '@nestjs/common';
import { fundNavHistorySchema } from '@thesis-ledger/schemas';
import type { MarketService } from '../market/market.service.js';
import type {
  StrategyRiskActualContext,
  StrategyRiskPositionTradeContext,
} from './strategy-risk-context.service.js';

export async function currentFundRiskContext(
  market: Pick<MarketService, 'getFundNavHistory'> | undefined,
  symbol: string,
  source: StrategyRiskPositionTradeContext,
  evaluatedAt: Date,
  requiresHoldingPeriods: boolean,
): Promise<StrategyRiskActualContext> {
  if (!market) throw new ServiceUnavailableException('现行基金净值读取器未配置');
  const history = fundNavHistorySchema.safeParse(
    await market.getFundNavHistory(
      symbol,
      { end: evaluatedAt.toISOString().slice(0, 10), limit: 3650 },
      { persistIdentity: false },
    ),
  );
  if (!history.success || history.data.some((point) => point.symbol !== symbol))
    throw new ServiceUnavailableException('基金净值不符合当前合同');
  const points = history.data
    .filter(
      (point) => new Date(point.navDate) <= evaluatedAt && new Date(point.fetchedAt) <= evaluatedAt,
    )
    .sort((left, right) => left.navDate.localeCompare(right.navDate));
  const nav = points.at(-1);
  const openedAt = source.trade?.openedAt;
  const canCount =
    requiresHoldingPeriods && openedAt && points[0] && new Date(points[0].navDate) <= openedAt;
  const holdingPeriods = canCount
    ? Math.max(0, points.filter((point) => new Date(point.navDate) >= openedAt).length - 1)
    : undefined;
  return {
    ...(source.position ? { positionId: source.position.id } : {}),
    ...(source.trade ? { tradeId: source.trade.id } : {}),
    ...(openedAt ? { openedAt: openedAt.toISOString() } : {}),
    context: {
      ...(source.position
        ? {
            quantity: source.position.quantity.toString(),
            averageCost: source.position.costPrice.toString(),
          }
        : {}),
      ...(nav
        ? {
            price: String(nav.unitNav),
            occurredAt: new Date(nav.navDate).toISOString(),
            availableAt: nav.fetchedAt,
          }
        : {}),
      ...(holdingPeriods === undefined ? {} : { holdingPeriods }),
    },
  };
}
