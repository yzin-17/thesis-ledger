import { Body, Controller, Get, Param, Post, Sse } from '@nestjs/common';
import { z } from 'zod';
import { BacktestService } from './backtest.service.js';
import { BacktestEventService } from './backtest-event.service.js';
import { withBacktestModelDisclosure } from './backtest-model-disclosure.js';

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

  @Post('runs')
  createRun(@Body() body: unknown) {
    return this.backtests.createRun(body).then(withBacktestModelDisclosure);
  }

  @Post('runs/:id/cancel')
  cancelRun(@Param('id') id: string) {
    return this.backtests.cancelCurrentRunForRead(id);
  }

  @Post('runs/:id/retry')
  retryRun(@Param('id') id: string) {
    return this.backtests.retryCurrentRunForRead(id);
  }

  @Post('runs/:id/run')
  runCurrent(@Param('id') id: string) {
    return this.backtests.runCurrentRunForRead(id);
  }

  @Get('runs')
  runs() {
    return this.backtests.listCurrentRunSummaries();
  }

  @Get('runs/:id')
  runStatus(@Param('id') id: string) {
    return this.backtests.currentRunForRead(id).then(withBacktestModelDisclosure);
  }

  @Sse('events')
  events() {
    return this.jobEvents.stream();
  }

  @Get('strategies')
  strategies() {
    return this.backtests.listStrategies().then((strategies) =>
      strategies.map((strategy) => ({
        ...strategy,
        versions: strategy.versions.filter((version) => version.version > 0),
      })),
    );
  }
}
