import { WatchlistPricesController } from './watchlist-prices.controller.js';
import { WatchlistPrices } from './watchlist-prices.js';
import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { MarketModule } from '../market/market.module.js';
import { WatchlistController } from './watchlist.controller.js';
import { WatchlistReader } from './watchlist-reader.js';
import { WatchlistRepository } from './watchlist.repository.js';

@Module({
  imports: [IdentityModule, MarketModule],
  controllers: [WatchlistController, WatchlistPricesController],
  providers: [WatchlistPrices, WatchlistRepository, WatchlistReader],
})
export class WatchlistModule {}
