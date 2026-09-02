import { Body, Controller, Get, Optional, Param, Post, Put, Query } from '@nestjs/common';
import { DsaClient } from '../integration/dsa/dsa.client.js';
import { CatalogReadinessService } from './catalog-readiness.service.js';
import { InstrumentService } from './instrument.service.js';
import { MarketControlService } from './market-control.service.js';

@Controller('market-data')
export class MarketDataController {
  constructor(
    private readonly control: MarketControlService,
    private readonly instruments: InstrumentService,
    private readonly dsa: DsaClient,
    @Optional() private readonly catalogReadiness?: CatalogReadinessService,
  ) {}

  private readiness() {
    return this.catalogReadiness ?? new CatalogReadinessService(this.instruments, this.dsa);
  }

  @Get('policy') policy() {
    return this.control.getPolicy();
  }

  @Put('policy') applyPolicy(@Body() body: unknown) {
    return this.control.applyPolicy(body);
  }

  @Post('policy/retry') retryPolicy() {
    return this.control.retryLatest();
  }

  @Post('policy/rollback/:revision') rollbackPolicy(@Param('revision') revision: string) {
    return this.control.rollback(Number(revision));
  }

  @Get('providers') providers() {
    return this.control.providers();
  }

  @Post('providers/:providerId/config') saveProvider(
    @Param('providerId') providerId: string,
    @Body() body: unknown,
  ) {
    return this.control.saveProvider(providerId, body);
  }

  @Post('providers/:providerId/test') testProvider(
    @Param('providerId') providerId: string,
    @Body() body: unknown,
  ) {
    return this.control.testProvider(providerId, body);
  }

  @Post('providers/:providerId/remove') removeProvider(@Param('providerId') providerId: string) {
    return this.control.removeProvider(providerId);
  }

  @Get('instruments/search') async search(@Query('q') query = '', @Query('limit') limit = '20') {
    if (!query.trim()) return [];
    await this.readiness().ensureReady();
    return this.instruments.search(query, Number(limit));
  }

  @Post('instruments/:id/confirm') confirm(@Param('id') id: string) {
    return this.instruments.confirm(id);
  }

  @Get('instruments/associations') associations(@Query('symbol') symbol?: string) {
    return this.instruments.associations(symbol);
  }

  @Get('catalog/status') catalogStatus() {
    return this.readiness().status();
  }

  @Get('catalog/jobs/:jobId') async catalogJob(@Param('jobId') jobId: string) {
    const job = await this.dsa.catalogJob(jobId);
    if (job.status !== 'succeeded') return { ...job, acknowledged: false };
    return { ...job, ...(await this.readiness().projectSucceededJob(job)) };
  }

  @Post('catalog/sync') async syncCatalog() {
    return this.readiness().triggerAndProject();
  }
}
