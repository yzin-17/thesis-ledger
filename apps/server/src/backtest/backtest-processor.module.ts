import { Module } from '@nestjs/common';
import { resolve } from 'node:path';
import { PlatformModule } from '../platform/platform.module.js';
import { BacktestEventPublisher } from './backtest-event.publisher.js';
import { LocalSnapshotStore } from './backtest-snapshot.js';
import { BacktestRunService } from './backtest-run.service.js';
import { BACKTEST_V3_RUNNER, LocalSnapshotV3Runner } from './backtest-v3-runner.js';
import { BacktestService } from './backtest.service.js';
import { LocalNavSnapshotStore } from './backtest-nav-snapshot-store.js';
import { BacktestNavRunExecution } from './backtest-nav-run-execution.js';

@Module({
  imports: [PlatformModule],
  providers: [
    BacktestService,
    BacktestEventPublisher,
    BacktestRunService,
    BacktestNavRunExecution,
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
