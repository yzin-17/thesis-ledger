import { Module } from '@nestjs/common';
import { LedgerModule } from '../ledger/ledger.module.js';
import { MarketModule } from '../market/market.module.js';
import { JournalController } from './journal.controller.js';
import { JournalService } from './journal.service.js';
import { JournalReviewController } from './journal-review.controller.js';
import { JournalReviewQuery } from './journal-review-query.js';
import { JournalReviewAnalysis } from './journal-review-analysis.js';
import { JournalReviewSnapshots } from './journal-review-snapshots.js';
import { AiModule } from '../ai/ai.module.js';
import { JournalReviewAi } from './journal-review-ai.js';
import { JournalPeriodReviewAi } from './journal-period-review-ai.js';
import { JournalLegacyAnalysis } from './journal-legacy-analysis.js';
import { JournalLegacyAnalysisController } from './journal-legacy-analysis.controller.js';

@Module({
  imports: [LedgerModule, MarketModule, AiModule],
  controllers: [JournalController, JournalReviewController, JournalLegacyAnalysisController],
  providers: [
    JournalService,
    JournalLegacyAnalysis,
    JournalReviewQuery,
    JournalReviewAnalysis,
    JournalReviewSnapshots,
    JournalReviewAi,
    JournalPeriodReviewAi,
  ],
  exports: [JournalService],
})
export class JournalModule {}
