import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { BacktestService } from './backtest.service.js';

@Controller('backtests')
export class BacktestController {
  constructor(private readonly backtests: BacktestService) {}

  @Post('strategies')
  createStrategy(@Body() body: { name: string; schema: unknown; description?: string }) {
    return this.backtests.createStrategy(body.name, body.schema, body.description);
  }

  @Post('strategies/:id/versions')
  createVersion(@Param('id') id: string, @Body() body: { schema: unknown }) {
    return this.backtests.createVersion(id, body.schema);
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

  @Get('jobs/:id')
  status(@Param('id') id: string) {
    return this.backtests.status(id);
  }

  @Get('strategies')
  strategies() {
    return this.backtests.listStrategies();
  }
}
