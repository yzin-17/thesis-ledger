import { Module } from '@nestjs/common';
import { LedgerModule } from '../ledger/ledger.module.js';
import { MarketModule } from '../market/market.module.js';
import { JournalController } from './journal.controller.js';
import { JournalService } from './journal.service.js';

@Module({
  imports: [LedgerModule, MarketModule],
  controllers: [JournalController],
  providers: [JournalService],
  exports: [JournalService],
})
export class JournalModule {}
