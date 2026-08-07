import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { PortfolioService } from './portfolio.service.js';

@Controller('portfolio')
export class PortfolioController {
  constructor(private readonly portfolio: PortfolioService) {}
  @Get('positions') positions(
    @Query('accountId') accountId?: string,
    @Query('mode') mode: 'actual' | 'shadow' = 'actual',
  ) {
    return this.portfolio.listPositions(accountId, mode);
  }
  @Post('positions') upsert(@Body() body: unknown) {
    return this.portfolio.upsertPosition(body);
  }
  @Post('cash') cash(
    @Body() body: { accountId?: string; amount?: number; source?: 'manual' | 'screenshot' },
  ) {
    return this.portfolio.setCashBalance(
      body.accountId ?? '',
      Number(body.amount),
      body.source ?? 'manual',
    );
  }
  @Post('positions/clear') clear(@Body() body: { accountId?: string }) {
    return this.portfolio.clearPositions(body.accountId ?? '');
  }
  @Delete('positions/:id') remove(@Param('id') id: string) {
    return this.portfolio.removePosition(id);
  }
  @Patch('positions/:id') update(@Param('id') id: string, @Body() body: unknown) {
    return this.portfolio.updatePosition(id, body);
  }
  @Get('valuation') value(
    @Query('accountId') accountId?: string,
    @Query('mode') mode: 'actual' | 'shadow' = 'actual',
  ) {
    return this.portfolio.value(accountId, mode);
  }
}
