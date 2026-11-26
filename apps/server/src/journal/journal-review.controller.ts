import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { IdentityPrincipal } from '@thesis-ledger/schemas';
import { CurrentIdentity, IdentityGuard } from '../identity/identity.guard.js';
import {
  journalReviewListContractSchema,
  journalSnapshotHistoryResponseSchema,
} from '@thesis-ledger/schemas';
import { InstrumentDirectoryService } from '../market/instruments/instrument-directory.service.js';
import { JournalReviewQuery } from './journal-review-query.js';
import { JournalReviewAnalysis } from './journal-review-analysis.js';
import { JournalReviewSnapshots } from './journal-review-snapshots.js';
import { JournalReviewAi } from './journal-review-ai.js';
import { JournalPeriodReviewAi } from './journal-period-review-ai.js';
import { JournalPeriodReviewSnapshots } from './journal-period-review-snapshots.js';

@Controller('journal')
export class JournalReviewController {
  constructor(
    private readonly candidates: JournalReviewQuery,
    private readonly analysis: JournalReviewAnalysis,
    private readonly snapshots: JournalReviewSnapshots,
    private readonly directory: InstrumentDirectoryService,
    private readonly ai: JournalReviewAi,
    private readonly periodAi: JournalPeriodReviewAi,
    private readonly periodSnapshots: JournalPeriodReviewSnapshots,
  ) {}

  @Get('review-candidates')
  async list(@Query() query: Record<string, string | undefined>) {
    const page = await this.candidates.list(query);
    const symbols = [
      ...page.items.map((row) => row.input.trade.symbol),
      ...page.unlinkedItems.flatMap((row) =>
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
  @UseGuards(IdentityGuard)
  save(@Body() input: unknown, @CurrentIdentity() principal: IdentityPrincipal) {
    return this.snapshots.save(input, principal);
  }

  @Post('period-snapshots')
  @UseGuards(IdentityGuard)
  savePeriod(@Body() input: unknown, @CurrentIdentity() principal: IdentityPrincipal) {
    return this.periodSnapshots.save(input, principal);
  }

  @Get('period-snapshots')
  @UseGuards(IdentityGuard)
  periodHistory(@Query() query: Record<string, string | undefined>) {
    return this.periodSnapshots.list(query);
  }

  @Get('period-snapshots/:id')
  @UseGuards(IdentityGuard)
  periodSnapshot(@Param('id') id: string, @Query() query: Record<string, string | undefined>) {
    return this.periodSnapshots.get(id, query);
  }

  @Post('explanations')
  @UseGuards(IdentityGuard)
  explain(@Body() input: unknown, @CurrentIdentity() principal: IdentityPrincipal) {
    return this.ai.start(input, principal);
  }

  @Post('period-explanations')
  @UseGuards(IdentityGuard)
  explainPeriod(@Body() input: unknown, @CurrentIdentity() principal: IdentityPrincipal) {
    return this.periodAi.start(input, principal);
  }

  @Get('period-explanations/:id')
  @UseGuards(IdentityGuard)
  periodExplanation(
    @Param('id') id: string,
    @Query() query: Record<string, string | undefined>,
    @CurrentIdentity() principal: IdentityPrincipal,
  ) {
    return this.periodAi.get(id, query, principal);
  }

  @Get('explanations/:id')
  @UseGuards(IdentityGuard)
  explanation(
    @Param('id') id: string,
    @Query() query: Record<string, string | undefined>,
    @CurrentIdentity() principal: IdentityPrincipal,
  ) {
    return this.ai.get(id, query, principal);
  }

  @Get('review-snapshots')
  async history(@Query() query: Record<string, string | undefined>) {
    const page = await this.snapshots.list(query);
    const symbols = page.items.flatMap((item) =>
      item.compatibility === 'CURRENT_CONTRACT' ? [item.snapshot.inputSnapshot.trade.symbol] : [],
    );
    return journalSnapshotHistoryResponseSchema.parse({
      ...page,
      instrumentDirectory: await this.directory.resolveSymbols(symbols),
    });
  }

  @Get('review-snapshots/:id')
  snapshot(@Param('id') id: string, @Query() query: Record<string, string | undefined>) {
    return this.snapshots.get(id, query);
  }
}
