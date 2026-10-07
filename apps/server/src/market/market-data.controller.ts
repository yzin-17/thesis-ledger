import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Optional,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { DsaClient } from '../integration/dsa/dsa.client.js';
import { CatalogReadinessService } from './catalog-readiness.service.js';
import { InstrumentService } from './instrument.service.js';
import { MarketControlService } from './market-control.service.js';
import { assertProviderControlEnvelope } from './market-provider-input.js';
import { assertCatalogSyncInput } from './market-catalog-input.js';

@Controller('api/market-data')
export class MarketDataController {
  constructor(
    @Inject(MarketControlService)
    private readonly control: MarketControlService,
    @Inject(InstrumentService)
    private readonly instruments: InstrumentService,
    @Inject(DsaClient)
    private readonly dsa: DsaClient,
    @Optional() private readonly catalogReadiness?: CatalogReadinessService,
  ) {}

  private readiness() {
    return this.catalogReadiness ?? new CatalogReadinessService(this.instruments, this.dsa);
  }

  @Get('policy') policy() {
    return this.control.getPolicy();
  }

  @Get('routes/capabilities')
  @Header('Cache-Control', 'no-store')
  routeCapabilities(@Query('contractVersion') contractVersion?: string) {
    if (contractVersion !== '3') throw new BadRequestException('contractVersion 必须为 3');
    return this.control.routeCapabilitiesV3();
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

  @Post('providers/:providerId/remove') removeProvider(
    @Param('providerId') providerId: string,
    @Body() body: unknown,
  ) {
    return this.control.removeProvider(providerId, body);
  }

  @Post('providers/longbridge/oauth/sessions')
  @Header('Cache-Control', 'no-store')
  createProviderOAuth(@Body() body: unknown) {
    const input = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
    if (
      typeof input.clientId !== 'string' ||
      !input.clientId.trim() ||
      Object.keys(input).some((key) => key !== 'clientId')
    )
      throw new BadRequestException('请提供有效的 Client ID');
    return this.dsa.longbridgeOAuth({ kind: 'create', clientId: input.clientId.trim() });
  }

  @Get('providers/longbridge/oauth/sessions/current')
  @Header('Cache-Control', 'no-store')
  currentProviderOAuth() {
    return this.dsa.longbridgeOAuth({ kind: 'current' });
  }

  @Get('providers/longbridge/oauth/sessions/:sessionId')
  @Header('Cache-Control', 'no-store')
  getProviderOAuth(@Param('sessionId') sessionId: string) {
    return this.dsa.longbridgeOAuth({ kind: 'get', sessionId });
  }

  @Post('providers/longbridge/oauth/sessions/:sessionId/cancel')
  @Header('Cache-Control', 'no-store')
  cancelProviderOAuth(@Param('sessionId') sessionId: string, @Body() body?: unknown) {
    assertProviderControlEnvelope(body);
    return this.dsa.longbridgeOAuth({ kind: 'cancel', sessionId });
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

  @Post('catalog/sync') async syncCatalog(@Body() body?: unknown) {
    assertCatalogSyncInput(body);
    return this.readiness().triggerAndProject();
  }
}
