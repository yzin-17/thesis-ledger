import { Module } from '@nestjs/common';
import { HealthController } from './platform/health.controller.js';
import { HealthService } from './platform/health.service.js';
import { PrismaService } from './platform/prisma.service.js';
import { RedisService } from './platform/redis.service.js';
import { DsaClient } from './market/dsa-client.js';
import { MarketService } from './market/market.service.js';
import { MarketController } from './market/market.controller.js';
import { AccountsController } from './portfolio/accounts.controller.js';
import { AccountsService } from './portfolio/accounts.service.js';
import { PortfolioController } from './portfolio/portfolio.controller.js';
import { PortfolioService } from './portfolio/portfolio.service.js';
import { ImportService } from './imports/import.service.js';
import { ImportController } from './imports/import.controller.js';
import { NotificationService } from './notifications/notification.service.js';
import { NotificationDispatcher } from './notifications/notification.dispatcher.js';
import { LedgerService } from './ledger/ledger.service.js';
import { BacktestService } from './backtest/backtest.service.js';
import { AiRunService } from './ai/ai.service.js';
import { AutomationService } from './automation/automation.service.js';
import { AutomationScheduler } from './automation/automation.scheduler.js';
import { AutomationRuntimeHandlers } from './automation/automation-runtime.service.js';
import { RiskController } from './risk/risk.controller.js';
import { RiskService } from './risk/risk.service.js';
import { LedgerController } from './ledger/ledger.controller.js';
import { PerformanceController } from './performance/performance.controller.js';
import { PerformanceService } from './performance/performance.service.js';
import { BacktestController } from './backtest/backtest.controller.js';
import { JournalController } from './journal/journal.controller.js';
import { JournalService } from './journal/journal.service.js';
import { AiController } from './ai/ai.controller.js';
import { AutomationController } from './automation/automation.controller.js';
import { IntegrityController } from './integrity/integrity.controller.js';
import { IntegrityService } from './integrity/integrity.service.js';
import { NotificationController } from './notifications/notification.controller.js';
import { ProviderHealthController } from './providers/provider-health.controller.js';
import { ProviderHealthService } from './providers/provider-health.service.js';
import { ProviderHealthScheduler } from './providers/provider-health.scheduler.js';
import { ProviderConfigController } from './providers/provider-config.controller.js';
import { ProviderConfigService } from './providers/provider-config.service.js';
import { DataQualityController } from './quality/data-quality.controller.js';
import { DataQualityService } from './quality/data-quality.service.js';
import { MarketStorageService } from './market/market-storage.service.js';
import { AutomationWorkflowRunner } from './automation/workflow-runner.service.js';
import { DataExportController } from './platform/data-export.controller.js';
import { DataExportService } from './platform/data-export.service.js';
import { MetricsController } from './platform/metrics.controller.js';
import { MetricsService } from './platform/metrics.service.js';
import { ErrorTrackingService } from './platform/error-tracking.service.js';
import { MarketDataController } from './market/market-data.controller.js';
import { InstrumentService } from './market/instrument.service.js';
import { MarketControlService } from './market/market-control.service.js';

@Module({
  controllers: [
    HealthController,
    MarketController,
    AccountsController,
    PortfolioController,
    RiskController,
    ImportController,
    LedgerController,
    PerformanceController,
    BacktestController,
    JournalController,
    AiController,
    AutomationController,
    IntegrityController,
    NotificationController,
    ProviderHealthController,
    ProviderConfigController,
    DataExportController,
    MetricsController,
    DataQualityController,
    MarketDataController,
  ],
  providers: [
    PrismaService,
    RedisService,
    DsaClient,
    MarketService,
    HealthService,
    AccountsService,
    PortfolioService,
    ImportService,
    NotificationService,
    NotificationDispatcher,
    LedgerService,
    BacktestService,
    AiRunService,
    AutomationService,
    AutomationScheduler,
    AutomationRuntimeHandlers,
    RiskService,
    PerformanceService,
    JournalService,
    IntegrityService,
    ProviderHealthService,
    ProviderHealthScheduler,
    ProviderConfigService,
    DataQualityService,
    MarketStorageService,
    AutomationWorkflowRunner,
    DataExportService,
    MetricsService,
    ErrorTrackingService,
    InstrumentService,
    MarketControlService,
  ],
})
export class AppModule {}
