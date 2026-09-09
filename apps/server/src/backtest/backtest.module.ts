import { Module } from '@nestjs/common';
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

@Module({
  controllers: [BacktestController],
  providers: [
    BacktestService,
    BacktestBullQueue,
    BacktestEventService,
    BacktestEventPublisher,
    BacktestQueueService,
    BacktestQueueReconciler,
    { provide: BACKTEST_QUEUE_TRANSPORT, useExisting: BacktestBullQueue },
    { provide: BACKTEST_JOB_EVENTS, useExisting: BacktestEventPublisher },
  ],
  exports: [BacktestService],
})
export class BacktestModule {}
