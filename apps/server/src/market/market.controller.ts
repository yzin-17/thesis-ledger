import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { MarketService } from './market.service.js';
import { MarketStorageService } from './market-storage.service.js';

@Controller('market')
export class MarketController {
  constructor(
    private readonly market: MarketService,
    private readonly storage: MarketStorageService,
  ) {}
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
  ) {
    return this.market.getBars(symbol, timeframe, {
      ...(start ? { start } : {}),
      ...(end ? { end } : {}),
    });
  }
  @Get(':symbol/indicators/:name') indicator(
    @Param('symbol') symbol: string,
    @Param('name') name: 'MA' | 'MACD' | 'RSI' | 'ATR',
  ) {
    return this.market.getIndicator(symbol, name);
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
