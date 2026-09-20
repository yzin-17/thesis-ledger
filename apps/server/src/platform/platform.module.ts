import { Global, Module } from '@nestjs/common';
import { DataExportController } from './data-export.controller.js';
import { DataExportService } from './data-export.service.js';
import { ErrorTrackingService } from './error-tracking.service.js';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';
import { MetricsController } from './metrics.controller.js';
import { MetricsService } from './metrics.service.js';
import { PrismaService } from './prisma.service.js';
import { RedisService } from './redis.service.js';
import { MarketDataCleanupService } from './market-data-cleanup.js';
import { DsaModule } from '../integration/dsa/dsa.module.js';
import { ResultReadPolicyService } from './result-read-policy.service.js';

@Global()
@Module({
  imports: [DsaModule],
  controllers: [HealthController, DataExportController, MetricsController],
  providers: [
    PrismaService,
    RedisService,
    HealthService,
    DataExportService,
    MetricsService,
    ErrorTrackingService,
    MarketDataCleanupService,
    ResultReadPolicyService,
  ],
  exports: [
    PrismaService,
    RedisService,
    DataExportService,
    MetricsService,
    ErrorTrackingService,
    ResultReadPolicyService,
  ],
})
export class PlatformModule {}
