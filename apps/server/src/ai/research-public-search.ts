import { Inject, Injectable } from '@nestjs/common';
import { researchPublicSearchRequestSchema, researchPublicSearchResultSchema } from '@thesis-ledger/schemas';
import { DsaClient } from '../integration/dsa/dsa.client.js';

@Injectable()
export class ResearchPublicSearch {
  constructor(@Inject(DsaClient) private readonly dsa: Pick<DsaClient, 'post'>) {}
  async read(query: string, market: 'CN' | 'HK' | 'US', signal: AbortSignal) {
    const input = researchPublicSearchRequestSchema.parse({ query, market, limit: 5 });
    const raw = await this.dsa.post('/api/v1/thesis-ledger/research/search', input, 1, undefined, 15000, signal);
    const result = researchPublicSearchResultSchema.parse(raw);
    if (result.query !== input.query || result.market !== market || result.items.length > input.limit) throw new Error('search_response_mismatch');
    return result;
  }
}
