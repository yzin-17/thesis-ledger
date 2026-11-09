import { Body, Controller, Inject, Post, UseGuards } from '@nestjs/common';
import { StrategyIdentityGuard } from './strategy-identity.guard.js';
import { BacktestModelResolutionService } from './backtest-model-resolution.service.js';

@Controller('backtests/run-config')
@UseGuards(StrategyIdentityGuard)
export class BacktestModelResolutionController {
  constructor(@Inject(BacktestModelResolutionService) private readonly models: BacktestModelResolutionService) {}

  @Post('execution-model')
  resolve(@Body() input: unknown) {
    return this.models.resolve(input);
  }
}
