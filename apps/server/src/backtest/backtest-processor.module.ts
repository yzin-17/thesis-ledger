import { Module } from '@nestjs/common';
import { resolve } from 'node:path';
import { PlatformModule } from '../platform/platform.module.js';
import { BacktestEventPublisher } from './backtest-event.publisher.js';
import { LocalSnapshotStore } from './backtest-snapshot.js';
import { BACKTEST_V2_RUNNER, BacktestV2RunService } from './backtest-v2-run.js';
import { LocalSnapshotRunner } from './backtest-v2-runner.js';
import { BacktestService } from './backtest.service.js';

@Module({
  imports: [PlatformModule],
  providers: [
    BacktestService,
    BacktestEventPublisher,
    BacktestV2RunService,
    {
      provide: LocalSnapshotStore,
      useFactory: () =>
        new LocalSnapshotStore(
          process.env.BACKTEST_SNAPSHOT_ROOT ?? resolve(process.cwd(), 'var/backtest'),
        ),
    },
    {
      provide: BACKTEST_V2_RUNNER,
      inject: [LocalSnapshotStore],
      useFactory: (snapshots: LocalSnapshotStore) => new LocalSnapshotRunner(snapshots),
    },
  ],
})
export class BacktestProcessorModule {}
