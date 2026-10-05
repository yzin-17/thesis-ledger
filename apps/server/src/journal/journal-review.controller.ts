import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { journalReviewListContractSchema } from '@thesis-ledger/schemas';
import { InstrumentDirectoryService } from '../market/instruments/instrument-directory.service.js';
import { JournalReviewQuery } from './journal-review-query.js';
import { JournalReviewAnalysis } from './journal-review-analysis.js';
import { JournalReviewSnapshots } from './journal-review-snapshots.js';
import { JournalReviewAi } from './journal-review-ai.js';
import { JournalPeriodReviewAi } from './journal-period-review-ai.js';

@Controller('journal')
export class JournalReviewController {
  constructor(
    private readonly candidates: JournalReviewQuery,
    private readonly analysis: JournalReviewAnalysis,
    private readonly snapshots: JournalReviewSnapshots,
    private readonly directory: InstrumentDirectoryService,
    private readonly ai: JournalReviewAi,
    private readonly periodAi: JournalPeriodReviewAi,
  ) {}

  @Get('review-candidates')
  async list(@Query() query: Record<string, string | undefined>) {
    const page = await this.candidates.list(query);
    const symbols = [
      ...page.items.map((row) => row.input.trade.symbol),
      ...page.legacyItems.flatMap((row) =>
        row.journalEntry.symbol === null ? [] : [row.journalEntry.symbol],
      ),
    ];
    return journalReviewListContractSchema.parse({
      ...page,
      instrumentDirectory: await this.directory.resolveSymbols(symbols),
    });
  }

  @Get('review-objects/:reviewObjectId')
  object(
    @Param('reviewObjectId') reviewObjectId: string,
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.candidates.locate({ ...query, reviewObjectId });
  }

  @Get('review-object-reference')
  resolveReference(@Query() query: Record<string, string | undefined>) {
    return this.candidates.resolveReference(query);
  }

  @Post('analysis/object')
  analyze(@Body() input: unknown) {
    return this.analysis.analyze(input);
  }

  @Post('analysis/period')
  period(@Body() input: unknown) {
    return this.analysis.period(input);
  }

  @Post('review-snapshots')
  save(@Body() input: unknown) {
    return this.snapshots.save(input);
  }

  @Post('explanations')
  explain(@Body() input: unknown) {
    return this.ai.start(input);
  }

  @Post('period-explanations')
  explainPeriod(@Body() input: unknown) {
    return this.periodAi.start(input);
  }

  @Get('period-explanations/:id')
  periodExplanation(@Param('id') id: string, @Query() query: Record<string, string | undefined>) {
    return this.periodAi.get(id, query);
  }

  @Get('explanations/:id')
  explanation(@Param('id') id: string, @Query() query: Record<string, string | undefined>) {
    return this.ai.get(id, query);
  }

  @Get('review-snapshots')
  history(@Query() query: Record<string, string | undefined>) {
    return this.snapshots.list(query);
  }

  @Get('review-snapshots/:id')
  snapshot(@Param('id') id: string, @Query() query: Record<string, string | undefined>) {
    return this.snapshots.get(id, query);
  }
}
