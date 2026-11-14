import { BadRequestException, Body, Controller, Get, Header, Inject, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { arenaCatalogQuerySchema, arenaPointQuerySchema, type IdentityPrincipal } from '@thesis-ledger/schemas';
import { CurrentIdentity, IdentityGuard } from '../../identity/identity.guard.js';
import { LiveMatchesRepository } from './live-matches.repository.js';
import { LiveMatchesQuery } from './live-matches.query.js';
import { LiveValuations } from './live-valuations.js';
import { LiveMatchesCatalog } from './live-matches-catalog.js';

@Controller('arena-matches')
@UseGuards(IdentityGuard)
export class LiveMatchesController {
  constructor(
    @Inject(LiveMatchesRepository) private readonly matches: LiveMatchesRepository,
    @Inject(LiveMatchesQuery) private readonly query: LiveMatchesQuery,
    @Inject(LiveValuations) private readonly valuations: LiveValuations,
    @Inject(LiveMatchesCatalog) private readonly catalog: LiveMatchesCatalog,
  ) {}
  @Post() create(@CurrentIdentity() p: IdentityPrincipal, @Body() body: unknown) { return this.matches.create(p.id, body); }
  @Get() @Header('Cache-Control', 'private, no-store')
  list(@CurrentIdentity() p: IdentityPrincipal) { return this.matches.list(p.id); }
  @Get('catalog') @Header('Cache-Control', 'private, no-store')
  listCatalog(@CurrentIdentity() p: IdentityPrincipal, @Query() raw: unknown) {
    const query = arenaCatalogQuerySchema.safeParse(raw);
    if (!query.success) throw new BadRequestException('比赛列表筛选参数无效');
    return this.catalog.read(p.id, query.data);
  }
  @Get(':id') @Header('Cache-Control', 'private, no-store')
  read(@CurrentIdentity() p: IdentityPrincipal, @Param('id', new ParseUUIDPipe()) id: string) { return this.query.read(p.id, id); }
  @Get(':id/points') @Header('Cache-Control', 'private, no-store')
  points(@CurrentIdentity() p: IdentityPrincipal, @Param('id', new ParseUUIDPipe()) id: string, @Query() input: unknown) {
    return this.query.points(p.id, id, arenaPointQuerySchema.parse(input));
  }
  @Post(':id/start')
  start(@CurrentIdentity() p: IdentityPrincipal, @Param('id', new ParseUUIDPipe()) id: string) { return this.matches.transition(p.id, id, 'running'); }
  @Post(':id/replay/retry')
  retryReplay(@CurrentIdentity() p: IdentityPrincipal, @Param('id', new ParseUUIDPipe()) id: string) { return this.matches.retryReplay(p.id, id); }
  @Post(':id/pause')
  pause(@CurrentIdentity() p: IdentityPrincipal, @Param('id', new ParseUUIDPipe()) id: string) { return this.matches.transition(p.id, id, 'paused'); }
  @Post(':id/end')
  async end(@CurrentIdentity() p: IdentityPrincipal, @Param('id', new ParseUUIDPipe()) id: string) {
    await this.query.read(p.id, id);
    await this.valuations.capture(id);
    return this.matches.transition(p.id, id, 'ended');
  }
  @Post(':id/agents/:agentId/trigger')
  trigger(@CurrentIdentity() p: IdentityPrincipal, @Param('id', new ParseUUIDPipe()) id: string,
    @Param('agentId', new ParseUUIDPipe()) agentId: string) { return this.matches.trigger(p.id, id, agentId); }
  @Post(':id/agents/:agentId/retry')
  retry(@CurrentIdentity() p: IdentityPrincipal, @Param('id', new ParseUUIDPipe()) id: string,
    @Param('agentId', new ParseUUIDPipe()) agentId: string) { return this.matches.retry(p.id, id, agentId); }
}
