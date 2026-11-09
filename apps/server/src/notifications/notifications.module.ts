import { Module } from '@nestjs/common';
import { ProviderModule } from '../providers/provider.module.js';
import { NotificationController } from './notification.controller.js';
import { NotificationDispatcher } from './notification.dispatcher.js';
import { NotificationService } from './notification.service.js';
import { RiskNotificationRoutingService } from './risk-notification-routing.service.js';

@Module({
  imports: [ProviderModule],
  controllers: [NotificationController],
  providers: [NotificationService, NotificationDispatcher, RiskNotificationRoutingService],
  exports: [NotificationService],
})
export class NotificationsModule {}
