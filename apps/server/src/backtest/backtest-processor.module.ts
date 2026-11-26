import { Module } from '@nestjs/common';
import { resolve } from 'node:path';
import { PlatformModule } from '../platform/platform.module.js';
import { BacktestEventPublisher } from './backtest-event.publisher.js';
import { LocalSnapshotStore } from './backtest-snapshot.js';
import { BACKTEST_SNAPSHOT_BUILDER, BacktestRunService } from './backtest-run.service.js';
import { BACKTEST_V3_RUNNER, LocalSnapshotV3Runner } from './backtest-v3-runner.js';
import { BacktestService } from './backtest.service.js';
import { LocalNavSnapshotStore } from './backtest-nav-snapshot-store.js';
import { BacktestNavRunExecution } from './backtest-nav-run-execution.js';
import { MarketBacktestInputModule } from '../market/market-backtest-input.module.js';
import { DsaModule } from '../integration/dsa/dsa.module.js';
import { DsaSnapshotBuilder } from './backtest-snapshot-builder.js';
import { BacktestCreationGuardService } from './backtest-creation-guard.service.js';
import { BacktestKnownCashGuardV3 } from './backtest-known-cash-guard-v3.service.js';
import { BacktestKnownCashPreparationRepository } from './backtest-known-cash-preparation.repository.js';

@Module({
  imports: [PlatformModule, DsaModule, MarketBacktestInputModule],
  providers: [
    BacktestService,
    BacktestEventPublisher,
    BacktestRunService,
    BacktestNavRunExecution,
    DsaSnapshotBuilder,
    BacktestCreationGuardService,
    BacktestKnownCashGuardV3,
    { provide: BACKTEST_SNAPSHOT_BUILDER, useExisting: DsaSnapshotBuilder },
    { provide: BacktestKnownCashPreparationRepository, useFactory: () => new BacktestKnownCashPreparationRepository(
      process.env.BACKTEST_SNAPSHOT_ROOT ?? resolve(process.cwd(), 'var/backtest')) },
    {
      provide: LocalNavSnapshotStore,
      useFactory: () =>
        new LocalNavSnapshotStore(
          process.env.BACKTEST_SNAPSHOT_ROOT ?? resolve(process.cwd(), 'var/backtest'),
        ),
    },
    {
      provide: LocalSnapshotStore,
      useFactory: () =>
        new LocalSnapshotStore(
          process.env.BACKTEST_SNAPSHOT_ROOT ?? resolve(process.cwd(), 'var/backtest'),
        ),
    },
    {
      provide: BACKTEST_V3_RUNNER,
      inject: [LocalSnapshotStore],
      useFactory: (snapshots: LocalSnapshotStore) => new LocalSnapshotV3Runner(snapshots),
    },
  ],
})
export class BacktestProcessorModule {}
