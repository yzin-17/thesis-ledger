import { Module } from '@nestjs/common';
import { LedgerModule } from '../ledger/ledger.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import {
  RecurringCashDepositOccurrenceController,
  RecurringCashDepositPlanController,
} from './recurring-cash-deposit.controller.js';
import { RecurringCashDepositService } from './recurring-cash-deposit.service.js';

@Module({
  imports: [LedgerModule, NotificationsModule],
  controllers: [RecurringCashDepositPlanController, RecurringCashDepositOccurrenceController],
  providers: [RecurringCashDepositService],
  exports: [RecurringCashDepositService],
})
export class RecurringCashDepositModule {}
