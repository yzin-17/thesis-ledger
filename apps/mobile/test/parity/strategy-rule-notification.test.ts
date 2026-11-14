import { describe, expect, it } from 'vitest';
import { riskForm, buildRiskInput } from '../../src/features/risk-rules/risk-rule-form';
import {
  emptyRiskNotification,
  riskNotificationBody,
} from '../../src/features/strategy-risk/risk-notification-model';
describe('Mobile 单条规则通知设置', () => {
  it('普通和策略规则默认均为 30，并保存具体提供方', () => {
    expect(emptyRiskNotification().cooldown).toBe('30');
    const form = { ...riskForm(), symbol: '600519.SH', threshold: '10', notificationProviders: ['备用飞书'], notificationCooldown: '0' };
    expect(buildRiskInput(form).notification).toEqual({ enabled: true, cooldownMinutes: 0, providers: ['备用飞书'] });
    expect(riskNotificationBody({ ...emptyRiskNotification(), enabled: true, providers: ['备用飞书'] })).toMatchObject({ cooldownMinutes: 30, providers: ['备用飞书'], channels: ['feishu'] });
  });
  it('序列化保留严重级别和零冷却，空输入继承默认配置', () => {
    expect(
      riskNotificationBody({
        ...emptyRiskNotification(),
        ruleOverrides: {
          stop: { severity: 'error', cooldown: '0' },
          holding: { cooldown: '' },
        },
      }).ruleOverrides,
    ).toEqual({ stop: { severity: 'error', cooldownMinutes: 0 } });
  });
  it.each(['-1', '1.5', '10081'])('拒绝非法冷却 %s', (cooldown) => {
    expect(() =>
      riskNotificationBody({ ...emptyRiskNotification(), ruleOverrides: { stop: { cooldown } } }),
    ).toThrow('单条规则冷却');
  });
});
