import { chunk } from 'es-toolkit';
import {
  marketQuoteBatchRequestSchema,
  type MarketQuoteIdentity,
  type Quote,
} from '@thesis-ledger/schemas';
import { DsaError } from '../integration/dsa/dsa.client.js';
import type { QuoteReadOptions } from './market-quote-reader.js';

export type QuoteBatchResult = {
  identity: MarketQuoteIdentity;
  outcome: PromiseSettledResult<Quote>;
};
type Options = Pick<QuoteReadOptions, 'allowStale' | 'refresh' | 'signal'>;

/** 显式集合的执行边界；单标读取继续拥有缓存、主备与超时。 */
export async function readQuoteBatch(
  raw: readonly MarketQuoteIdentity[],
  read: (symbol: string, options: QuoteReadOptions) => Promise<Quote>,
  options: Options = {},
) {
  const { items } = marketQuoteBatchRequestSchema.parse({ items: raw });
  options.signal?.throwIfAborted();
  const unique = new Map(
    items.map((identity) => [`${identity.symbol}:${identity.assetType}`, identity]),
  );
  const results: QuoteBatchResult[] = [];
  for (const group of chunk([...unique.values()], 8)) {
    options.signal?.throwIfAborted();
    const outcomes = await Promise.allSettled(
      group.map(async (identity) => {
        const quote = await read(identity.symbol, { ...options, assetType: identity.assetType });
        if (quote.symbol !== identity.symbol) throw new Error('报价身份不匹配');
        return quote;
      }),
    );
    group.forEach((identity, index) => results.push({ identity, outcome: outcomes[index]! }));
  }
  return results;
}

export function quoteBatchFailure(error: unknown) {
  const code = error instanceof DsaError ? error.code : 'unavailable';
  const reason = error instanceof DsaError ? error.sourceReason : undefined;
  return {
    code,
    ...(['disabled', 'not_selected', 'not_eligible'].includes(reason ?? '')
      ? { reason: reason as 'disabled' | 'not_selected' | 'not_eligible' }
      : {}),
  };
}
