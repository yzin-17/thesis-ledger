import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  omitUndefinedDeep,
  performanceAllocationInputSchema,
  performanceCalculateInputSchema,
  performanceTargetsInputSchema,
  performanceSeriesQuerySchema,
  currencySchema,
} from '@thesis-ledger/schemas';
import { PerformanceService } from './performance.service.js';
import { PerformanceValuationSeriesService } from './performance-valuation-series.service.js';

const parseFxMerge = (value?: string) => value === 'true';
const parseBaseCurrency = (value?: string) => currencySchema.parse(value ?? 'CNY');

@Controller('performance')
export class PerformanceController {
  constructor(
    private readonly performance: PerformanceService,
    private readonly valuationSeries: PerformanceValuationSeriesService,
  ) {}

  @Get('series')
  series(
    @Query('scope') scope?: string,
    @Query('accountId') accountId?: string,
    @Query('range') range?: string,
    @Query('interval') interval?: string,
    @Query('mode') mode?: string,
    @Query('baseCurrency') baseCurrency?: string,
  ) {
    const input = performanceSeriesQuerySchema.parse({
      ...(scope ? { scope } : {}),
      ...(accountId ? { accountId } : {}),
      ...(range ? { range } : {}),
      ...(interval ? { interval } : {}),
      ...(mode ? { mode } : {}),
      ...(baseCurrency ? { baseCurrency } : {}),
    });
    const { accountId: parsedAccountId, ...required } = input;
    return this.valuationSeries.series({
      ...required,
      ...(parsedAccountId ? { accountId: parsedAccountId } : {}),
    });
  }

  @Get('snapshots')
  snapshots(
    @Query('accountId') accountId?: string,
    @Query('scope') scope?: 'account' | 'portfolio',
    @Query('mode') mode?: 'actual' | 'shadow',
    @Query('source') source?: 'DAILY_CLOSE' | 'TRANSACTION' | 'IMPORT' | 'SYSTEM',
    @Query('valuationBasis') valuationBasis?: 'ESTIMATED' | 'OFFICIAL',
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    return this.performance.snapshots({
      ...(accountId ? { accountId } : {}),
      ...(scope ? { scope } : {}),
      ...(mode ? { mode } : {}),
      ...(source ? { source } : {}),
      ...(valuationBasis ? { valuationBasis } : {}),
      ...(start ? { start } : {}),
      ...(end ? { end } : {}),
    });
  }

  @Get('snapshots/:id')
  snapshot(@Param('id') id: string) {
    return this.performance.snapshot(id);
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
