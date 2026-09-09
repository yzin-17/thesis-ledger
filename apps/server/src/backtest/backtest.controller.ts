import { Body, Controller, Get, Param, Post, Sse } from '@nestjs/common';
import { z } from 'zod';
import { BacktestService } from './backtest.service.js';
import { BacktestEventService } from './backtest-event.service.js';

const createStrategyHttpSchema = z.object({
  name: z.string().trim().min(1).max(120),
  schema: z.unknown(),
  description: z.string().max(2_000).optional(),
});
const createVersionHttpSchema = z.object({ schema: z.unknown() });

@Controller('backtests')
export class BacktestController {
  constructor(
    private readonly backtests: BacktestService,
    private readonly jobEvents: BacktestEventService,
  ) {}

  @Post('strategies')
  createStrategy(@Body() input: unknown) {
    const body = createStrategyHttpSchema.parse(input);
    return this.backtests.createStrategy(body.name, body.schema, body.description);
  }

  @Post('strategies/:id/versions')
  createVersion(@Param('id') id: string, @Body() input: unknown) {
    return this.backtests.createVersion(id, createVersionHttpSchema.parse(input).schema);
  }

  @Post('jobs')
  queue(@Body() body: unknown) {
    return this.backtests.queue(body);
  }

  @Post('jobs/:id/cancel')
  cancel(@Param('id') id: string) {
    return this.backtests.cancel(id);
  }

  @Post('jobs/:id/run')
  run(@Param('id') id: string) {
    return this.backtests.run(id);
  }

  @Get('jobs')
  jobs() {
    return this.backtests.listJobs();
  }

  @Get('jobs/summary')
  jobSummaries() {
    return this.backtests.listJobSummaries();
  }

  @Sse('events')
  events() {
    return this.jobEvents.stream();
  }

  @Get('jobs/:id')
  status(@Param('id') id: string) {
    return this.backtests.status(id);
  }

  @Get('strategies')
  strategies() {
    return this.backtests.listStrategies();
  }
}
