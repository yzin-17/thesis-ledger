import {
  Controller,
  Get,
  Header,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import type { IdentityPrincipal } from '@thesis-ledger/schemas';
import { CurrentIdentity, IdentityGuard } from '../identity/identity.guard.js';
import { ArenaWeekStore } from './arena-week-store.js';
@Controller('model-weeklies')
@UseGuards(IdentityGuard)
export class ArenaWeekController {
  constructor(@Inject(ArenaWeekStore) private readonly weeks: ArenaWeekStore) {}
  @Get()
  @Header('Cache-Control', 'private, no-store')
  list(@CurrentIdentity() user: IdentityPrincipal, @Query('arenaId') id?: string) {
    return this.weeks.list(user.id, z.uuid().optional().parse(id));
  }
  @Get(':arenaId/:id')
  @Header('Cache-Control', 'private, no-store')
  read(
    @CurrentIdentity() user: IdentityPrincipal,
    @Param('arenaId', new ParseUUIDPipe()) arena: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.weeks.read(user.id, arena, id);
  }
  @Post(':arenaId/:id/revisions')
  revise(
    @CurrentIdentity() user: IdentityPrincipal,
    @Param('arenaId', new ParseUUIDPipe()) arena: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.weeks.revise(user.id, arena, id);
  }
}
