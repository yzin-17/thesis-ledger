import type { researchScopeInstrumentsV2 } from '@thesis-ledger/schemas';
import type { MarketService } from '../market/market.service.js';
import type { ResearchPreparationBudget } from './research-preparation-budget.js';
import {
  quoteResearchEvidence,
  fundNavResearchEvidence,
  missingResearchEvidence,
} from './research-public-evidence.js';

/** 价格单位取实际响应；净值仅消费 Market 已核对的 CNY 元数据资格。 */
export async function readResearchPrice(
  market: MarketService,
  selected: ReturnType<typeof researchScopeInstrumentsV2>[number],
  budget: ResearchPreparationBudget,
) {
  const instrument = { ...selected };
  if (instrument.assetType === 'MUTUAL_FUND') {
    const result = await market.getFundNavWithCurrency(
      { instrumentId: instrument.instrumentId, symbol: instrument.symbol },
      budget.signal,
    );
    if (result.status === 'unavailable')
      return { instrument, evidence: missingResearchEvidence('quote', true, result.reason) };
    instrument.currency = result.currency;
    return {
      instrument,
      evidence: fundNavResearchEvidence(result, instrument, new Date().toISOString()),
    };
  }
  const quote = await market.getQuote(instrument.symbol, {
    assetType: instrument.assetType,
    allowStale: false,
    signal: budget.signal,
  });
  if (quote.units) instrument.currency = quote.units.priceCurrency;
  return {
    instrument,
    evidence: quoteResearchEvidence(quote, instrument, new Date().toISOString()),
  };
}
