import { Module } from '@nestjs/common';
import { NotificationController } from '../notifications/notification.controller.js';
import { NotificationDispatcher } from '../notifications/notification.dispatcher.js';
import { NotificationService } from '../notifications/notification.service.js';
import { ProviderConfigController } from './provider-config.controller.js';
import { ProviderConfigService } from './provider-config.service.js';
import { ProviderHealthController } from './provider-health.controller.js';
import { ProviderHealthScheduler } from './provider-health.scheduler.js';
import { ProviderHealthService } from './provider-health.service.js';

@Module({
  controllers: [NotificationController, ProviderHealthController, ProviderConfigController],
  providers: [
    NotificationService,
    NotificationDispatcher,
    ProviderHealthService,
    ProviderHealthScheduler,
    ProviderConfigService,
  ],
  exports: [NotificationService, ProviderHealthService, ProviderConfigService],
})
export class ProviderModule {}
