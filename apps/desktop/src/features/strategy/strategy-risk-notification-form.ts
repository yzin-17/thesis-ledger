import type { StrategyRiskNotification } from './strategy-optimization.api.js';
import type { RiskNotificationForm } from './StrategyRiskConfiguration.js';
import { parseCooldownMinutes } from './strategy-risk-application.model.js';

export type RuleNotificationDrafts = Record<
  string,
  {
    severity?: StrategyRiskNotification['severity'] | undefined;
    cooldownMinutes?: string;
  }
>;

export function ruleNotificationDrafts(
  notification: StrategyRiskNotification,
): RuleNotificationDrafts {
  return Object.fromEntries(
    Object.entries(notification.ruleOverrides ?? {}).map(([key, value]) => [
      key,
      {
        severity: value.severity,
        cooldownMinutes: value.cooldownMinutes === undefined ? '' : String(value.cooldownMinutes),
      },
    ]),
  );
}

export function buildRiskNotification(
  form: RiskNotificationForm,
  drafts: RuleNotificationDrafts,
): StrategyRiskNotification {
  const cooldown = parseCooldownMinutes(form.cooldownMinutes);
  if (cooldown === null) throw new Error('默认冷却时间必须是 0 到 10080 的整数');
  const ruleOverrides: NonNullable<StrategyRiskNotification['ruleOverrides']> = {};
  for (const [key, value] of Object.entries(drafts)) {
    const override: NonNullable<StrategyRiskNotification['ruleOverrides']>[string] = {};
    if (value.severity) override.severity = value.severity;
    if (value.cooldownMinutes?.trim()) {
      const minutes = parseCooldownMinutes(value.cooldownMinutes);
      if (minutes === null) throw new Error('单条规则冷却时间必须是 0 到 10080 的整数');
      override.cooldownMinutes = minutes;
    }
    if (Object.keys(override).length) ruleOverrides[key] = override;
  }
  let useChannel = Boolean(form.channel);
  if (form.providers !== undefined) useChannel = form.providers.length > 0;
  return {
    enabled: form.enabled,
    severity: form.severity,
    cooldownMinutes: cooldown,
    channels: form.enabled && useChannel ? ['feishu'] : [],
    ...(form.providers === undefined ? {} : { providers: form.providers }),
    ...(Object.keys(ruleOverrides).length ? { ruleOverrides } : {}),
  };
}
