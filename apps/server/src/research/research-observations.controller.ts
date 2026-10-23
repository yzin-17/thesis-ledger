import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { IdentityPrincipal } from '@thesis-ledger/schemas';
import { CurrentIdentity, IdentityGuard } from '../identity/identity.guard.js';
import { ResearchObservationService } from './research-observation.service.js';
import { ResearchObservationQueries } from './research-observation.queries.js';

@Controller('research/reports')
@UseGuards(IdentityGuard)
export class ResearchObservationsController {
  constructor(
    @Inject(ResearchObservationService) private readonly observations: ResearchObservationService,
    @Inject(ResearchObservationQueries) private readonly queries: ResearchObservationQueries,
  ) {}
  @Post(':id/observations')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  submit(
    @CurrentIdentity() principal: IdentityPrincipal,
    @Param('id') id: string,
    @Query() query: unknown,
    @Body() body: unknown,
  ) {
    return this.observations.submit(principal.id, id, query, body);
  }
  @Get(':id/observations')
  @Header('Cache-Control', 'no-store')
  read(
    @CurrentIdentity() principal: IdentityPrincipal,
    @Param('id') id: string,
    @Query() query: unknown,
  ) {
    return this.queries.read(principal.id, id, query);
  }
  @Get(':id/observations/:observationId/versions')
  @Header('Cache-Control', 'no-store')
  history(
    @CurrentIdentity() principal: IdentityPrincipal,
    @Param('id') id: string,
    @Param('observationId') observationId: string,
    @Query() query: unknown,
  ) {
    return this.queries.history(principal.id, id, observationId, query);
  }
}
