import { BadRequestException } from '@nestjs/common';
import { availableNotificationRoutes, riskNotificationRouting } from './notification-routes.js';

type RoutingStore = Parameters<typeof availableNotificationRoutes>[0];

export async function assertRiskNotificationSelection(
  db: RoutingStore,
  notification?: { enabled: boolean; providers?: string[] | undefined },
) {
  if (!notification?.enabled || !notification.providers?.length) return;
  const available = await availableNotificationRoutes(db);
  if (notification.providers.some((name) => !available.some((route) => route.provider === name)))
    throw new BadRequestException({
      code: 'notification_provider_unavailable',
      message: '部分通知提供方当前不可用，请重新选择。',
    });
}

export async function selectedRiskNotificationRoutes(db: RoutingStore, providers?: string[]) {
  if (providers === undefined) return (await riskNotificationRouting(db)).routes;
  if (providers.length === 0) return [];
  return (await availableNotificationRoutes(db))
    .filter((route) => providers.includes(route.provider))
    .map((route) => ({ ...route, legacyDefault: false }));
}
