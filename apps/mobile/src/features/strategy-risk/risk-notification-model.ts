import type { StrategyRiskNotificationInput } from '@thesis-ledger/schemas';
export type RiskNotificationForm = {
  enabled: boolean;
  cooldown: string;
  severity: StrategyRiskNotificationInput['severity'];
  feishu: boolean;
};
export const emptyRiskNotification = (): RiskNotificationForm => ({
  enabled: false,
  cooldown: '60',
  severity: 'warning',
  feishu: false,
});
export function riskNotificationBody(value: RiskNotificationForm): StrategyRiskNotificationInput {
  if (!/^\d+$/.test(value.cooldown) || !Number.isSafeInteger(Number(value.cooldown)))
    throw Error('通知冷却分钟必须是整数。');
  return {
    enabled: value.enabled,
    cooldownMinutes: Number(value.cooldown),
    severity: value.severity,
    channels: value.feishu ? ['feishu'] : [],
  };
}
