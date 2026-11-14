import { describe, expect, it } from 'vitest';
import {
  riskApplicationNotificationSchema,
  riskRuleInputSchema,
  riskRuleNotificationSchema,
  riskRuleNotificationFromParameters,
} from '../src/index.js';

describe('风险通知统一契约', () => {
  it('默认统一 30，保留明确的零和已有值', () => {
    expect(riskRuleNotificationSchema.parse({}).cooldownMinutes).toBe(30);
    expect(riskApplicationNotificationSchema.parse({}).cooldownMinutes).toBe(30);
    expect(
      riskRuleNotificationFromParameters({ notification: { cooldownMinutes: 0, providers: [] } }),
    ).toMatchObject({ cooldownMinutes: 0, providers: [] });
    expect(riskApplicationNotificationSchema.parse({ cooldownMinutes: 60 }).cooldownMinutes).toBe(
      60,
    );
  });
  it.each([-1, 1.5, 10081, '30', null])('拒绝非法冷却 %s', (cooldownMinutes) => {
    expect(riskRuleNotificationSchema.safeParse({ cooldownMinutes }).success).toBe(false);
  });
  it('拒绝重复提供方及参数路径中的非法设置', () => {
    expect(riskRuleNotificationSchema.safeParse({ providers: ['a', 'a'] }).success).toBe(false);
    expect(
      riskRuleInputSchema.safeParse({
        kind: 'price-below',
        scope: 'security',
        severity: 'warning',
        threshold: 10,
        symbol: '600519.SH',
        parameters: { notification: { cooldownMinutes: -1 } },
      }).success,
    ).toBe(false);
  });
});
