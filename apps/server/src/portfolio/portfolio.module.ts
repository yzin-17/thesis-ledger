import { Module } from '@nestjs/common';
import { LedgerModule } from '../ledger/ledger.module.js';
import { MarketModule } from '../market/market.module.js';
import { AccountsController } from './accounts.controller.js';
import { AccountsService } from './accounts.service.js';
import { PortfolioController } from './portfolio.controller.js';
import { PortfolioService } from './portfolio.service.js';
import { TradeController } from './trade.controller.js';

@Module({
  imports: [MarketModule, LedgerModule],
  controllers: [AccountsController, PortfolioController, TradeController],
  providers: [AccountsService, PortfolioService],
  exports: [AccountsService, PortfolioService],
})
export class PortfolioModule {}
