import { z } from 'zod';
import { catalogItemSchema } from '@thesis-ledger/schemas';
import type { DsaClient } from './dsa.client.js';
import { DsaError } from './dsa-client-errors.js';

const responseSchema = z.object({
  contractVersion: z.literal(1),
  providerId: z.enum(['hithink', 'futu']),
  items: z.array(catalogItemSchema.extend({
    canonicalCode: z.string().trim().min(1),
    displayName: z.string().trim().min(1),
    market: z.enum(['SH', 'SZ', 'BJ', 'OF', 'HK', 'US']),
    instrumentType: z.enum(['STOCK', 'ETF', 'MUTUAL_FUND']),
  })).max(20),
});

export async function searchDsaInstruments(dsa: DsaClient, query: string) {
  const params = new URLSearchParams({ query });
  const response = await dsa.get<unknown>(`/api/v1/thesis-ledger/instruments/search?${params}`, 1);
  const parsed = responseSchema.safeParse(response);
  if (!parsed.success) throw new DsaError('标的搜索响应格式无效', 'invalid-response');
  return parsed.data.items;
}
