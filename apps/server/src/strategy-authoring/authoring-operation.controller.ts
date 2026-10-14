import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import type { IdentityPrincipal } from '@thesis-ledger/schemas';
import { CurrentIdentity, IdentityGuard } from '../identity/identity.guard.js';
import { AiInvocationStore } from '../ai/ai-invocation.store.js';
import { AuthoringOperationRepository } from './authoring-operation.repository.js';
import { AuthoringSubmitService } from './authoring-submit.service.js';
import { AuthoringAnalysisRepository } from './authoring-analysis.repository.js';
import { AuthoringResultRepository } from './authoring-result.repository.js';

@Controller('strategy-authoring')
@UseGuards(IdentityGuard)
export class AuthoringOperationController {
  constructor(
    private readonly operations: AuthoringOperationRepository,
    private readonly submissions: AuthoringSubmitService,
    private readonly audit: AiInvocationStore,
    private readonly analysis: AuthoringAnalysisRepository,
    private readonly results: AuthoringResultRepository,
  ) {}
  @Post('drafts/:id/operations')
  submit(
    @CurrentIdentity() user: IdentityPrincipal,
    @Param('id') id: string,
    @Body() raw: unknown,
  ) {
    return this.submissions.submit(user.id, id, raw);
  }
  @Get('operations/:id')
  async read(@CurrentIdentity() user: IdentityPrincipal, @Param('id') id: string) {
    const operation = await this.operations.read(user.id, id);
    return { ...operation, invocations: await this.audit.forReference(user.id, id) };
  }
  @Post('operations/:id/cancel')
  cancel(
    @CurrentIdentity() user: IdentityPrincipal,
    @Param('id') id: string,
    @Body() raw: unknown,
  ) {
    z.object({}).strict().parse(raw);
    return this.operations.cancel(user.id, id);
  }
  @Post('operations/:id/apply-analysis')
  applyAnalysis(
    @CurrentIdentity() user: IdentityPrincipal,
    @Param('id') id: string,
    @Body() raw: unknown,
  ) {
    return this.analysis.apply(user.id, id, raw);
  }
  @Post('operations/:id/apply-generation')
  applyGeneration(
    @CurrentIdentity() user: IdentityPrincipal,
    @Param('id') id: string,
    @Body() raw: unknown,
  ) {
    return this.results.applyGeneration(user.id, id, raw);
  }
}
