import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { dataQualityIssueInputSchema, omitUndefinedDeep } from '@thesis-ledger/schemas';
import { DataQualityService } from './data-quality.service.js';

@Controller('data-quality')
export class DataQualityController {
  constructor(private readonly quality: DataQualityService) {}

  @Get('issues')
  issues(@Query('status') status?: string) {
    return this.quality.list(this.quality.validateStatus(status));
  }

  @Post('issues')
  record(@Body() input: unknown) {
    return this.quality.record(omitUndefinedDeep(dataQualityIssueInputSchema.parse(input)));
  }

  @Patch('issues/:id/resolve')
  resolve(@Param('id') id: string) {
    return this.quality.resolve(id);
  }
}
