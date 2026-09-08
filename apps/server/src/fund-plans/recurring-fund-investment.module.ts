import { Module } from '@nestjs/common';
import { LedgerModule } from '../ledger/ledger.module.js';
import {
  RecurringFundInvestmentOccurrenceController,
  RecurringFundInvestmentPlanController,
} from './recurring-fund-investment.controller.js';
import { RecurringFundInvestmentService } from './recurring-fund-investment.service.js';

@Module({
  imports: [LedgerModule],
  controllers: [RecurringFundInvestmentPlanController, RecurringFundInvestmentOccurrenceController],
  providers: [RecurringFundInvestmentService],
  exports: [RecurringFundInvestmentService],
})
export class RecurringFundInvestmentModule {}
