import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import type { IdentityPrincipal } from '@thesis-ledger/schemas';
import { CurrentIdentity, IdentityGuard } from '../identity/identity.guard.js';
import {
  AuthoringProposalService,
  authoringExpectedRevisionSchema,
} from './authoring-proposal.service.js';
import { AuthoringProvenanceRepository } from './authoring-provenance.repository.js';

@Controller('strategy-authoring')
@UseGuards(IdentityGuard)
export class AuthoringProposalController {
  constructor(
    private readonly proposals: AuthoringProposalService,
    private readonly sources: AuthoringProvenanceRepository,
  ) {}
  @Post('operations/:id/proposal')
  prepare(
    @CurrentIdentity() user: IdentityPrincipal,
    @Param('id') id: string,
    @Body() raw: unknown,
  ) {
    return this.proposals.prepare(user.id, id, raw);
  }
  @Get('proposals/:id')
  read(@CurrentIdentity() user: IdentityPrincipal, @Param('id') id: string) {
    return this.sources.readProposal(user.id, id);
  }
  @Post('proposals/:id/apply')
  apply(@CurrentIdentity() user: IdentityPrincipal, @Param('id') id: string, @Body() raw: unknown) {
    return this.proposals.apply(user.id, id, raw);
  }
  @Post('proposals/:id/discard')
  async discard(
    @CurrentIdentity() user: IdentityPrincipal,
    @Param('id') id: string,
    @Body() raw: unknown,
  ) {
    await this.sources.discardProposal(
      user.id,
      id,
      authoringExpectedRevisionSchema.parse(raw).expectedRevision,
    );
    return { id, status: 'discarded' };
  }
}
