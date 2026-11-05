import type { FundHoldings } from '@thesis-ledger/schemas';
import type { MarketService } from './market.service.js';
import type { MarketBarReader } from './market-bar-reader.js';
import { fundDisclosureAvailableAt } from './fund-valuation-disclosure.js';
import { requireFundEstimateAnchor } from './fund-valuation-price-evidence.js';
import { readFundAdjustedHoldingReturn, type FundHoldingPriceEvidence } from './fund-valuation-adjusted-return.js';

export class FundValuationError extends Error {
  constructor(readonly reason: 'nav_unavailable' | 'disclosure_unavailable' | 'prices_unavailable' | 'currency_unverified' | 'currency_unsupported') {
    super(reason);
  }
}

export const estimateFundNavFromHoldings = (
  anchorNav: number,
  holdings: FundHoldings['holdings'],
  returns: ReadonlyMap<string, number>,
) => {
  let contribution = 0;
  let pricedCoverage = 0;
  for (const holding of holdings) {
    const change = returns.get(holding.symbol);
    if (change === undefined || !Number.isFinite(change)) continue;
    contribution += holding.weight * change;
    pricedCoverage += holding.weight;
  }
  const disclosureCoverage = holdings.reduce((total, holding) => total + holding.weight, 0);
  return {
    estimatedNav: anchorNav * (1 + contribution),
    disclosureCoverage,
    pricedCoverage,
  };
};

export async function readFundNavEstimate(input: {
  symbol: string;
  at: Date;
  market: Pick<MarketService, 'getFundNav' | 'getFundHoldings' | 'getQuote'>;
  bars: Pick<MarketBarReader, 'readChartV3'>;
  current?: boolean;
}) {
  const { symbol, at, market, bars } = input;
  const [nav, holdings] = await Promise.all([
    market.getFundNav(symbol, { allowStale: !input.current }),
    market.getFundHoldings(symbol),
  ]);
  if (nav.symbol !== symbol || holdings.fundSymbol !== symbol) throw new FundValuationError('nav_unavailable');
  try { requireFundEstimateAnchor(nav); }
  catch { throw new FundValuationError('nav_unavailable'); }
  if (input.current && (nav.freshness === 'stale' || Date.parse(nav.navDate) > at.getTime()))
    throw new FundValuationError('nav_unavailable');
  let disclosureAvailableAt: string;
  try { disclosureAvailableAt = fundDisclosureAvailableAt(holdings, at); }
  catch { throw new FundValuationError('disclosure_unavailable'); }
  if (input.current && !holdings.holdings.some((holding) => holding.weight > 0))
    throw new FundValuationError('disclosure_unavailable');
  const returns = new Map<string, number>();
  const holdingPrices: FundHoldingPriceEvidence[] = [];
  await Promise.all(holdings.holdings.filter((holding) => holding.weight > 0).map(async (holding) => {
    const priced = await readFundAdjustedHoldingReturn({
      symbol: holding.symbol,
      assetType: /^[15]\d{5}\.(SH|SZ|BJ)$/.test(holding.symbol) ? 'ETF' : 'STOCK',
      navDate: nav.navDate, at, market, bars,
      ...(input.current ? { maxPriceAgeMs: 5 * 60_000 } : {}),
    });
    holdingPrices.push(priced.evidence);
    if (priced.change !== undefined) returns.set(holding.symbol, priced.change);
  }));
  const estimate = estimateFundNavFromHoldings(nav.unitNav, holdings.holdings, returns);
  return {
    nav, estimate,
    evidence: {
      symbol, anchorNav: nav.unitNav, anchorDate: nav.navDate,
      estimatedNav: estimate.estimatedNav, reportPeriod: holdings.reportPeriod,
      disclosureDate: holdings.disclosureDate, disclosureEvidence: holdings.disclosureEvidence ?? null,
      disclosureAvailableAt, evidenceVersion: holdings.evidenceVersion,
      holdingPrices, disclosureCoverage: estimate.disclosureCoverage, pricedCoverage: estimate.pricedCoverage,
    },
  };
}
