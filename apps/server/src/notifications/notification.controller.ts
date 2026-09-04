import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { notificationMessageSchema } from '@thesis-ledger/schemas';
import { z } from 'zod';
import { NotificationService } from './notification.service.js';

const notificationDeliveryMessageSchema = notificationMessageSchema.extend({
  severity: z.enum(['info', 'warning', 'error', 'critical']),
  traceId: z.string().trim().min(1),
});

@Controller('notifications')
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  list(@Query('status') status?: string) {
    return this.notifications.list(status);
  }

  @Get('routing')
  routing() {
    return this.notifications.routing();
  }

  @Post(':id/deliver/feishu')
  deliver(@Param('id') id: string, @Body() input: unknown) {
    return this.notifications.dispatchOne(
      id,
      new Date(),
      notificationDeliveryMessageSchema.parse(input),
    );
  }
}
