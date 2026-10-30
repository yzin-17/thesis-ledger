import { Controller, Get, Header, Inject, Param, Query, UseGuards } from '@nestjs/common';
import type { IdentityPrincipal } from '@thesis-ledger/schemas';
import { IdentityGuard, CurrentIdentity } from '../identity/identity.guard.js';
import { AiResearchReportsQuery } from '../ai/ai-research-reports.query.js';
import { ResearchScopeReader } from './research-scope-reader.js';
import { compareResearchReports } from './research-report-comparison.js';

@Controller('research/reports')
@UseGuards(IdentityGuard)
export class ResearchReportsController {
  constructor(
    @Inject(AiResearchReportsQuery) private readonly reports: AiResearchReportsQuery,
    @Inject(ResearchScopeReader) private readonly access: ResearchScopeReader,
  ) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  list(@CurrentIdentity() principal: IdentityPrincipal, @Query() query: unknown) {
    return this.reports.list(principal.id, query, this.access);
  }
  @Get(':id/comparison')
  @Header('Cache-Control', 'no-store')
  async comparison(
    @CurrentIdentity() principal: IdentityPrincipal,
    @Param('id') id: string,
    @Query() query: unknown,
  ) {
    return compareResearchReports(
      await this.reports.comparisonInputs(principal.id, id, query, this.access),
    );
  }
  @Get(':id/evidence/:referenceId')
  @Header('Cache-Control', 'no-store')
  evidence(
    @CurrentIdentity() principal: IdentityPrincipal,
    @Param('id') id: string,
    @Param('referenceId') referenceId: string,
    @Query() query: unknown,
  ) {
    return this.reports.evidence(principal.id, id, referenceId, query, this.access);
  }
  @Get(':id/tool-calls')
  @Header('Cache-Control', 'no-store')
  tools(
    @CurrentIdentity() principal: IdentityPrincipal,
    @Param('id') id: string,
    @Query() query: unknown,
  ) {
    return this.reports.tools(principal.id, id, query, this.access);
  }
  @Get(':id')
  @Header('Cache-Control', 'no-store')
  detail(
    @CurrentIdentity() principal: IdentityPrincipal,
    @Param('id') id: string,
    @Query() query: unknown,
  ) {
    return this.reports.detail(principal.id, id, query, this.access);
  }
}
