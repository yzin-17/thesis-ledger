import { riskApplicationNotificationSchema } from '@thesis-ledger/schemas';

/** 应用通知开关和渠道共享，严重级别与冷却时间按规则分别继承。 */
export function strategyRiskNotification(value: unknown, sourceKey?: string) {
  const notification = riskApplicationNotificationSchema.parse(value ?? {});
  const override = sourceKey ? notification.ruleOverrides?.[sourceKey] : undefined;
  return {
    ...notification,
    severity: override?.severity ?? notification.severity,
    cooldownMinutes: override?.cooldownMinutes ?? notification.cooldownMinutes,
  };
}

export function strategyRiskNotificationForPlan(value: unknown, rules: { sourceKey: string }[]) {
  const notification = strategyRiskNotification(value);
  if (!notification.ruleOverrides) return notification;
  const keys = new Set(rules.map((rule) => rule.sourceKey));
  return {
    ...notification,
    ruleOverrides: Object.fromEntries(
      Object.entries(notification.ruleOverrides).filter(([key]) => keys.has(key)),
    ),
  };
}

export function strategyRiskRuleParameters(value: unknown, revision: number, sourceKey?: string) {
  const notification = strategyRiskNotification(value, sourceKey);
  return {
    applicationRevision: revision,
    notification: {
      enabled: notification.enabled,
      cooldownMinutes: notification.cooldownMinutes,
      ...(notification.providers === undefined ? {} : { providers: notification.providers }),
    },
  };
}
