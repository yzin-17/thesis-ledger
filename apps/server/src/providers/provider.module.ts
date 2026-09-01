import { Module } from '@nestjs/common';
import { DsaModule } from '../integration/dsa/dsa.module.js';
import { ProviderConfigController } from './provider-config.controller.js';
import { ProviderConfigService } from './provider-config.service.js';
import { ProviderHealthController } from './provider-health.controller.js';
import { ProviderHealthScheduler } from './provider-health.scheduler.js';
import { ProviderHealthService } from './provider-health.service.js';

@Module({
  imports: [DsaModule],
  controllers: [ProviderHealthController, ProviderConfigController],
  providers: [
    ProviderHealthService,
    ProviderHealthScheduler,
    ProviderConfigService,
  ],
  exports: [ProviderHealthService, ProviderConfigService],
})
export class ProviderModule {}
