import { Body, Controller, Get, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { strategySubmissionInputSchema, type IdentityPrincipal } from '@thesis-ledger/schemas';
import { IdentityGuard, CurrentIdentity } from '../identity/identity.guard.js';
import { StrategySubmissions } from './strategy-submissions.js';

@Controller('strategy-submissions')
@UseGuards(IdentityGuard)
export class StrategySubmissionsController {
  constructor(@Inject(StrategySubmissions) private readonly service: StrategySubmissions) {}
  @Post() create(@CurrentIdentity() actor: IdentityPrincipal, @Body() raw: unknown) {
    const { id, input } = z
      .strictObject({ id: z.uuid(), input: strategySubmissionInputSchema })
      .parse(raw);
    return this.service.submit(actor.id, id, input);
  }
  @Get() list(@CurrentIdentity() actor: IdentityPrincipal) {
    return this.service.list(actor.id);
  }
  @Post(':id/confirm') confirm(
    @CurrentIdentity() actor: IdentityPrincipal,
    @Param('id') id: string,
  ) {
    return this.service.confirm(actor.id, z.uuid().parse(id));
  }
}
