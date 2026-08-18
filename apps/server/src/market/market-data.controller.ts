import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { DsaClient } from './dsa-client.js';
import { InstrumentService } from './instrument.service.js';
import { MarketControlService } from './market-control.service.js';

@Controller('market-data')
export class MarketDataController {
  constructor(
    private readonly control: MarketControlService,
    private readonly instruments: InstrumentService,
    private readonly dsa: DsaClient,
  ) {}

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

  @Get('instruments/search') search(@Query('q') query = '', @Query('limit') limit = '20') {
    return this.instruments.search(query, Number(limit));
  }

  @Post('instruments/:id/confirm') confirm(@Param('id') id: string) {
    return this.instruments.confirm(id);
  }

  @Get('instruments/associations') associations(@Query('symbol') symbol?: string) {
    return this.instruments.associations(symbol);
  }

  @Get('catalog/status') catalogStatus() {
    return this.instruments.latestGeneration();
  }

  @Post('catalog/sync') async syncCatalog() {
    const job = await this.dsa.triggerCatalogJob();
    if (job.status !== 'succeeded') return { ...job, acknowledged: false };
    const status = await this.instruments.latestGeneration();
    let synced;
    if (status.cursor) {
      try {
        synced = await this.instruments.applyCatalogDelta(
          await this.dsa.catalogDelta(status.cursor),
        );
      } catch {
        synced = await this.instruments.syncCatalog(await this.dsa.catalogSnapshot());
      }
    } else {
      synced = await this.instruments.syncCatalog(await this.dsa.catalogSnapshot());
    }
    await this.dsa.acknowledgeCatalog(synced.generation, synced.checksum);
    return { ...synced, job, acknowledged: true };
  }
}
