import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { PerformanceService } from './performance.service.js';

@Controller('performance')
export class PerformanceController {
  constructor(private readonly performance: PerformanceService) {}

  @Post('snapshots')
  capture(@Body() body: { accountId?: string; capturedAt?: string; mode?: 'actual' | 'shadow' }) {
    return this.performance.capture(
      body.accountId,
      body.capturedAt ? new Date(body.capturedAt) : undefined,
      body.mode ?? 'actual',
    );
  }

  @Get('history')
  history(
    @Query('accountId') accountId?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('mode') mode: 'actual' | 'shadow' = 'actual',
  ) {
    return this.performance.history(accountId, start, end, mode);
  }

  @Get('summary')
  summary(
    @Query('accountId') accountId?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('mode') mode: 'actual' | 'shadow' = 'actual',
  ) {
    return this.performance.summary(accountId, start, end, mode);
  }

  @Post('calculate')
  calculate(
    @Body()
    input: {
      valuations: { date: string; value: number; externalFlow?: number }[];
      cashFlows: { date: string; amount: number }[];
    },
  ) {
    return this.performance.calculate(input);
  }

  @Post('allocation')
  allocate(
    @Body()
    input: {
      positions: { category: string; marketValue: number }[];
      targets?: Record<string, number>;
    },
  ) {
    return this.performance.allocate(input);
  }

  @Get('targets')
  targets(
    @Query('scope') scope: 'account' | 'portfolio' = 'portfolio',
    @Query('accountId') accountId?: string,
  ) {
    return this.performance.targets(scope, accountId);
  }

  @Post('targets')
  saveTargets(
    @Body()
    input: {
      scope: 'account' | 'portfolio';
      accountId?: string;
      targets: Record<string, number>;
    },
  ) {
    return this.performance.saveTargets(input.scope, input.targets, input.accountId);
  }

  @Get('layers')
  layers(
    @Query('accountId') accountId?: string,
    @Query('symbol') symbol?: string,
    @Query('mode') mode: 'actual' | 'shadow' = 'actual',
  ) {
    return this.performance.layers(accountId, symbol, mode);
  }
}
