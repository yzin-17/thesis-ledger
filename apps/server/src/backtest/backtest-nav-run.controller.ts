import {
  Body,
  Controller,
  Get,
  Inject,
  Optional,
  Param,
  ParseUUIDPipe,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import { BacktestQueueService } from './backtest-queue.service.js';
import { BacktestNavRunListService } from './backtest-nav-run-list.service.js';
import { BacktestNavRunService } from './backtest-nav-run.service.js';
import { BacktestRunService } from './backtest-run.service.js';

@Controller('backtests/runs/nav')
export class BacktestNavRunController {
  constructor(
    @Inject(BacktestNavRunService) private readonly runs: BacktestNavRunService,
    @Inject(BacktestRunService) private readonly runExecution: BacktestRunService,
    @Inject(BacktestQueueService) private readonly queue: BacktestQueueService,
    @Optional() @Inject(BacktestNavRunListService)
    private readonly runList?: BacktestNavRunListService,
  ) {}

  @Get()
  list() {
    if (!this.runList) throw new ServiceUnavailableException('NAV Run 列表服务未配置');
    return this.runList.list();
  }

  @Post()
  create(@Body() input: unknown) {
    return this.runs.create(input);
  }

  @Get(':id')
  read(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.runs.read(id);
  }

  @Post(':id/retry')
  async retry(@Param('id', new ParseUUIDPipe()) id: string) {
    await this.runs.read(id);
    await this.runExecution.retryRun(id);
    return this.runs.read(id);
  }

  @Post(':id/cancel')
  async cancel(@Param('id', new ParseUUIDPipe()) id: string) {
    await this.runs.read(id);
    await this.queue.cancel(id);
    return this.runs.read(id);
  }
}
