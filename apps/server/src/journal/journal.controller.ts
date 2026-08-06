import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import type {
  CompletedTrade,
  JournalEntry,
  RiskTriggerFact,
  TradePlan,
} from '@thesis-ledger/domain';
import { JournalService } from './journal.service.js';

@Controller('journal')
export class JournalController {
  constructor(private readonly journal: JournalService) {}

  @Post('entries')
  createEntry(@Body() input: Omit<JournalEntry, 'id' | 'createdAt'>) {
    return this.journal.createEntry(input);
  }

  @Get('entries')
  listEntries(@Query('symbol') symbol?: string, @Query('accountId') accountId?: string) {
    return this.journal.listEntries(symbol, accountId);
  }

  @Patch('entries/:id')
  updateEntry(
    @Param('id') id: string,
    @Body() input: Partial<Omit<JournalEntry, 'id' | 'createdAt'>>,
  ) {
    return this.journal.updateEntry(id, input);
  }

  @Post('plans')
  createPlan(@Body() input: Omit<TradePlan, 'id'>) {
    return this.journal.createPlan(input);
  }

  @Get('plans')
  listPlans(@Query('symbol') symbol?: string, @Query('accountId') accountId?: string) {
    return this.journal.listPlans(symbol, accountId);
  }

  @Post('analysis/planned-vs-actual')
  plannedVsActual(@Body() input: CompletedTrade) {
    return this.journal.plannedVsActual(input);
  }

  @Post('analysis/planned-stop')
  plannedStop(@Body() body: { fact: RiskTriggerFact; actualPnl?: number }) {
    return this.journal.plannedStopReview(body.fact, body.actualPnl);
  }

  @Post('analysis/counterfactual')
  counterfactual(
    @Body() body: { trades: CompletedTrade[]; enforceStop: boolean; stopPrice?: number },
  ) {
    return this.journal.counterfactual(body);
  }

  @Post('analysis/review')
  review(@Body() body: { trades: CompletedTrade[]; start: string; end: string }) {
    return this.journal.review(body);
  }

  @Post('analysis/behavior')
  behavior(@Body() body: { trades: CompletedTrade[] }) {
    return this.journal.behavior(body);
  }

  @Get('entries/export')
  exportEntries(@Query('symbol') symbol?: string, @Query('accountId') accountId?: string) {
    return this.journal.exportEntries(symbol, accountId);
  }
}
