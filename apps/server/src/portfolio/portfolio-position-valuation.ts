import type { Currency } from '@thesis-ledger/schemas';
import { DsaError } from '../integration/dsa/dsa.client.js';
import { roundMoney } from '@thesis-ledger/shared';

import { calculatePositionDailyChange, findPreviousFundNav } from './portfolio-daily-change.js';

const isFundSymbol = (symbol: string) => /^\d{6}\.OF$/.test(symbol);

type PositionInput = {
  symbol: string;
  quantity: unknown;
  costPrice: unknown;
};

export type PortfolioMarketReader = {
  getQuote: (symbol: string) => Promise<{
    price: number;
    previousClose?: number;
    stale: boolean;
    freshness?: string;
  }>;
  getFundNav?: (symbol: string) => Promise<{
    unitNav: number;
    navDate: string;
    freshness: string;
  }>;
  getFundNavHistory?: (
    symbol: string,
    range: { limit: number },
    options: { persistIdentity: boolean },
  ) => Promise<Array<{ unitNav: number; navDate: string }>>;
};

export const valuePortfolioPosition = async <T extends PositionInput>(
  position: T,
  currency: Currency,
  market: PortfolioMarketReader,
) => {
  const quantity = Number(position.quantity);
  const costPrice = Number(position.costPrice);
  try {
    if (isFundSymbol(position.symbol)) {
      if (!market.getFundNav) throw new Error('基金净值能力未配置');
      const [nav, history] = await Promise.all([
        market.getFundNav(position.symbol),
        market.getFundNavHistory
          ? market
              .getFundNavHistory(position.symbol, { limit: 2 }, { persistIdentity: false })
              .catch(() => [])
          : Promise.resolve([]),
      ]);
      const previousClose = findPreviousFundNav(history, nav.navDate);
      const daily = calculatePositionDailyChange(quantity, nav.unitNav, previousClose);
      const marketValue = roundMoney(quantity * nav.unitNav);
      const costValue = roundMoney(quantity * costPrice);
      return {
        ...position,
        quantity,
        costPrice,
        currency,
        marketPrice: nav.unitNav,
        previousClose,
        marketValue,
        costValue,
        pnl: roundMoney(marketValue - costValue),
        pnlRatio: costValue === 0 ? null : marketValue / costValue - 1,
        ...daily,
        stale: nav.freshness === 'stale',
        freshness: nav.freshness,
        navDate: nav.navDate,
      };
    }
    const quote = await market.getQuote(position.symbol);
    const previousClose = quote.previousClose ?? null;
    const daily = calculatePositionDailyChange(quantity, quote.price, previousClose);
    const marketValue = roundMoney(quantity * quote.price);
    const costValue = roundMoney(quantity * costPrice);
    return {
      ...position,
      quantity,
      costPrice,
      currency,
      marketPrice: quote.price,
      previousClose,
      marketValue,
      costValue,
      pnl: roundMoney(marketValue - costValue),
      pnlRatio: costValue === 0 ? null : marketValue / costValue - 1,
      ...daily,
      stale: quote.stale,
      freshness: quote.freshness,
    };
  } catch (error) {
    return {
      ...position,
      quantity,
      costPrice,
      currency,
      marketPrice: null,
      previousClose: null,
      marketValue: null,
      costValue: roundMoney(quantity * costPrice),
      pnl: null,
      pnlRatio: null,
      dailyPnl: null,
      dailyReturn: null,
      stale: false,
      availabilityReason: availabilityReason(error),
      error: error instanceof Error ? error.message : '行情不可用',
    };
  }
};

function availabilityReason(error: unknown): 'disabled' | 'not_selected' | 'not_eligible' | 'unavailable' {
  if (error instanceof DsaError && error.code === 'control-rejected') {
    const reason = error.sourceReason;
    if (reason === 'disabled' || reason === 'not_selected' || reason === 'not_eligible') return reason;
  }
  return 'unavailable';
}
