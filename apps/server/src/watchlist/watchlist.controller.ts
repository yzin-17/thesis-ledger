import { Body, Controller, Get, Header, Inject, Post, Query, UseGuards } from '@nestjs/common';
import {
  watchlistAddSchema,
  watchlistChangeSchema,
  type IdentityPrincipal,
} from '@thesis-ledger/schemas';
import { CurrentIdentity, IdentityGuard } from '../identity/identity.guard.js';
import { WatchlistReader } from './watchlist-reader.js';
import { WatchlistRepository } from './watchlist.repository.js';

@Controller('watchlist')
@UseGuards(IdentityGuard)
export class WatchlistController {
  constructor(
    @Inject(WatchlistReader) private readonly reader: WatchlistReader,
    @Inject(WatchlistRepository) private readonly store: WatchlistRepository,
  ) {}
  @Get()
  @Header('Cache-Control', 'private, no-store')
  list(@CurrentIdentity() principal: IdentityPrincipal, @Query() query: unknown) {
    return this.reader.read(principal.id, query);
  }

  @Post('items')
  add(@CurrentIdentity() principal: IdentityPrincipal, @Body() raw: unknown) {
    const { instrumentId, groupId } = watchlistAddSchema.parse(raw);
    return this.store.add(principal.id, instrumentId, groupId);
  }

  @Post('changes')
  change(@CurrentIdentity() principal: IdentityPrincipal, @Body() raw: unknown) {
    return this.store.change(principal.id, watchlistChangeSchema.parse(raw));
  }
}
