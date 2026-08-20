import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  performanceAllocationInputSchema,
  performanceCalculateInputSchema,
  performanceSnapshotCaptureInputSchema,
  performanceTargetsInputSchema,
} from '@thesis-ledger/schemas';
import { PerformanceService } from './performance.service.js';

@Controller('performance')
export class PerformanceController {
  constructor(private readonly performance: PerformanceService) {}

  @Post('snapshots')
  capture(@Body() input: unknown) {
    const body = performanceSnapshotCaptureInputSchema.parse(input);
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
  calculate(@Body() input: unknown) {
    return this.performance.calculate(performanceCalculateInputSchema.parse(input));
  }

  @Post('allocation')
  allocate(@Body() input: unknown) {
    return this.performance.allocate(performanceAllocationInputSchema.parse(input));
  }

  @Get('targets')
  targets(
    @Query('scope') scope: 'account' | 'portfolio' = 'portfolio',
    @Query('accountId') accountId?: string,
  ) {
    return this.performance.targets(scope, accountId);
  }

  @Post('targets')
  saveTargets(@Body() input: unknown) {
    const body = performanceTargetsInputSchema.parse(input);
    return this.performance.saveTargets(body.scope, body.targets, body.accountId);
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
