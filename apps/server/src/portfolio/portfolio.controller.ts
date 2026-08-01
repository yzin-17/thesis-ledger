import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { PortfolioService } from './portfolio.service.js';

@Controller('portfolio')
export class PortfolioController {
  constructor(private readonly portfolio: PortfolioService) {}
  @Get('positions') positions(@Query('accountId') accountId?: string) {
    return this.portfolio.listPositions(accountId);
  }
  @Post('positions') upsert(@Body() body: unknown) {
    return this.portfolio.upsertPosition(body);
  }
  @Delete('positions/:id') remove(@Param('id') id: string) {
    return this.portfolio.removePosition(id);
  }
  @Patch('positions/:id') update(@Param('id') id: string, @Body() body: unknown) {
    return this.portfolio.updatePosition(id, body);
  }
  @Get('valuation') value(@Query('accountId') accountId?: string) {
    return this.portfolio.value(accountId);
  }
}
