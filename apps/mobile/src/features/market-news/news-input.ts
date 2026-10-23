import {
  marketNewsReadInputSchema,
  marketNewsFeedReadInputSchema,
  type MarketNewsReadInput,
  type MarketNewsFeedReadInput,
} from '@thesis-ledger/schemas';
import type { MobileInstrument } from '../market-detail/market-model';
export type NewsSubmission =
  | { kind: 'security'; input: MarketNewsReadInput }
  | { kind: 'feed'; input: MarketNewsFeedReadInput };
export function newsSubmission(
  form: { start: string; end: string; provider: string },
  instrument?: MobileInstrument,
): NewsSubmission {
  const window = {
    publishedStart: form.start || null,
    publishedEnd: form.end || null,
    limit: 5,
    requestBudgetMs: 15_000,
  };
  if (!instrument)
    return {
      kind: 'feed',
      input: marketNewsFeedReadInputSchema.parse({
        ...window,
        market: 'CN',
        providerId: form.provider,
      }),
    };
  if (instrument.market === 'UNKNOWN' || instrument.assetType === 'UNKNOWN')
    throw new Error('请先确认标的市场和资产类别。');
  return {
    kind: 'security',
    input: marketNewsReadInputSchema.parse({
      ...window,
      instrument: {
        symbol: instrument.symbol,
        market: instrument.market,
        assetType: instrument.assetType,
      },
    }),
  };
}
