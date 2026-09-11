import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { StrategyOptimizationReadService } from './strategy-optimization-read.service.js';
import { StrategyOptimizationService } from './strategy-optimization.service.js';
import { StrategyRiskApplicationService } from './strategy-risk-application.service.js';

const listApplicationsQuery = z.object({ accountId: z.uuid().optional(), symbol: z.string().optional() });
const listExperimentsQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).default(30) });
const upgradePreviewSchema = z.object({ targetStrategyVersionId: z.uuid() }).strict();

@Controller('strategy-optimization')
export class StrategyOptimizationController {
  constructor(
    private readonly optimization: StrategyOptimizationService,
    private readonly reads: StrategyOptimizationReadService,
    private readonly riskApplications: StrategyRiskApplicationService,
  ) {}

  @Get('capabilities')
  capabilities() {
    return this.reads.capabilities();
  }

  @Get('strategies/:strategyVersionId/parameters')
  parameters(@Param('strategyVersionId') strategyVersionId: string) {
    return this.reads.parameters(strategyVersionId);
  }

  @Get('strategies/:strategyVersionId/monitoring-plan')
  monitoringPlan(@Param('strategyVersionId') strategyVersionId: string) {
    return this.riskApplications.monitoringPlan(strategyVersionId);
  }

  @Post('risk-applications/preview')
  previewRiskApplication(@Body() body: unknown) {
    return this.riskApplications.preview(body);
  }

  @Post('risk-applications')
  createRiskApplication(@Body() body: unknown) {
    return this.riskApplications.create(body);
  }

  @Get('risk-applications')
  listRiskApplications(@Query() query: unknown) {
    const parsed = listApplicationsQuery.parse(query);
    return this.riskApplications.list(parsed.accountId, parsed.symbol);
  }

  @Get('risk-applications/:id')
  riskApplication(@Param('id') id: string) {
    return this.riskApplications.get(id);
  }

  @Patch('risk-applications/:id')
  updateRiskApplication(@Param('id') id: string, @Body() body: unknown) {
    return this.riskApplications.update(id, body);
  }

  @Post('risk-applications/:id/upgrade-preview')
  upgradePreview(@Param('id') id: string, @Body() body: unknown) {
    const parsed = upgradePreviewSchema.parse(body);
    return this.riskApplications.upgradePreview(id, parsed.targetStrategyVersionId);
  }

  @Post('risk-applications/:id/upgrade')
  upgrade(@Param('id') id: string, @Body() body: unknown) {
    return this.riskApplications.upgrade(id, body);
  }

  @Post('risk-applications/:id/evaluate')
  evaluateRiskApplication(@Param('id') id: string) {
    return this.riskApplications.evaluate(id);
  }

  @Post('experiments')
  createExperiment(@Body() body: unknown) {
    return this.optimization.create(body);
  }

  @Get('experiments')
  listExperiments(@Query() query: unknown) {
    return this.reads.list(listExperimentsQuery.parse(query).limit);
  }

  @Get('experiments/:id')
  experiment(@Param('id') id: string) {
    return this.reads.get(id);
  }

  @Get('experiments/:id/compare')
  compare(@Param('id') id: string) {
    return this.reads.compare(id);
  }

  @Post('experiments/:id/clone')
  clone(@Param('id') id: string, @Body() body: unknown) {
    return this.optimization.clone(id, body);
  }

  @Post('experiments/:id/cancel')
  cancel(@Param('id') id: string) {
    return this.optimization.cancel(id);
  }

  @Post('experiments/:id/finalize')
  finalize(@Param('id') id: string, @Body() body: unknown) {
    return this.optimization.finalize(id, body);
  }

  @Post('experiments/:id/adopt')
  adopt(@Param('id') id: string, @Body() body: unknown) {
    return this.optimization.adopt(id, body);
  }
}
