import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { StrategyIdentityGuard } from './strategy-identity.guard.js';
import { BacktestInstrumentSeriesService } from './backtest-instrument-series.service.js';

@Controller('backtests/runs')
@UseGuards(StrategyIdentityGuard)
export class BacktestInstrumentSeriesController {
  constructor(private readonly series: BacktestInstrumentSeriesService) {}
  @Get(':id/instrument-series')
  read(@Param('id') id: string) {
    return this.series.read(id);
  }
}
