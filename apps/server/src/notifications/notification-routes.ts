import { normalizeProviderCredential } from '../platform/credential-security.js';
import type { PrismaService } from '../platform/prisma.service.js';
import { detectFeishuWebhookUrl } from '../providers/feishu-webhook-security.js';

type NotificationRoutingStore = Pick<PrismaService, 'providerConfig' | 'notificationRoutingPreference'>;

export const RISK_NOTIFICATION_SCOPE = 'risk-event';

/** 完整候选仅在通知模块内携带凭证；对外响应必须显式投影。 */
export async function availableNotificationRoutes(prisma: NotificationRoutingStore) {
  const configs = await prisma.providerConfig.findMany({
    where: { type: 'notification', enabled: true },
    orderBy: [{ priority: 'asc' }, { name: 'asc' }],
  });
  const routes = [];
  for (const config of configs) {
    if (!config.encryptedCredentials) continue;
    try {
      const credential = normalizeProviderCredential(config.encryptedCredentials);
      if (!detectFeishuWebhookUrl(credential.credential.trim())) continue;
      routes.push({ channel: 'feishu', provider: config.name, priority: config.priority, ...credential });
    } catch {
      // 无法解密的配置不具备可投递资格，响应不泄露凭证信息。
    }
  }
  return routes;
}

export async function riskNotificationRouting(prisma: NotificationRoutingStore) {
  const [available, preference] = await Promise.all([
    availableNotificationRoutes(prisma),
    prisma.notificationRoutingPreference.findUnique({ where: { scope: RISK_NOTIFICATION_SCOPE } }),
  ]);
  const selectedProviders = preference?.providers ?? available.slice(0, 1).map((route) => route.provider);
  return {
    available,
    selectedProviders,
    updatedAt: preference?.updatedAt.toISOString() ?? null,
    routes: available.filter((route) => selectedProviders.includes(route.provider)).map((route) => ({
      ...route,
      legacyDefault: route.provider === available[0]?.provider,
    })),
  };
}

export function publicRiskNotificationRouting(result: Awaited<ReturnType<typeof riskNotificationRouting>>) {
  return {
    availableRoutes: result.available.map(({ channel, provider, priority }) => ({ channel, provider, priority })),
    selectedProviders: result.selectedProviders,
    updatedAt: result.updatedAt,
  };
}
