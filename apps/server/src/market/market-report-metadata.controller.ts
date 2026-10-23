import { BadRequestException, Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { reportMetadataHistoryQuerySchema } from '@thesis-ledger/schemas';
import { MarketReportMetadataService } from './market-report-metadata.service.js';
import { MarketReportMetadataRepository } from './market-report-metadata.repository.js';

@Controller('api/market-data/research-report-metadata')
export class MarketReportMetadataController {
  constructor(
    @Inject(MarketReportMetadataService) private readonly metadata: MarketReportMetadataService,
    @Inject(MarketReportMetadataRepository) private readonly snapshots: MarketReportMetadataRepository,
  ) {}

  @Post('collect') collect(@Body() body: unknown) {
    return this.metadata.collect(body);
  }

  @Get('history') history(@Query() query: Record<string, unknown>) {
    const checked = reportMetadataHistoryQuerySchema.safeParse(query);
    if (!checked.success) throw new BadRequestException('研报历史需要有效目录身份、有界条数与快照游标');
    return this.snapshots.history(checked.data.instrumentId, checked.data.limit, checked.data.cursor);
  }

  @Get('snapshots/:snapshotId') read(@Param('snapshotId') snapshotId: string) {
    if (!z.uuid().safeParse(snapshotId).success) throw new BadRequestException('研报快照标识无效');
    return this.snapshots.read(snapshotId);
  }
}
