import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { LedgerService } from './ledger.service.js';

const migratePositionsHttpSchema = z.object({ accountId: z.uuid().optional() });
const rebuildMethodSchema = z.enum(['AVG', 'FIFO']).optional();

@Controller('ledger')
export class LedgerController {
  constructor(private readonly ledger: LedgerService) {}

  @Post('events')
  append(@Body() event: unknown) {
    return this.ledger.append(event);
  }

  @Post(':accountId/rebuild')
  rebuild(@Param('accountId') accountId: string, @Query('method') method?: string) {
    return this.ledger.rebuild(accountId, rebuildMethodSchema.parse(method));
  }

  @Post('migrate-positions')
  migratePositions(@Body() input: unknown) {
    return this.ledger.migratePositions(migratePositionsHttpSchema.parse(input).accountId);
  }

  @Get(':accountId/events')
  events(@Param('accountId') accountId: string) {
    return this.ledger.list(accountId);
  }
}
