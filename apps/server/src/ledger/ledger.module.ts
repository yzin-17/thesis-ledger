import { Module } from '@nestjs/common';
import { LedgerController } from './ledger.controller.js';
import { BaselineImportService } from './baseline-import.service.js';
import { BaselineReconciliationService } from './baseline-reconciliation.service.js';
import { LedgerCommandService } from './ledger-command.service.js';
import { LedgerQueryService } from './ledger-query.service.js';
import { LedgerV2Repository } from './ledger-v2.repository.js';
import { LedgerService } from './ledger.service.js';
import { TradeQueryService } from './trade-query.service.js';

@Module({
  controllers: [LedgerController],
  providers: [
    LedgerService,
    LedgerV2Repository,
    LedgerCommandService,
    LedgerQueryService,
    TradeQueryService,
    BaselineImportService,
    BaselineReconciliationService,
  ],
  exports: [
    LedgerService,
    LedgerV2Repository,
    LedgerCommandService,
    LedgerQueryService,
    TradeQueryService,
    BaselineImportService,
    BaselineReconciliationService,
  ],
})
export class LedgerModule {}
