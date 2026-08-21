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

@Global()
@Module({
  controllers: [HealthController, DataExportController, MetricsController],
  providers: [
    PrismaService,
    RedisService,
    HealthService,
    DataExportService,
    MetricsService,
    ErrorTrackingService,
  ],
  exports: [PrismaService, RedisService, DataExportService, MetricsService, ErrorTrackingService],
})
export class PlatformModule {}
