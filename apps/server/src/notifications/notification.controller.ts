import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  NotificationService,
  type NotificationMessage,
} from './notification.service.js';

@Controller('notifications')
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  list(@Query('status') status?: string) {
    return this.notifications.list(status);
  }

  @Post(':id/deliver/feishu')
  deliver(@Param('id') id: string, @Body() message: NotificationMessage) {
    return this.notifications.dispatchOne(id, new Date(), message);
  }
}
