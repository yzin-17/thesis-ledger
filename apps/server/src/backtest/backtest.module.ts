import { Module } from '@nestjs/common';
import { resolve } from 'node:path';
import { DsaModule } from '../integration/dsa/dsa.module.js';
import { MarketModule } from '../market/market.module.js';
import { PlatformModule } from '../platform/platform.module.js';
import { BacktestController } from './backtest.controller.js';
import { BacktestService } from './backtest.service.js';
import {
  BACKTEST_JOB_EVENTS,
  BACKTEST_QUEUE_TRANSPORT,
  BacktestQueueService,
} from './backtest-queue.service.js';
import { BacktestBullQueue } from './backtest-bull-queue.js';
import { BacktestEventService } from './backtest-event.service.js';
import { BacktestEventPublisher } from './backtest-event.publisher.js';
import { BacktestQueueReconciler } from './backtest-queue.reconciler.js';
import { DsaSnapshotBuilder } from './backtest-snapshot-builder.js';
import { LocalSnapshotStore } from './backtest-snapshot.js';
import { BACKTEST_SNAPSHOT_BUILDER, BacktestRunService } from './backtest-run.service.js';
import { BACKTEST_V3_RUNNER, LocalSnapshotV3Runner } from './backtest-v3-runner.js';
import { BacktestRunPreparationService } from './backtest-run-preparation.service.js';
import { BacktestCreationGuardService } from './backtest-creation-guard.service.js';
import { BacktestConfiguredRunService } from './backtest-configured-run.service.js';
import { BacktestRunPreparationController } from './backtest-run-preparation.controller.js';
import { BacktestRunPreflightController } from './backtest-run-preflight.controller.js';
import { BacktestRunPreflightService } from './backtest-run-preflight.service.js';
import { BacktestNavPreparationController } from './backtest-nav-preparation.controller.js';
import { BacktestNavPreparationRepository } from './backtest-nav-preparation-repository.js';
import { BacktestNavRunController } from './backtest-nav-run.controller.js';
import { BacktestNavRunListService } from './backtest-nav-run-list.service.js';
import { BacktestNavRunService } from './backtest-nav-run.service.js';
import { LocalNavSnapshotStore } from './backtest-nav-snapshot-store.js';
import { BacktestNavRunExecution } from './backtest-nav-run-execution.js';
import {
  BacktestNavPreparationService,
  NAV_PREPARATION_TIMEOUT_MS,
} from './backtest-nav-preparation.service.js';
import { loadConfig } from '../platform/config.js';

@Module({
  imports: [DsaModule, MarketModule, PlatformModule],
  controllers: [
    BacktestNavRunController,
    BacktestNavPreparationController,
    BacktestController,
    BacktestRunPreparationController,
    BacktestRunPreflightController,
  ],
  providers: [
    BacktestNavPreparationRepository,
    BacktestNavRunListService,
    BacktestNavRunService,
    BacktestNavPreparationService,
    { provide: NAV_PREPARATION_TIMEOUT_MS, useFactory: () => loadConfig().dsaTimeoutMs },
    BacktestService,
    BacktestRunPreparationService,
    BacktestRunPreflightService,
    BacktestCreationGuardService,
    BacktestConfiguredRunService,
    BacktestBullQueue,
    BacktestEventService,
    BacktestEventPublisher,
    BacktestQueueService,
    BacktestQueueReconciler,
    DsaSnapshotBuilder,
    BacktestRunService,
    BacktestNavRunExecution,
    { provide: BACKTEST_SNAPSHOT_BUILDER, useExisting: DsaSnapshotBuilder },
    {
      provide: BACKTEST_V3_RUNNER,
      inject: [LocalSnapshotStore],
      useFactory: (snapshots: LocalSnapshotStore) => new LocalSnapshotV3Runner(snapshots),
    },
    {
      provide: LocalSnapshotStore,
      useFactory: () =>
        new LocalSnapshotStore(
          process.env.BACKTEST_SNAPSHOT_ROOT ?? resolve(process.cwd(), 'var/backtest'),
        ),
    },
    {
      provide: LocalNavSnapshotStore,
      useFactory: () =>
        new LocalNavSnapshotStore(
          process.env.BACKTEST_SNAPSHOT_ROOT ?? resolve(process.cwd(), 'var/backtest'),
        ),
    },
    { provide: BACKTEST_QUEUE_TRANSPORT, useExisting: BacktestBullQueue },
    { provide: BACKTEST_JOB_EVENTS, useExisting: BacktestEventPublisher },
  ],
  exports: [
    BacktestService,
    BacktestConfiguredRunService,
    BacktestRunPreparationService,
    BacktestNavPreparationService,
    BacktestNavRunService,
  ],
})
export class BacktestModule {}
