import { UseGuards } from '@nestjs/common';
import { StrategyIdentityGuard } from './strategy-identity.guard.js';
import { Body, Controller, Inject, Post } from '@nestjs/common';
import { BacktestRunPreflightService } from './backtest-run-preflight.service.js';

@Controller('backtests/run-config')
@UseGuards(StrategyIdentityGuard)
export class BacktestRunPreflightController {
  constructor(@Inject(BacktestRunPreflightService) private readonly preflight: BacktestRunPreflightService) {}

  @Post('preflight')
  check(@Body() input: unknown) { return this.preflight.check(input); }
}
