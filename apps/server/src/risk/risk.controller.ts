import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { RiskService } from './risk.service.js';

@Controller('risk')
export class RiskController {
  constructor(private readonly risk: RiskService) {}

  @Get('rules')
  rules() {
    return this.risk.listRules();
  }

  @Post('rules')
  create(@Body() body: unknown) {
    return this.risk.createRule(body);
  }

  @Post('rules/from-plan')
  createFromPlan(@Body() body: { sourcePlanId: string; rule: unknown }) {
    return this.risk.createRule({ ...(body.rule as object), sourcePlanId: body.sourcePlanId });
  }

  @Patch('rules/:id')
  update(@Param('id') id: string, @Body() body: unknown) {
    return this.risk.updateRule(id, body);
  }

  @Delete('rules/:id')
  archive(@Param('id') id: string) {
    return this.risk.archiveRule(id);
  }

  @Post('rules/:id/test')
  test(@Param('id') id: string, @Body() body: unknown) {
    return this.risk.testRule(id, body);
  }

  @Get('rules/:id/audit')
  audit(@Param('id') id: string) {
    return this.risk.audit(id);
  }

  @Post('scan')
  scan(@Body() body: unknown) {
    return this.risk.scan(body);
  }

  @Get('events')
  events(@Query('mode') mode: 'actual' | 'shadow' = 'actual') {
    return this.risk.history(mode);
  }
}
