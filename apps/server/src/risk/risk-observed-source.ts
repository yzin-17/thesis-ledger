import type { MarketService } from '../market/market.service.js';
import type { ObservedMarketValue } from '../market/market-observations.service.js';

export const observedDataRuleKinds = new Set([
  'fixed-stop',
  'cost-stop',
  'take-profit',
  'price-above',
  'price-below',
  'trailing-stop',
  'position-concentration',
]);

/** No upstream methods are reachable from automatic monitoring. */
export function riskObservedSource(
  rows: readonly ObservedMarketValue[],
  now: Date,
): Pick<MarketService, 'getQuote' | 'getFundNav' | 'getFxRates'> {
  const current = (time: string, maxAge: number) => {
    const age = now.getTime() - Date.parse(time);
    return Number.isFinite(age) && age >= 0 && age <= maxAge;
  };
  return {
    getQuote(symbol) {
      const row = rows.find(
        (r) => r.observation.kind === 'quote' && r.observation.value.symbol === symbol,
      );
      if (!row || row.observation.kind !== 'quote')
        return Promise.reject(new Error('等待报价更新'));
      const quote = row.observation.value;
      const maxAge = quote.freshness === 'live' ? 5 * 60_000 : 30 * 60_000;
      if (
        quote.stale ||
        !quote.marketTime ||
        !['live', 'delayed'].includes(quote.freshness) ||
        !current(quote.marketTime, maxAge) ||
        !current(quote.fetchedAt, maxAge)
      )
        return Promise.reject(new Error('已有报价无法用于当前风险评估'));
      return Promise.resolve(quote);
    },
    getFundNav(symbol) {
      const row = rows.find(
        (r) => r.observation.kind === 'nav' && r.observation.value.symbol === symbol,
      );
      if (!row || row.observation.kind !== 'nav')
        return Promise.reject(new Error('等待正式净值更新'));
      const nav = row.observation.value;
      // Yesterday's official NAV is expected. Do not treat it as an intraday quote.
      if (
        nav.freshness !== 'delayed' ||
        nav.fallbackUsed ||
        !current(nav.fetchedAt, 24 * 60 * 60_000) ||
        Date.parse(nav.navDate) > now.getTime()
      )
        return Promise.reject(new Error('正式净值不可用于当前评估'));
      return Promise.resolve(nav);
    },
    getFxRates(input) {
      const row = rows.find(
        (r) =>
          r.observation.kind === 'fx' &&
          r.observation.value.baseCurrency === input.baseCurrency &&
          r.observation.value.asOf === (input.asOf ?? now.toISOString()).slice(0, 10),
      );
      if (
        !row ||
        row.observation.kind !== 'fx' ||
        !current(row.observation.value.fetchedAt, 24 * 60 * 60_000)
      )
        return Promise.reject(new Error('等待当前汇率更新'));
      return Promise.resolve(row.observation.value);
    },
  };
}
