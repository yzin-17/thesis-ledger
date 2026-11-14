import { describe, expect, it } from 'vitest';
import {
  buildRiskNotification,
  ruleNotificationDrafts,
} from '../src/features/strategy/strategy-risk-notification-form';
const defaults = {
  enabled: true,
  severity: 'warning' as const,
  cooldownMinutes: '60',
  channel: 'feishu',
};
describe('逐条规则通知表单', () => {
  it('保留独立严重级别和零冷却，空值恢复继承，并可无损回显', () => {
    const result = buildRiskNotification(defaults, {
      stop: { severity: 'error', cooldownMinutes: '0' },
      holding: { cooldownMinutes: '' },
    });
    expect(result.ruleOverrides).toEqual({ stop: { severity: 'error', cooldownMinutes: 0 } });
    expect(buildRiskNotification(defaults, ruleNotificationDrafts(result))).toEqual(result);
    expect(buildRiskNotification(defaults, {}).ruleOverrides).toBeUndefined();
  });
  it.each(['-1', '0.5', '10081', 'NaN'])('拒绝非法规则冷却时间 %s', (cooldownMinutes) => {
    expect(() => buildRiskNotification(defaults, { stop: { cooldownMinutes } })).toThrow(
      '单条规则冷却时间',
    );
  });
});
