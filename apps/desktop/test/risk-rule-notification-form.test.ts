import { describe, expect, it } from 'vitest';
import {
  riskRuleNotificationForm,
  parseRuleNotificationForm,
} from '../src/features/risk/risk-rule-notification-form';
import { precisionRiskRule } from './risk-threshold.fixture';
import { buildRiskNotification } from '../src/features/strategy/strategy-risk-notification-form';

describe('普通与策略规则通知表单统一', () => {
  it('新建默认 30，显式保存的冷却和提供方回显不变', () => {
    expect(riskRuleNotificationForm(null)).toEqual({
      enabled: true,
      cooldownMinutes: '30',
      providers: [],
    });
    const rule = {
      ...precisionRiskRule(),
      notification: { enabled: true, cooldownMinutes: 120, providers: ['甲', '乙'] },
    };
    expect(parseRuleNotificationForm(riskRuleNotificationForm(rule))).toEqual(rule.notification);
  });
  it('明确零、空提供方和策略提供方身份都保留', () => {
    expect(
      parseRuleNotificationForm({ enabled: false, cooldownMinutes: '0', providers: [] }),
    ).toEqual({ enabled: false, cooldownMinutes: 0, providers: [] });
    expect(
      buildRiskNotification(
        {
          enabled: true,
          severity: 'warning',
          cooldownMinutes: '30',
          channel: '',
          providers: ['备用飞书'],
        },
        {},
      ),
    ).toMatchObject({ providers: ['备用飞书'], channels: ['feishu'], cooldownMinutes: 30 });
  });
  it.each(['', '-1', '1.5', '10081'])('拒绝非法冷却 %s', (cooldownMinutes) => {
    expect(() =>
      parseRuleNotificationForm({ enabled: true, cooldownMinutes, providers: [] }),
    ).toThrow('通知冷却时间');
  });
});
