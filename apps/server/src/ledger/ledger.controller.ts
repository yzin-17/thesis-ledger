import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { LedgerService } from './ledger.service.js';

@Controller('ledger')
export class LedgerController {
  constructor(private readonly ledger: LedgerService) {}

  @Post('events')
  append(@Body() event: unknown) {
    return this.ledger.append(event);
  }

  @Post(':accountId/rebuild')
  rebuild(@Param('accountId') accountId: string, @Query('method') method?: 'AVG' | 'FIFO') {
    return this.ledger.rebuild(accountId, method);
  }

  @Post('migrate-positions')
  migratePositions(@Body() body: { accountId?: string }) {
    return this.ledger.migratePositions(body.accountId);
  }

  @Get(':accountId/events')
  events(@Param('accountId') accountId: string) {
    return this.ledger.list(accountId);
  }
}
