import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  omitUndefinedDeep,
  performanceAllocationInputSchema,
  performanceCalculateInputSchema,
  performanceSnapshotCaptureInputSchema,
  performanceTargetsInputSchema,
  currencySchema,
} from '@thesis-ledger/schemas';
import { PerformanceService } from './performance.service.js';

const parseFxMerge = (value?: string) => value === 'true';
const parseBaseCurrency = (value?: string) => currencySchema.parse(value ?? 'CNY');

@Controller('performance')
export class PerformanceController {
  constructor(private readonly performance: PerformanceService) {}

  @Post('snapshots')
  capture(
    @Body() input: unknown,
    @Query('fxMerge') fxMerge?: string,
    @Query('baseCurrency') baseCurrency?: string,
  ) {
    const body = performanceSnapshotCaptureInputSchema.parse(input);
    return this.performance.capture(
      body.accountId,
      body.capturedAt ? new Date(body.capturedAt) : undefined,
      body.mode ?? 'actual',
      {
        ...(fxMerge === undefined ? {} : { fxMerge: parseFxMerge(fxMerge) }),
        ...(baseCurrency === undefined ? {} : { baseCurrency: parseBaseCurrency(baseCurrency) }),
      },
    );
  }

  @Get('history')
  history(
    @Query('accountId') accountId?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('mode') mode: 'actual' | 'shadow' = 'actual',
    @Query('fxMerge') fxMerge?: string,
    @Query('baseCurrency') baseCurrency?: string,
  ) {
    return this.performance.history(accountId, start, end, mode, {
      fxMerge: parseFxMerge(fxMerge),
      baseCurrency: parseBaseCurrency(baseCurrency),
    });
  }

  @Get('summary')
  summary(
    @Query('accountId') accountId?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('mode') mode: 'actual' | 'shadow' = 'actual',
    @Query('fxMerge') fxMerge?: string,
    @Query('baseCurrency') baseCurrency?: string,
  ) {
    return this.performance.summary(accountId, start, end, mode, {
      fxMerge: parseFxMerge(fxMerge),
      baseCurrency: parseBaseCurrency(baseCurrency),
    });
  }

  @Post('calculate')
  calculate(@Body() input: unknown) {
    return this.performance.calculate(
      omitUndefinedDeep(performanceCalculateInputSchema.parse(input)),
    );
  }

  @Post('allocation')
  allocate(@Body() input: unknown) {
    return this.performance.allocate(
      omitUndefinedDeep(performanceAllocationInputSchema.parse(input)),
    );
  }

  @Get('targets')
  targets(
    @Query('scope') scope: 'account' | 'portfolio' = 'portfolio',
    @Query('accountId') accountId?: string,
    @Query('mode') mode: 'actual' | 'shadow' = 'actual',
    @Query('fxMerge') fxMerge?: string,
    @Query('baseCurrency') baseCurrency?: string,
  ) {
    return this.performance.targets(scope, accountId, mode, {
      fxMerge: parseFxMerge(fxMerge),
      baseCurrency: parseBaseCurrency(baseCurrency),
    });
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
    @Query('fxMerge') fxMerge?: string,
    @Query('baseCurrency') baseCurrency?: string,
  ) {
    return this.performance.layers(accountId, symbol, mode, {
      fxMerge: parseFxMerge(fxMerge),
      baseCurrency: parseBaseCurrency(baseCurrency),
    });
  }
}
