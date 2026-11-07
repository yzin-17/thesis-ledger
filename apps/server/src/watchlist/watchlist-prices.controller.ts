import { Body, Controller, Header, HttpCode, Inject, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import type { IdentityPrincipal } from '@thesis-ledger/schemas';
import { CurrentIdentity, IdentityGuard } from '../identity/identity.guard.js';
import { WatchlistPrices } from './watchlist-prices.js';

@Controller('watchlist')
@UseGuards(IdentityGuard)
export class WatchlistPricesController {
  constructor(@Inject(WatchlistPrices) private readonly prices: WatchlistPrices) {}
  @Post('prices')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  async read(
    @CurrentIdentity() principal: IdentityPrincipal,
    @Body() raw: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    const controller = new AbortController();
    const close = () => controller.abort();
    response.once('close', close);
    try {
      return await this.prices.read(principal.id, raw, controller.signal);
    } finally {
      response.off('close', close);
    }
  }
}
