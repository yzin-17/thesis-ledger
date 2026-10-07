import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { backtestNavPreparationRequestV3Schema } from '@thesis-ledger/schemas';
import { BacktestNavPreparationService } from './backtest-nav-preparation.service.js';

@Controller('backtests/run-config/nav')
export class BacktestNavPreparationController {
  constructor(
    @Inject(BacktestNavPreparationService)
    private readonly preparation: BacktestNavPreparationService,
  ) {}

  @Post('prepare')
  @HttpCode(200)
  prepare(@Body() input: unknown) {
    return this.preparation.prepare(backtestNavPreparationRequestV3Schema.parse(input));
  }
}
