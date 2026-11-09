import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../platform/prisma.service.js';
import {
  publicRiskNotificationRouting,
  riskNotificationRouting,
  RISK_NOTIFICATION_SCOPE,
} from './notification-routes.js';

@Injectable()
export class RiskNotificationRoutingService {
  constructor(private readonly prisma: PrismaService) {}

  async read() {
    return publicRiskNotificationRouting(await riskNotificationRouting(this.prisma));
  }

  async save(providers: string[]) {
    return this.prisma.$transaction(async (tx) => {
      const current = await riskNotificationRouting(tx);
      if (providers.some((name) => !current.available.some((route) => route.provider === name))) {
        throw new BadRequestException({
          code: 'notification_provider_unavailable',
          message: '部分通知提供方当前不可用，请重新选择。',
        });
      }
      const saved = await tx.notificationRoutingPreference.upsert({
        where: { scope: RISK_NOTIFICATION_SCOPE },
        create: { scope: RISK_NOTIFICATION_SCOPE, providers },
        update: { providers },
      });
      return publicRiskNotificationRouting({ ...current, selectedProviders: saved.providers, updatedAt: saved.updatedAt.toISOString() });
    });
  }
}
