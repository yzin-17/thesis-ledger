import { Module } from '@nestjs/common';
import { MarketModule } from '../market/market.module.js';
import { LedgerController } from './ledger.controller.js';
import { CashLedgerCommandService } from './cash-ledger-command.service.js';
import { BaselineImportService } from './baseline-import.service.js';
import { BaselineReconciliationService } from './baseline-reconciliation.service.js';
import { LedgerCommandService } from './ledger-command.service.js';
import { LedgerQueryService } from './ledger-query.service.js';
import { LedgerV2Repository } from './ledger-v2.repository.js';
import { LedgerService } from './ledger.service.js';
import { TradeQueryService } from './trade-query.service.js';
import { TradeChartQueryService } from './trade-chart-query.service.js';
import { TradeInstrumentQueryService } from './trade-instrument-query.service.js';
import { TradeRealizedPnlHistoryService } from './trade-realized-pnl-history.service.js';
import { TradeOpeningBoundaryCommandService } from './trade-opening-boundary-command.service.js';

@Module({
  imports: [MarketModule],
  controllers: [LedgerController],
  providers: [
    LedgerService,
    LedgerV2Repository,
    LedgerCommandService,
    CashLedgerCommandService,
    LedgerQueryService,
    TradeQueryService,
    TradeChartQueryService,
    TradeInstrumentQueryService,
    TradeRealizedPnlHistoryService,
    TradeOpeningBoundaryCommandService,
    BaselineImportService,
    BaselineReconciliationService,
  ],
  exports: [
    LedgerService,
    LedgerV2Repository,
    LedgerCommandService,
    CashLedgerCommandService,
    LedgerQueryService,
    TradeQueryService,
    TradeChartQueryService,
    TradeInstrumentQueryService,
    TradeRealizedPnlHistoryService,
    TradeOpeningBoundaryCommandService,
    BaselineImportService,
    BaselineReconciliationService,
  ],
})
export class LedgerModule {}
