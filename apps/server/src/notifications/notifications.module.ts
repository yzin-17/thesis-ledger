import { Module } from '@nestjs/common';
import { ProviderModule } from '../providers/provider.module.js';
import { NotificationController } from './notification.controller.js';
import { NotificationDispatcher } from './notification.dispatcher.js';
import { NotificationService } from './notification.service.js';

@Module({
  imports: [ProviderModule],
  controllers: [NotificationController],
  providers: [NotificationService, NotificationDispatcher],
  exports: [NotificationService],
})
export class NotificationsModule {}
