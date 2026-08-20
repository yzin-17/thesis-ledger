import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { portfolioModeSchema } from '@thesis-ledger/schemas';
import { z } from 'zod';
import { RiskService } from './risk.service.js';

const createFromPlanSchema = z.object({ sourcePlanId: z.uuid(), rule: z.record(z.string(), z.unknown()) });
const riskEventQueryHttpSchema = z.object({
  mode: portfolioModeSchema.default('actual'),
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

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
  createFromPlan(@Body() input: unknown) {
    const body = createFromPlanSchema.parse(input);
    return this.risk.createRule({ ...body.rule, sourcePlanId: body.sourcePlanId });
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
  events(
    @Query('mode') mode?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const query = riskEventQueryHttpSchema.parse({ mode, cursor, limit });
    return this.risk.history(query.mode, {
      ...(query.cursor ? { cursor: query.cursor } : {}),
      ...(query.limit ? { limit: query.limit } : {}),
    });
  }
}
