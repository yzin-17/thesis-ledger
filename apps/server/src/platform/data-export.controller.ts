import { Controller, Get, Query } from '@nestjs/common';
import { DataExportService } from './data-export.service.js';

@Controller('exports')
export class DataExportController {
  constructor(private readonly exports: DataExportService) {}

  @Get('account')
  account(@Query('accountId') accountId?: string) {
    return this.exports.exportAccount(accountId);
  }
}
