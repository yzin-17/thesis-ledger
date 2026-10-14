import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import type { IdentityPrincipal } from '@thesis-ledger/schemas';
import { CurrentIdentity, IdentityGuard } from '../identity/identity.guard.js';
import { AuthoringOperationHistoryRepository } from './authoring-operation-history.repository.js';

@Controller('strategy-authoring')
@UseGuards(IdentityGuard)
export class AuthoringOperationHistoryController {
  constructor(private readonly history: AuthoringOperationHistoryRepository) {}
  @Get('drafts/:id/operations')
  list(@CurrentIdentity() user: IdentityPrincipal, @Param('id') id: string) {
    return this.history.list(user.id, id);
  }
  @Post('operations/:id/discard')
  discard(
    @CurrentIdentity() user: IdentityPrincipal,
    @Param('id') id: string,
    @Body() raw: unknown,
  ) {
    return this.history.discard(user.id, id, raw);
  }
}
