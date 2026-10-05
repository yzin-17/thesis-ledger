import { Body, Controller, Post } from '@nestjs/common';
import {
  behaviorInputSchema,
  completedTradeSchema,
  counterfactualInputSchema,
  omitUndefinedDeep,
  plannedStopInputSchema,
  reviewWindowInputSchema,
} from '@thesis-ledger/schemas';
import { JournalLegacyAnalysis } from './journal-legacy-analysis.js';

@Controller('journal/analysis')
export class JournalLegacyAnalysisController {
  constructor(private readonly legacy: JournalLegacyAnalysis) {}
  @Post('planned-vs-actual')
  plannedVsActual(@Body() raw: unknown) {
    return this.legacy.plannedVsActual(omitUndefinedDeep(completedTradeSchema.parse(raw)));
  }
  @Post('planned-stop')
  plannedStop(@Body() raw: unknown) {
    const input = omitUndefinedDeep(plannedStopInputSchema.parse(raw));
    return this.legacy.plannedStopReview(input.fact, input.actualPnl);
  }
  @Post('counterfactual')
  counterfactual(@Body() raw: unknown) {
    return this.legacy.counterfactual(omitUndefinedDeep(counterfactualInputSchema.parse(raw)));
  }
  @Post('review')
  review(@Body() raw: unknown) {
    return this.legacy.review(omitUndefinedDeep(reviewWindowInputSchema.parse(raw)));
  }
  @Post('behavior')
  behavior(@Body() raw: unknown) {
    return this.legacy.behavior(omitUndefinedDeep(behaviorInputSchema.parse(raw)));
  }
}
