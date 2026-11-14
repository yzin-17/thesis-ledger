import {
  DEFAULT_RISK_NOTIFICATION_COOLDOWN_MINUTES,
  riskRuleNotificationSchema,
  riskRuleNotificationFromParameters,
  type RiskRuleNotification,
} from '@thesis-ledger/schemas';
import type { RiskRuleRecord } from './risk.types.js';

export type RuleNotificationForm = {
  enabled: boolean;
  cooldownMinutes: string;
  providers?: string[] | undefined;
};
export function riskRuleNotificationForm(rule: RiskRuleRecord | null): RuleNotificationForm {
  const value =
    rule?.notification ??
    riskRuleNotificationFromParameters(rule && 'parameters' in rule ? rule.parameters : undefined);
  return {
    enabled: value.enabled,
    cooldownMinutes: String(value.cooldownMinutes ?? DEFAULT_RISK_NOTIFICATION_COOLDOWN_MINUTES),
    providers: rule ? value.providers : [],
  };
}
export function parseRuleNotificationForm(value: RuleNotificationForm): RiskRuleNotification {
  if (!value.cooldownMinutes.trim()) throw new Error('通知冷却时间必须是 0 到 10080 的整数。');
  const parsed = riskRuleNotificationSchema.safeParse({
    ...value,
    cooldownMinutes: Number(value.cooldownMinutes),
  });
  if (!parsed.success)
    throw new Error('通知冷却时间必须是 0 到 10080 的整数，通知提供方不能重复。');
  return parsed.data;
}

export function riskRuleNotificationErrors(value?: RuleNotificationForm): {
  notification?: string;
} {
  if (!value) return {};
  try {
    parseRuleNotificationForm(value);
    return {};
  } catch (error) {
    return { notification: (error as Error).message };
  }
}
