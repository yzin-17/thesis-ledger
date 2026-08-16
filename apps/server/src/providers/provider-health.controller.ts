import { Controller, Get, Post, Query } from '@nestjs/common';
import { ProviderHealthService } from './provider-health.service.js';

const parsePositiveInteger = (value?: string) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

@Controller('providers')
export class ProviderHealthController {
  constructor(private readonly health: ProviderHealthService) {}

  @Get('health')
  list() {
    return this.health.list();
  }

  @Post('health/check')
  check() {
    return this.health.checkAll('manual');
  }

  @Get('health/history')
  history(
    @Query('provider') provider?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.health.history(
      provider,
      parsePositiveInteger(page),
      parsePositiveInteger(pageSize),
    );
  }
}
