import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { DataExportService } from './data-export.service.js';

const accountIdQuerySchema = z.uuid().optional();

@Controller('exports')
export class DataExportController {
  constructor(private readonly exports: DataExportService) {}

  @Get('account')
  account(@Query('accountId') accountId?: string) {
    return this.exports.exportAccount(accountIdQuerySchema.parse(accountId));
  }
}
