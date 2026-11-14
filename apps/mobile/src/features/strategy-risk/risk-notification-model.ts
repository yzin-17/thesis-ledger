import { DEFAULT_RISK_NOTIFICATION_COOLDOWN_MINUTES, type StrategyRiskNotificationInput } from '@thesis-ledger/schemas';
export type RiskNotificationForm = {
  enabled: boolean;
  cooldown: string;
  severity: StrategyRiskNotificationInput['severity'];
  feishu: boolean;
  providers?: string[] | undefined;
  ruleOverrides?: Record<string, { severity?: StrategyRiskNotificationInput['severity'] | undefined; cooldown?: string }>;
};
export const emptyRiskNotification = (): RiskNotificationForm => ({
  enabled: false,
  cooldown: String(DEFAULT_RISK_NOTIFICATION_COOLDOWN_MINUTES),
  severity: 'warning',
  feishu: false,
  providers: [],
});
export function riskNotificationBody(value: RiskNotificationForm): StrategyRiskNotificationInput {
  if (!/^\d+$/.test(value.cooldown) || !Number.isSafeInteger(Number(value.cooldown)))
    throw Error('通知冷却分钟必须是整数。');
  const ruleOverrides: NonNullable<StrategyRiskNotificationInput['ruleOverrides']> = {};
  for (const [key, draft] of Object.entries(value.ruleOverrides ?? {})) {
    if (draft.cooldown?.trim() && (!/^\d+$/.test(draft.cooldown) || Number(draft.cooldown) > 10080))
      throw Error('单条规则冷却分钟必须是 0 到 10080 的整数。');
    if (draft.severity || draft.cooldown?.trim()) ruleOverrides[key] = {
      ...(draft.severity ? { severity: draft.severity } : {}),
      ...(draft.cooldown?.trim() ? { cooldownMinutes: Number(draft.cooldown) } : {}),
    };
  }
  let channels: StrategyRiskNotificationInput['channels'] = [];
  if (value.providers === undefined) {
    if (value.feishu) channels = ['feishu'];
  } else if (value.providers.length > 0) channels = ['feishu'];
  return {
    enabled: value.enabled,
    cooldownMinutes: Number(value.cooldown),
    severity: value.severity,
    channels,
    ...(value.providers === undefined ? {} : { providers: value.providers }),
    ...(Object.keys(ruleOverrides).length ? { ruleOverrides } : {}),
  };
}
