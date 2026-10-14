import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import type { IdentityPrincipal } from '@thesis-ledger/schemas';
import { CurrentIdentity, IdentityGuard } from '../identity/identity.guard.js';
import { AuthoringSaveService } from './authoring-save.service.js';
import { AuthoringProvenanceRepository } from './authoring-provenance.repository.js';

@Controller('strategy-authoring')
@UseGuards(IdentityGuard)
export class AuthoringSaveController {
  constructor(
    private readonly saves: AuthoringSaveService,
    private readonly sources: AuthoringProvenanceRepository,
  ) {}
  @Get('drafts/:id/review')
  review(@CurrentIdentity() user: IdentityPrincipal, @Param('id') id: string) {
    return this.saves.review(user.id, id);
  }
  @Post('drafts/:id/save')
  save(@CurrentIdentity() user: IdentityPrincipal, @Param('id') id: string, @Body() raw: unknown) {
    return this.saves.save(user.id, id, raw);
  }
  @Get('versions/:id/source')
  source(@CurrentIdentity() user: IdentityPrincipal, @Param('id') id: string) {
    return this.sources.readSource(user.id, id);
  }
}
