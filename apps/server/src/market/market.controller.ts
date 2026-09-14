import { BadRequestException, Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { MarketService } from './market.service.js';
import { MarketStorageService } from './market-storage.service.js';
import { MarketDetailService } from './market-detail.service.js';
import { assertCalendarDateRange, assertIndicatorParameters } from './market-request-validation.js';

@Controller('market')
export class MarketController {
  constructor(
    private readonly market: MarketService,
    private readonly storage: MarketStorageService,
    private readonly detail: MarketDetailService,
  ) {}

  @Get(':symbol/detail') detailReadModel(
    @Param('symbol') symbol: string,
    @Query('include') include?: string | string[],
    @Query('barsLimit') barsLimit?: string,
    @Query('navLimit') navLimit?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('indicatorParams') indicatorParams?: string,
    @Query('calculationAnchor') calculationAnchor?: string,
    @Query('refresh') refresh?: string,
  ) {
    return this.detail.getDetail(symbol, {
      ...(include !== undefined ? { include } : {}),
      ...(barsLimit !== undefined ? { barsLimit } : {}),
      ...(navLimit !== undefined ? { navLimit } : {}),
      ...(start !== undefined ? { start } : {}),
      ...(end !== undefined ? { end } : {}),
      ...(indicatorParams !== undefined ? { indicatorParams } : {}),
      ...(calculationAnchor !== undefined ? { calculationAnchor } : {}),
      refresh: refresh === '1',
    });
  }

  @Get(':symbol/quote') quote(@Param('symbol') symbol: string) {
    return this.market.getQuote(symbol);
  }
  @Get(':symbol/fund-nav') fundNav(@Param('symbol') symbol: string) {
    return this.market.getFundNav(symbol);
  }
  @Get(':symbol/fund-nav/history') fundNavHistory(
    @Param('symbol') symbol: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('limit') limit?: string,
  ) {
    return this.market.getFundNavHistory(symbol, {
      ...(start ? { start } : {}),
      ...(end ? { end } : {}),
      ...(limit ? { limit: Number(limit) } : {}),
    });
  }
  @Get(':symbol/bars') bars(
    @Param('symbol') symbol: string,
    @Query('timeframe') timeframe: '1m' | '1d' = '1d',
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('limit') limit?: string,
  ) {
    return this.market.getBars(symbol, timeframe, {
      ...(start ? { start } : {}),
      ...(end ? { end } : {}),
      ...(limit ? { limit: Number(limit) } : {}),
    });
  }
  @Get(':symbol/indicators/:name') indicator(
    @Param('symbol') symbol: string,
    @Param('name') name: 'MA' | 'MACD' | 'RSI' | 'ATR',
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('limit') limit?: string,
    @Query('parameters') parameters?: string,
    @Query('calculationAnchor') calculationAnchor?: string,
  ) {
    try {
      assertCalendarDateRange(start, end);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : '日期范围无效');
    }
    if (limit !== undefined && (!/^\d+$/.test(limit) || Number(limit) < 1 || Number(limit) > 365))
      throw new BadRequestException('indicator limit 必须是 1 到 365 之间的整数');
    let indicatorParameters: Record<string, number> | undefined;
    if (parameters) {
      try {
        const parsed: unknown = JSON.parse(parameters);
        if (
          parsed === null ||
          typeof parsed !== 'object' ||
          Array.isArray(parsed) ||
          !Object.values(parsed).every(
            (value) => typeof value === 'number' && Number.isFinite(value),
          )
        )
          throw new Error('invalid');
        indicatorParameters = parsed as Record<string, number>;
      } catch {
        throw new BadRequestException('parameters 必须是 JSON 数字对象');
      }
      try {
        assertIndicatorParameters(name, indicatorParameters);
      } catch (error) {
        throw new BadRequestException(error instanceof Error ? error.message : '指标参数无效');
      }
    }
    return this.market.getIndicator(symbol, name, {
      ...(start ? { start } : {}),
      ...(end ? { end } : {}),
      ...(limit ? { limit: Number(limit) } : {}),
      ...(indicatorParameters ? { parameters: indicatorParameters } : {}),
      ...(calculationAnchor ? { calculationAnchor } : {}),
    });
  }
  @Get(':symbol/chip') chip(@Param('symbol') symbol: string) {
    return this.market.getChip(symbol);
  }

  @Post(':symbol/bars/sync') syncBars(
    @Param('symbol') symbol: string,
    @Body()
    body: {
      timeframe?: '1m' | '1d';
      start?: string;
      end?: string;
      mode?: 'incremental' | 'backfill';
    },
  ) {
    return this.storage.syncBars({
      symbol,
      timeframe: body.timeframe ?? '1d',
      ...(body.start ? { start: body.start } : {}),
      ...(body.end ? { end: body.end } : {}),
      ...(body.mode ? { mode: body.mode } : {}),
    });
  }

  @Get(':symbol/bars/stored') storedBars(
    @Param('symbol') symbol: string,
    @Query('timeframe') timeframe: '1m' | '1d' = '1d',
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    return this.storage.listBars(symbol, timeframe, start, end);
  }

  @Post('backfills')
  createBackfill(
    @Body() body: { symbol: string; timeframe?: '1m' | '1d'; start: string; end: string },
  ) {
    return this.storage.createBackfill({
      symbol: body.symbol,
      timeframe: body.timeframe ?? '1d',
      start: body.start,
      end: body.end,
    });
  }

  @Post('backfills/:id/run')
  runBackfill(@Param('id') id: string) {
    return this.storage.runBackfill(id);
  }
}
