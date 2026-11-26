import 'reflect-metadata';
import { expect, it, vi } from 'vitest';
import { NestFactory } from '@nestjs/core';
import { BacktestProcessorModule } from '../../src/backtest/backtest-processor.module.js';
import { BACKTEST_SNAPSHOT_BUILDER, BacktestRunService } from '../../src/backtest/backtest-run.service.js';
import { BacktestCreationGuardService } from '../../src/backtest/backtest-creation-guard.service.js';
import { BacktestKnownCashGuardV3 } from '../../src/backtest/backtest-known-cash-guard-v3.service.js';
import { DsaSnapshotBuilder } from '../../src/backtest/backtest-snapshot-builder.js';
import { CatalogReadinessService } from '../../src/market/catalog-readiness.service.js';
import { FundDailyErrorService } from '../../src/market/fund-daily-error.service.js';
import { BacktestService } from '../../src/backtest/backtest.service.js';
import { BacktestQueueService } from '../../src/backtest/backtest-queue.service.js';
import { BacktestEventPublisher } from '../../src/backtest/backtest-event.publisher.js';
import { PrismaService } from '../../src/platform/prisma.service.js';
import { RedisService } from '../../src/platform/redis.service.js';
import { ResultReadPolicyService } from '../../src/platform/result-read-policy.service.js';
import { DsaClient } from '../../src/integration/dsa/dsa.client.js';
import { LocalSnapshotStore } from '../../src/backtest/backtest-snapshot.js';
import { MarketControlService } from '../../src/market/market-control.service.js';
import { MarketBarWindowReaderV3 } from '../../src/market/market-bar-reader-v3.js';
import { MarketWindowEvidenceV3Repository } from '../../src/market/market-window-evidence-v3.repository.js';
import { MarketFrozenWindowReaderV3 } from '../../src/market/market-frozen-window-reader-v3.js';
import { MarketChartReaderV3 } from '../../src/market/market-chart-reader-v3.js';
import { MarketChartProofRepository } from '../../src/market/market-chart-proof.repository.js';
import { MarketChartResultCache } from '../../src/market/market-chart-result-cache.js';
import { MarketPeriodCalendarReader } from '../../src/market/market-period-calendar-reader.js';
import { MarketSessionReader } from '../../src/market/market-session-reader.js';
import { DataQualityService } from '../../src/quality/data-quality.service.js';
import { IntegrityService } from '../../src/integrity/integrity.service.js';

vi.mock('../../src/platform/platform.module.js', async () => {
  const { Global, Module } = await import('@nestjs/common');
  const { PrismaService } = await import('../../src/platform/prisma.service.js');
  const { RedisService } = await import('../../src/platform/redis.service.js');
  const { ResultReadPolicyService } = await import('../../src/platform/result-read-policy.service.js');
  class OfflinePlatformModule {}
  Global()(OfflinePlatformModule);
  Module({ providers: [{ provide: PrismaService, useValue: {} }, { provide: RedisService, useValue: {} },
    { provide: ResultReadPolicyService, useValue: {} }],
    exports: [PrismaService, RedisService, ResultReadPolicyService] })(OfflinePlatformModule);
  return { PlatformModule: OfflinePlatformModule };
});
vi.mock('../../src/integration/dsa/dsa.module.js', async () => {
  const { Module } = await import('@nestjs/common');
  const { DsaClient } = await import('../../src/integration/dsa/dsa.client.js');
  class OfflineDsaModule {}
  Module({ providers: [{ provide: DsaClient, useValue: {} }], exports: [DsaClient] })(OfflineDsaModule);
  return { DsaModule: OfflineDsaModule };
});

it('独立Worker实际解析准备守卫与构建器，不装配行情后台生命周期', async () => {
  // Vitest的esbuild不发射tsc生产构建中的design:paramtypes，在此恢复构造器类型元数据。
  const metadata: Array<[object, object[]]> = [
    [BacktestService, [PrismaService, BacktestQueueService, BacktestRunService, ResultReadPolicyService]],
    [BacktestEventPublisher, [PrismaService, RedisService, ResultReadPolicyService]],
    [DsaSnapshotBuilder, [DsaClient, LocalSnapshotStore]],
    [MarketControlService, [PrismaService, DsaClient]],
    [MarketBarWindowReaderV3, [MarketControlService, DsaClient, MarketWindowEvidenceV3Repository, MarketFrozenWindowReaderV3, DataQualityService]],
    [MarketChartReaderV3, [MarketControlService, DsaClient, MarketChartProofRepository, DataQualityService, MarketChartResultCache]],
    [MarketChartResultCache, [DsaClient, RedisService, MarketSessionReader]],
    [MarketPeriodCalendarReader, [DsaClient, DataQualityService]],
    [DataQualityService, [PrismaService]], [IntegrityService, [PrismaService]],
  ];
  for (const [target, types] of metadata) Reflect.defineMetadata('design:paramtypes', types, target);
  const context = await NestFactory.createApplicationContext(BacktestProcessorModule, { logger: false, abortOnError: false });
  try {
    expect(context.get(BACKTEST_SNAPSHOT_BUILDER)).toBeInstanceOf(DsaSnapshotBuilder);
    expect(context.get(BacktestRunService)).toBeInstanceOf(BacktestRunService);
    expect(context.get(BacktestCreationGuardService)).toBeInstanceOf(BacktestCreationGuardService);
    expect(context.get(BacktestKnownCashGuardV3)).toBeInstanceOf(BacktestKnownCashGuardV3);
    expect(() => context.get(CatalogReadinessService)).toThrow();
    expect(() => context.get(FundDailyErrorService)).toThrow();
  } finally { await context.close(); }
});
