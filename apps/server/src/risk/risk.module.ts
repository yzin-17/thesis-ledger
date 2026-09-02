import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { RiskContextService } from './risk-context.service.js';
import { RiskController } from './risk.controller.js';
import { RiskEventService } from './risk-event.service.js';
import { RiskRuleService } from './risk-rule.service.js';
import { RiskService } from './risk.service.js';

@Module({
  imports: [NotificationsModule],
  controllers: [RiskController],
  providers: [RiskRuleService, RiskContextService, RiskEventService, RiskService],
  exports: [RiskService],
})
export class RiskModule {}
