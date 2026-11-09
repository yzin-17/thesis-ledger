import { describe, expect, it } from 'vitest';
import {
  backtestModelResolutionRequestSchema,
  backtestModelResolutionResultSchema,
} from '../src/index.js';
const request = {
  strategyVersionId: '11111111-1111-4111-8111-111111111111',
  startDate: '2024-01-02',
  endDate: '2024-03-29',
  currency: 'CNY',
  adjustment: 'none',
};
describe('普通回测自动执行配置契约', () => {
  it('只需保存的版本、日期、币种和价格口径', () => {
    expect(backtestModelResolutionRequestSchema.parse(request)).toEqual({
      ...request,
      policy: 'research-defaults',
    });
  });
  it('反向日期不发起读取，缺失来源以具体业务原因返回', () => {
    expect(
      backtestModelResolutionRequestSchema.safeParse({ ...request, endDate: '2024-01-01' }).success,
    ).toBe(false);
    expect(
      backtestModelResolutionResultSchema.parse({
        status: 'blocked',
        reasonCode: 'rules-unavailable',
        message: '所选区间缺少市场规则。',
      }),
    ).toHaveProperty('message', '所选区间缺少市场规则。');
  });
});
