import { Controller, Get, Post, Query } from '@nestjs/common';
import { ProviderHealthService } from './provider-health.service.js';

@Controller('providers')
export class ProviderHealthController {
  constructor(private readonly health: ProviderHealthService) {}

  @Get('health')
  list() {
    return this.health.list();
  }

  @Post('health/check')
  check() {
    return this.health.checkAll();
  }

  @Get('health/history')
  history(@Query('provider') provider?: string) {
    return this.health.history(provider);
  }
}
