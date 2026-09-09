import { Module } from '@nestjs/common';
import { resolve } from 'node:path';
import { DsaModule } from '../integration/dsa/dsa.module.js';
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
import { BACKTEST_V2_SNAPSHOT_BUILDER, BacktestV2RunService } from './backtest-v2-run.js';
import { BACKTEST_V2_RUNNER } from './backtest-v2-run.js';
import { LocalSnapshotRunner } from './backtest-v2-runner.js';

@Module({
  imports: [DsaModule],
  controllers: [BacktestController],
  providers: [
    BacktestService,
    BacktestBullQueue,
    BacktestEventService,
    BacktestEventPublisher,
    BacktestQueueService,
    BacktestQueueReconciler,
    DsaSnapshotBuilder,
    BacktestV2RunService,
    { provide: BACKTEST_V2_SNAPSHOT_BUILDER, useExisting: DsaSnapshotBuilder },
    {
      provide: BACKTEST_V2_RUNNER,
      inject: [LocalSnapshotStore],
      useFactory: (snapshots: LocalSnapshotStore) => new LocalSnapshotRunner(snapshots),
    },
    {
      provide: LocalSnapshotStore,
      useFactory: () =>
        new LocalSnapshotStore(
          process.env.BACKTEST_SNAPSHOT_ROOT ?? resolve(process.cwd(), 'var/backtest'),
        ),
    },
    { provide: BACKTEST_QUEUE_TRANSPORT, useExisting: BacktestBullQueue },
    { provide: BACKTEST_JOB_EVENTS, useExisting: BacktestEventPublisher },
  ],
  exports: [BacktestService],
})
export class BacktestModule {}
