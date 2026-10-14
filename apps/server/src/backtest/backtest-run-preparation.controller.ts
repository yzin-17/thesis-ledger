import { UseGuards } from '@nestjs/common';
import { StrategyIdentityGuard } from './strategy-identity.guard.js';
import { Body, Controller, Inject, Post } from '@nestjs/common';
import { BacktestRunPreparationService } from './backtest-run-preparation.service.js';

@Controller('backtests/run-config')
@UseGuards(StrategyIdentityGuard)
export class BacktestRunPreparationController {
  constructor(
    @Inject(BacktestRunPreparationService)
    private readonly preparation: BacktestRunPreparationService,
  ) {}

  @Post('prepare')
  prepare(@Body() input: unknown) {
    return this.preparation.prepare(input);
  }
}
