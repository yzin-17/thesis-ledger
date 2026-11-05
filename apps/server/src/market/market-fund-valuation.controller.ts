import { Controller, Get, Inject, Param } from '@nestjs/common';
import { MarketFundValuationService } from './market-fund-valuation.service.js';

@Controller('api/market')
export class MarketFundValuationController {
  constructor(@Inject(MarketFundValuationService) private readonly estimates: MarketFundValuationService) {}

  @Get(':symbol/fund-valuation')
  current(@Param('symbol') symbol: string) { return this.estimates.current(symbol); }

  @Get(':symbol/fund-valuation/today')
  today(@Param('symbol') symbol: string) { return this.estimates.today(symbol); }
}
