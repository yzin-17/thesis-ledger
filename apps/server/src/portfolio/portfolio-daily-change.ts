import { roundMoney } from '@thesis-ledger/shared';

export const portfolioDailyChangeBasis = 'PREVIOUS_CLOSE_CURRENT_HOLDINGS' as const;

export const calculatePositionDailyChange = (
  quantity: number,
  currentPrice: number,
  previousClose: number | null | undefined,
) => {
  if (
    previousClose === null ||
    previousClose === undefined ||
    !Number.isFinite(previousClose) ||
    previousClose <= 0
  ) {
    return { dailyPnl: null, dailyReturn: null };
  }
  return {
    dailyPnl: roundMoney(quantity * (currentPrice - previousClose)),
    dailyReturn: currentPrice / previousClose - 1,
  };
};

export const findPreviousFundNav = (
  history: ReadonlyArray<{ unitNav: number; navDate: string }>,
  currentNavDate: string,
) => {
  const currentTime = new Date(currentNavDate).getTime();
  if (!Number.isFinite(currentTime)) return null;
  let previous: { unitNav: number; time: number } | null = null;
  for (const point of history) {
    const time = new Date(point.navDate).getTime();
    if (!Number.isFinite(time) || time >= currentTime) continue;
    if (previous === null || time > previous.time) previous = { unitNav: point.unitNav, time };
  }
  return previous?.unitNav ?? null;
};

export const calculatePortfolioDailyChange = (
  positions: ReadonlyArray<{
    symbol: string;
    baseDailyPnl: number | null;
    basePreviousMarketValue: number | null;
  }>,
) => {
  if (positions.length === 0) {
    return {
      pnl: null,
      returnRate: null,
      partial: false,
      missingSymbols: [],
      basis: portfolioDailyChangeBasis,
    };
  }
  const missingSymbols = positions
    .filter(
      (position) => position.baseDailyPnl === null || position.basePreviousMarketValue === null,
    )
    .map((position) => position.symbol);
  if (missingSymbols.length > 0) {
    return {
      pnl: null,
      returnRate: null,
      partial: true,
      missingSymbols: [...new Set(missingSymbols)],
      basis: portfolioDailyChangeBasis,
    };
  }
  const pnl = roundMoney(
    positions.reduce((sum, position) => sum + (position.baseDailyPnl ?? 0), 0),
  );
  const previousMarketValue = positions.reduce(
    (sum, position) => sum + (position.basePreviousMarketValue ?? 0),
    0,
  );
  return {
    pnl,
    returnRate: previousMarketValue > 0 ? pnl / previousMarketValue : null,
    partial: false,
    missingSymbols: [],
    basis: portfolioDailyChangeBasis,
  };
};
