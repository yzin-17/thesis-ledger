import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  behaviorInputSchema,
  completedTradeSchema,
  counterfactualInputSchema,
  journalEntryInputSchema,
  journalEntryUpdateSchema,
  plannedStopInputSchema,
  reviewWindowInputSchema,
  tradePlanInputSchema,
} from '@thesis-ledger/schemas';
import { JournalService } from './journal.service.js';

@Controller('journal')
export class JournalController {
  constructor(private readonly journal: JournalService) {}

  @Post('entries')
  createEntry(@Body() input: unknown) {
    return this.journal.createEntry(journalEntryInputSchema.parse(input));
  }

  @Get('entries')
  listEntries(@Query('symbol') symbol?: string, @Query('accountId') accountId?: string) {
    return this.journal.listEntries(symbol, accountId);
  }

  @Patch('entries/:id')
  updateEntry(@Param('id') id: string, @Body() input: unknown) {
    return this.journal.updateEntry(id, journalEntryUpdateSchema.parse(input));
  }

  @Post('plans')
  createPlan(@Body() input: unknown) {
    return this.journal.createPlan(tradePlanInputSchema.parse(input));
  }

  @Get('plans')
  listPlans(@Query('symbol') symbol?: string, @Query('accountId') accountId?: string) {
    return this.journal.listPlans(symbol, accountId);
  }

  @Post('analysis/planned-vs-actual')
  plannedVsActual(@Body() input: unknown) {
    return this.journal.plannedVsActual(completedTradeSchema.parse(input));
  }

  @Post('analysis/planned-stop')
  plannedStop(@Body() input: unknown) {
    const body = plannedStopInputSchema.parse(input);
    return this.journal.plannedStopReview(body.fact, body.actualPnl);
  }

  @Post('analysis/counterfactual')
  counterfactual(@Body() input: unknown) {
    return this.journal.counterfactual(counterfactualInputSchema.parse(input));
  }

  @Post('analysis/review')
  review(@Body() input: unknown) {
    return this.journal.review(reviewWindowInputSchema.parse(input));
  }

  @Post('analysis/behavior')
  behavior(@Body() input: unknown) {
    const body = behaviorInputSchema.parse(input);
    return this.journal.behavior(body);
  }

  @Get('entries/export')
  exportEntries(@Query('symbol') symbol?: string, @Query('accountId') accountId?: string) {
    return this.journal.exportEntries(symbol, accountId);
  }
}
