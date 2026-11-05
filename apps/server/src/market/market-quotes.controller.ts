import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import {
  marketQuoteBatchRequestSchema,
  marketQuoteBatchResponseSchema,
} from '@thesis-ledger/schemas';
import { MarketService } from './market.service.js';
import { quoteBatchFailure } from './market-quote-batch.js';

@Controller('api/market')
export class MarketQuotesController {
  constructor(private readonly market: MarketService) {}
  @Post('quotes')
  async quotes(@Body() raw: unknown) {
    const request = marketQuoteBatchRequestSchema.safeParse(raw);
    if (!request.success) throw new BadRequestException('批量报价需要1～100个明确的证券和资产类型');
    const results = await this.market.getQuotes(request.data.items);
    return marketQuoteBatchResponseSchema.parse({
      version: 'market-quote-batch-v1',
      requestedCount: request.data.items.length,
      results: results.map(({ identity, outcome }) => {
        if (outcome.status === 'rejected')
          return { identity, status: 'unavailable', error: quoteBatchFailure(outcome.reason) };
        return { identity, status: outcome.value.stale ? 'stale' : 'ready', quote: outcome.value };
      }),
    });
  }
}
