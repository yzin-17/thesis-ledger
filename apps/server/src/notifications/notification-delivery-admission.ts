import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../platform/prisma.service.js';

/** 风险按提供方幂等；其它主题保留原有事件与渠道身份。 */
export function admitNotificationDeliveries(
  prisma: PrismaService,
  admissions: Prisma.NotificationDeliveryCreateInput[],
  risk: boolean,
) {
  const upsert = (store: Pick<PrismaService, 'notificationDelivery'>, data: Prisma.NotificationDeliveryCreateInput) =>
    store.notificationDelivery.upsert({
      where: { dedupKey_channel_provider: { dedupKey: data.dedupKey, channel: data.channel, provider: data.provider } },
      update: {}, create: data,
    });
  if (risk) return prisma.$transaction(admissions.map((data) => upsert(prisma, data)));
  return prisma.$transaction(async (tx) => {
    const deliveries = [];
    for (const data of admissions) {
      const identity = JSON.stringify([data.dedupKey, data.channel]);
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${identity}, 0))::text`;
      const frozen = await tx.notificationDelivery.findFirst({
        where: { dedupKey: data.dedupKey, channel: data.channel },
      });
      deliveries.push(frozen ?? await upsert(tx, data));
    }
    return deliveries;
  });
}
