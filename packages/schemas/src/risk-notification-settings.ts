import { z } from 'zod';

export const DEFAULT_RISK_NOTIFICATION_COOLDOWN_MINUTES = 30;
export const riskNotificationCooldownSchema = z.number().int().min(0).max(10_080);
export const riskNotificationProvidersSchema = z
  .array(z.string().trim().min(1))
  .max(100)
  .refine((providers) => new Set(providers).size === providers.length, '通知提供方不能重复');
export const riskRuleNotificationSchema = z
  .object({
    enabled: z.boolean().default(true),
    cooldownMinutes: riskNotificationCooldownSchema.default(
      DEFAULT_RISK_NOTIFICATION_COOLDOWN_MINUTES,
    ),
    providers: riskNotificationProvidersSchema.optional(),
  })
  .strict();
export type RiskRuleNotification = z.infer<typeof riskRuleNotificationSchema>;

/** 旧规则未包含通知设置时只投影默认值，不回写历史参数。 */
export function riskRuleNotificationFromParameters(parameters: unknown): RiskRuleNotification {
  const record =
    parameters && typeof parameters === 'object' ? (parameters as Record<string, unknown>) : {};
  const value =
    record.notification && typeof record.notification === 'object'
      ? (record.notification as Record<string, unknown>)
      : {};
  return riskRuleNotificationSchema.parse({
    ...(value.enabled === undefined ? {} : { enabled: value.enabled }),
    ...(value.cooldownMinutes === undefined ? {} : { cooldownMinutes: value.cooldownMinutes }),
    ...(value.providers === undefined ? {} : { providers: value.providers }),
  });
}
