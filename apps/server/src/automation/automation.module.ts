import { Module } from '@nestjs/common';
import { RecurringCashDepositModule } from '../cash-plans/recurring-cash-deposit.module.js';
import { MarketModule } from '../market/market.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PerformanceModule } from '../performance/performance.module.js';
import { ProviderModule } from '../providers/provider.module.js';
import { PortfolioModule } from '../portfolio/portfolio.module.js';
import { RiskModule } from '../risk/risk.module.js';
import { AutomationRuntimeHandlers } from './automation-runtime.service.js';
import { AutomationController } from './automation.controller.js';
import { AutomationScheduler } from './automation.scheduler.js';
import { AutomationService } from './automation.service.js';
import { AutomationWorkflowRunner } from './workflow-runner.service.js';

@Module({
  imports: [
    MarketModule,
    NotificationsModule,
    PerformanceModule,
    RiskModule,
    ProviderModule,
    PortfolioModule,
    RecurringCashDepositModule,
  ],
  controllers: [AutomationController],
  providers: [
    AutomationService,
    AutomationScheduler,
    AutomationRuntimeHandlers,
    AutomationWorkflowRunner,
  ],
  exports: [AutomationService, AutomationWorkflowRunner],
})
export class AutomationModule {}
