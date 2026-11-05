import { Body, Controller, Get, Optional, Param, Post, Query } from '@nestjs/common';
import {
  createTradeOpeningBoundaryAssertionCommandSchema,
  tradeListQuerySchema,
  tradeInstrumentsQuerySchema,
  tradeModeQuerySchema,
  tradeReferenceResolveRequestSchema,
} from '@thesis-ledger/schemas';
import { z } from 'zod';
import { TradeQueryService } from '../ledger/trade-query.service.js';
import { TradeInstrumentQueryService } from '../ledger/trade-instrument-query.service.js';
import { TradeOpeningBoundaryCommandService } from '../ledger/trade-opening-boundary-command.service.js';
import { TradeChartQueryService } from '../ledger/trade-chart-query.service.js';

const accountIdSchema = z.uuid();

@Controller('portfolio/trades')
export class TradeController {
  constructor(
    private readonly trades: TradeQueryService,
    private readonly openingBoundaries: TradeOpeningBoundaryCommandService,
    private readonly instruments: TradeInstrumentQueryService,
    @Optional() private readonly charts?: TradeChartQueryService,
  ) {}

  @Get()
  list(@Query() query: Record<string, string | undefined>) {
    return this.trades.list(tradeListQuerySchema.parse(query));
  }

  @Get('chart')
  chart(@Query() query: unknown) {
    if (!this.charts) throw new Error('成交图表读取服务未注入');
    return this.charts.read(query);
  }

  @Get('instruments')
  listInstruments(@Query() query: unknown) {
    return this.instruments.list(tradeInstrumentsQuerySchema.parse(query));
  }

  @Post('resolve-reference')
  resolveReference(@Body() request: unknown) {
    return this.trades.resolveReference(tradeReferenceResolveRequestSchema.parse(request));
  }

  @Post(':tradeId/opening-boundary')
  createOpeningBoundary(@Param('tradeId') tradeId: string, @Body() request: unknown) {
    return this.openingBoundaries.createOpeningBoundary(
      tradeId,
      createTradeOpeningBoundaryAssertionCommandSchema.parse(request),
    );
  }

  @Get(':tradeId')
  get(
    @Param('tradeId') tradeId: string,
    @Query('accountId') accountId: string,
    @Query('mode') mode?: string,
  ) {
    const parsedMode = tradeModeQuerySchema.parse({
      ...(mode === undefined ? {} : { mode }),
    }).mode;
    return this.trades.get(accountIdSchema.parse(accountId), tradeId, parsedMode);
  }

  @Get(':tradeId/close-slices/:sliceId')
  closeSlice(
    @Param('tradeId') tradeId: string,
    @Param('sliceId') sliceId: string,
    @Query('accountId') accountId: string,
    @Query('mode') mode?: string,
  ) {
    const parsedMode = tradeModeQuerySchema.parse({
      ...(mode === undefined ? {} : { mode }),
    }).mode;
    return this.trades.closeSlice(accountIdSchema.parse(accountId), tradeId, sliceId, parsedMode);
  }
}
