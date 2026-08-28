import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  tradeListQuerySchemaV2,
  tradeModeQuerySchemaV2,
  tradeReferenceResolveRequestSchemaV2,
} from '@thesis-ledger/schemas';
import { z } from 'zod';
import { TradeQueryService } from '../ledger/trade-query.service.js';

const accountIdSchema = z.uuid();

@Controller('portfolio/trades')
export class TradeController {
  constructor(private readonly trades: TradeQueryService) {}

  @Get()
  list(@Query() query: Record<string, string | undefined>) {
    return this.trades.list(tradeListQuerySchemaV2.parse(query));
  }

  @Post('resolve-reference')
  resolveReference(@Body() request: unknown) {
    return this.trades.resolveReference(tradeReferenceResolveRequestSchemaV2.parse(request));
  }

  @Get(':tradeId')
  get(
    @Param('tradeId') tradeId: string,
    @Query('accountId') accountId: string,
    @Query('mode') mode?: string,
  ) {
    const parsedMode = tradeModeQuerySchemaV2.parse({
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
    const parsedMode = tradeModeQuerySchemaV2.parse({
      ...(mode === undefined ? {} : { mode }),
    }).mode;
    return this.trades.closeSlice(accountIdSchema.parse(accountId), tradeId, sliceId, parsedMode);
  }
}
