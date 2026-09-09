import { Module } from '@nestjs/common';
import { PlatformModule } from '../platform/platform.module.js';
import { BacktestEventPublisher } from './backtest-event.publisher.js';
import { BacktestService } from './backtest.service.js';

@Module({
  imports: [PlatformModule],
  providers: [BacktestService, BacktestEventPublisher],
})
export class BacktestProcessorModule {}
