import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  automationCloseSnapshotsInputSchema,
  automationCloseSyncInputSchema,
  automationDailyReportInputSchema,
  automationDailyRiskSummaryInputSchema,
  automationDigestInputSchema,
  automationEnabledInputSchema,
  automationJobTypeSchema,
  automationOpeningScanInputSchema,
  automationPreMarketEventsInputSchema,
  automationRiskPreviewInputSchema,
  automationRiskScanInputSchema,
  automationWeeklyPerformanceInputSchema,
  automationWeeklyStrategyInputSchema,
  omitUndefinedDeep,
} from '@thesis-ledger/schemas';
import { PrismaService } from '../platform/prisma.service.js';
import { AutomationRuntimeHandlers } from './automation-runtime.service.js';
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
    private readonly handlers: AutomationRuntimeHandlers,
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

  @Patch(':id')
  update(@Param('id') id: string, @Body() input: unknown) {
    return this.automations.update(id, input);
  }

  @Patch(':id/enabled')
  setEnabled(@Param('id') id: string, @Body() input: unknown) {
    const body = automationEnabledInputSchema.parse(input);
    return this.prisma.automationJob.update({ where: { id }, data: { enabled: body.enabled } });
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.automations.delete(id);
  }

  /** 手动立即执行：显式试跑，绕过启停与交易日检查；执行层照常负责锁、运行历史与重试。 */
  @Post(':id/run')
  async run(@Param('id') id: string) {
    const job = await this.prisma.automationJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('任务不存在');
    const handler = this.handlers.for(automationJobTypeSchema.parse(job.type));
    try {
      return await this.automations.execute(job.id, handler);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(
        error instanceof Error ? error.message : '自动化执行失败',
      );
    }
  }

  @Post('workflows/pre-market-events')
  preMarketEvents(@Body() input: unknown) {
    const body = omitUndefinedDeep(automationPreMarketEventsInputSchema.parse(input));
    return preMarketPositionEvents(body.positions, body.events);
  }

  @Post('workflows/risk-preview')
  riskPreview(@Body() input: unknown) {
    const body = omitUndefinedDeep(automationRiskPreviewInputSchema.parse(input));
    return preMarketRiskPreview({ ...body, scan: (contexts) => ({ contexts }) });
  }

  @Post('workflows/daily-risk-summary')
  riskSummary(@Body() input: unknown) {
    const body = omitUndefinedDeep(automationDailyRiskSummaryInputSchema.parse(input));
    return dailyRiskSummary(body.events);
  }

  @Post('workflows/digest')
  digest(@Body() input: unknown) {
    return dailyDigest(omitUndefinedDeep(automationDigestInputSchema.parse(input)));
  }

  @Post('workflows/daily-report')
  dailyReport(@Body() input: unknown) {
    return investmentDailyReport(omitUndefinedDeep(automationDailyReportInputSchema.parse(input)));
  }

  @Post('workflows/opening-scan')
  opening(@Body() input: unknown) {
    return openingScan(omitUndefinedDeep(automationOpeningScanInputSchema.parse(input)));
  }

  @Post('workflows/weekly-performance')
  weeklyPerformance(@Body() input: unknown) {
    return weeklyPerformanceReview(
      omitUndefinedDeep(automationWeeklyPerformanceInputSchema.parse(input)),
    );
  }

  @Post('workflows/weekly-strategy')
  weeklyStrategy(@Body() input: unknown) {
    return weeklyStrategyReview(
      omitUndefinedDeep(automationWeeklyStrategyInputSchema.parse(input)),
    );
  }

  @Post('workflows/close-sync')
  closeSync(@Body() input: unknown) {
    return this.workflows.closeSync(omitUndefinedDeep(automationCloseSyncInputSchema.parse(input)));
  }

  @Post('workflows/close-snapshots')
  closeSnapshots(@Body() input: unknown) {
    return this.workflows.closeSnapshots(
      omitUndefinedDeep(automationCloseSnapshotsInputSchema.parse(input)),
    );
  }

  @Post('workflows/risk-scan')
  riskScan(@Body() input: unknown) {
    return this.workflows.riskScan(automationRiskScanInputSchema.parse(input).contexts);
  }
}
