import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  journalEntryInputSchema,
  journalEntryUpdateSchema,
  omitUndefinedDeep,
  tradePlanInputSchema,
} from '@thesis-ledger/schemas';
import { JournalService } from './journal.service.js';

@Controller('journal')
export class JournalController {
  constructor(private readonly journal: JournalService) {}

  @Post('entries')
  createEntry(@Body() input: unknown) {
    return this.journal.createEntry(omitUndefinedDeep(journalEntryInputSchema.parse(input)));
  }

  @Get('entries')
  listEntries(@Query('symbol') symbol?: string, @Query('accountId') accountId?: string) {
    return this.journal.listEntries(symbol, accountId);
  }

  @Patch('entries/:id')
  updateEntry(@Param('id') id: string, @Body() input: unknown) {
    return this.journal.updateEntry(id, omitUndefinedDeep(journalEntryUpdateSchema.parse(input)));
  }

  @Post('plans')
  createPlan(@Body() input: unknown) {
    return this.journal.createPlan(omitUndefinedDeep(tradePlanInputSchema.parse(input)));
  }

  @Get('plans')
  listPlans(@Query('symbol') symbol?: string, @Query('accountId') accountId?: string) {
    return this.journal.listPlans(symbol, accountId);
  }

  @Get('entries/export')
  exportEntries(@Query('symbol') symbol?: string, @Query('accountId') accountId?: string) {
    return this.journal.exportEntries(symbol, accountId);
  }
}
