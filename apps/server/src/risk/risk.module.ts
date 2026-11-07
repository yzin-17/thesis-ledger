import { RiskMonitoringStatusController } from './risk-monitoring.controller.js';
import { RiskMonitoringService } from './risk-monitoring.service.js';
import { RiskMarketDemandService } from './risk-market-demand.service.js';
import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { MarketModule } from '../market/market.module.js';
import { RiskContextService } from './risk-context.service.js';
import { RiskController } from './risk.controller.js';
import { RiskEventService } from './risk-event.service.js';
import { RiskRuleService } from './risk-rule.service.js';
import { RiskService } from './risk.service.js';
import { RiskValuationContextService } from './risk-valuation-context.service.js';
import { StrategyRiskContextService } from './strategy-risk-context.service.js';
import { StrategyRiskRuntimeService } from './strategy-risk-runtime.service.js';

@Module({
  imports: [NotificationsModule, MarketModule],
  controllers: [RiskController, RiskMonitoringStatusController],
  providers: [
    RiskMarketDemandService,
    RiskMonitoringService,
    RiskRuleService,
    RiskContextService,
    RiskEventService,
    StrategyRiskContextService,
    StrategyRiskRuntimeService,
    RiskService,
    RiskValuationContextService,
  ],
  exports: [RiskService, StrategyRiskContextService, RiskValuationContextService],
})
export class RiskModule {}
