import { BadRequestException, Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { loadConfig } from '../platform/config.js';
import {
  FeishuWebhookProvider,
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
    const webhook = loadConfig().feishuWebhookUrl;
    if (!webhook) throw new BadRequestException('未配置 FEISHU_WEBHOOK_URL');
    return this.notifications.deliver(id, message, new FeishuWebhookProvider(webhook));
  }
}
