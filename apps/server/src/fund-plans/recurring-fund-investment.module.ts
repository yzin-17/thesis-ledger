import { MarketModule } from '../market/market.module.js';
import { Module } from '@nestjs/common';
import { LedgerModule } from '../ledger/ledger.module.js';
import {
  RecurringFundInvestmentOccurrenceController,
  RecurringFundInvestmentPlanController,
} from './recurring-fund-investment.controller.js';
import { RecurringFundInvestmentService } from './recurring-fund-investment.service.js';

@Module({
  imports: [LedgerModule, MarketModule],
  controllers: [RecurringFundInvestmentPlanController, RecurringFundInvestmentOccurrenceController],
  providers: [RecurringFundInvestmentService],
  exports: [RecurringFundInvestmentService],
})
export class RecurringFundInvestmentModule {}
