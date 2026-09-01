import { Module } from '@nestjs/common';
import { AiModule } from './ai/ai.module.js';
import { AutomationModule } from './automation/automation.module.js';
import { BacktestModule } from './backtest/backtest.module.js';
import { RecurringCashDepositModule } from './cash-plans/recurring-cash-deposit.module.js';
import { ImportModule } from './imports/import.module.js';
import { JournalModule } from './journal/journal.module.js';
import { LedgerModule } from './ledger/ledger.module.js';
import { MarketModule } from './market/market.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { PerformanceModule } from './performance/performance.module.js';
import { PlatformModule } from './platform/platform.module.js';
import { PortfolioModule } from './portfolio/portfolio.module.js';
import { ProviderModule } from './providers/provider.module.js';
import { QualityModule } from './quality/quality.module.js';
import { RiskModule } from './risk/risk.module.js';

@Module({
  imports: [
    PlatformModule,
    QualityModule,
    LedgerModule,
    MarketModule,
    PortfolioModule,
    ImportModule,
    ProviderModule,
    NotificationsModule,
    RiskModule,
    PerformanceModule,
    BacktestModule,
    RecurringCashDepositModule,
    JournalModule,
    AiModule,
    AutomationModule,
  ],
})
export class AppModule {}
