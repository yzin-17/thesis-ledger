import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { notificationMessageSchema, riskNotificationRoutingInputSchema } from '@thesis-ledger/schemas';
import { z } from 'zod';
import { NotificationService } from './notification.service.js';
import { RiskNotificationRoutingService } from './risk-notification-routing.service.js';

const notificationDeliveryMessageSchema = notificationMessageSchema.extend({
  severity: z.enum(['info', 'warning', 'error', 'critical']),
  traceId: z.string().trim().min(1),
});

@Controller('notifications')
export class NotificationController {
  constructor(
    private readonly notifications: NotificationService,
    private readonly riskRouting: RiskNotificationRoutingService,
  ) {}

  @Get()
  list(@Query('status') status?: string) {
    return this.notifications.list(status);
  }

  @Get('routing')
  routing() {
    return this.notifications.routing();
  }

  @Get('routing/risk')
  riskNotificationRouting() {
    return this.riskRouting.read();
  }

  @Put('routing/risk')
  saveRiskNotificationRouting(@Body() input: unknown) {
    return this.riskRouting.save(riskNotificationRoutingInputSchema.parse(input).providers);
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
