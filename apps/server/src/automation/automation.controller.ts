import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { PrismaService } from '../platform/prisma.service.js';
import { AutomationService } from './automation.service.js';
import { AutomationWorkflowRunner } from './workflow-runner.service.js';
import {
  dailyDigest,
  dailyRiskSummary,
  investmentDailyReport,
  openingScan,
  preMarketPositionEvents,
  preMarketRiskPreview,
  weeklyPerformanceReview,
  weeklyStrategyReview,
} from './workflows.service.js';

@Controller('automations')
export class AutomationController {
  constructor(
    private readonly automations: AutomationService,
    private readonly prisma: PrismaService,
    private readonly workflows: AutomationWorkflowRunner,
  ) {}

  @Post()
  create(@Body() input: unknown) {
    return this.automations.create(input);
  }

  @Get()
  list() {
    return this.automations.list();
  }

  @Get('history')
  history(@Query('jobId') jobId?: string) {
    return this.automations.history(jobId);
  }

  @Patch(':id/enabled')
  setEnabled(@Param('id') id: string, @Body() body: { enabled: boolean }) {
    return this.prisma.automationJob.update({ where: { id }, data: { enabled: body.enabled } });
  }

  @Post('workflows/pre-market-events')
  preMarketEvents(
    @Body()
    body: {
      positions: Parameters<typeof preMarketPositionEvents>[0];
      events: Parameters<typeof preMarketPositionEvents>[1];
    },
  ) {
    return preMarketPositionEvents(body.positions, body.events);
  }

  @Post('workflows/risk-preview')
  riskPreview(@Body() body: { asOf: string; contexts: unknown[] }) {
    return preMarketRiskPreview({ ...body, scan: (contexts) => ({ contexts }) });
  }

  @Post('workflows/daily-risk-summary')
  riskSummary(@Body() body: { events: Parameters<typeof dailyRiskSummary>[0] }) {
    return dailyRiskSummary(body.events);
  }

  @Post('workflows/digest')
  digest(@Body() body: Parameters<typeof dailyDigest>[0]) {
    return dailyDigest(body);
  }

  @Post('workflows/daily-report')
  dailyReport(@Body() body: Parameters<typeof investmentDailyReport>[0]) {
    return investmentDailyReport(body);
  }

  @Post('workflows/opening-scan')
  opening(@Body() body: Parameters<typeof openingScan>[0]) {
    return openingScan(body);
  }

  @Post('workflows/weekly-performance')
  weeklyPerformance(@Body() body: Parameters<typeof weeklyPerformanceReview>[0]) {
    return weeklyPerformanceReview(body);
  }

  @Post('workflows/weekly-strategy')
  weeklyStrategy(@Body() body: Parameters<typeof weeklyStrategyReview>[0]) {
    return weeklyStrategyReview(body);
  }

  @Post('workflows/close-sync')
  closeSync(@Body() body: { symbols: string[]; timeframe?: '1d' | '1m'; end?: string }) {
    return this.workflows.closeSync(body);
  }

  @Post('workflows/close-snapshots')
  closeSnapshots(@Body() body: { accountIds: string[]; capturedAt: string }) {
    return this.workflows.closeSnapshots(body);
  }

  @Post('workflows/risk-scan')
  riskScan(@Body() body: { contexts: unknown[] }) {
    return this.workflows.riskScan(body.contexts);
  }
}
