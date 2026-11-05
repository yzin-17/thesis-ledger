import {
  correlateMarketReference,
  marketReferenceInputSchema,
  marketReferenceResultSchema,
  type MarketReferenceInput,
} from '@thesis-ledger/schemas';
import { ThesisLedgerContractError } from './api-error.js';
type Schema<T> = { safeParse(value: unknown): { success: true; data: T } | { success: false } };
type Request = <T>(path: string, schema: Schema<T>, init?: RequestInit) => Promise<T>;

export function marketReferenceClient(request: Request) {
  return {
    async getReference(input: MarketReferenceInput, signal?: AbortSignal) {
      const checked = marketReferenceInputSchema.parse(input);
      const path = '/api/market-data/reference';
      const raw = await request(path, marketReferenceResultSchema, {
        method: 'POST',
        body: JSON.stringify(checked),
        ...(signal ? { signal } : {}),
      });
      try {
        return correlateMarketReference(checked, raw);
      } catch {
        throw new ThesisLedgerContractError(path);
      }
    },
  };
}
