import { expect, it } from 'vitest';
import { planLiveCall } from '../../src/model-arena/live/live-call-limits.js';

const unlimited = { requests: null, tokens: null, costMicros: null };
const input = { inputEstimate: 1000, maxInputTokens: null, maxOutputTokens: null, inputPrice: 0.001, outputPrice: 0.002,
  agent: unlimited, match: unlimited, upstreamOutput: false };
it('没有单次或总令牌费用限制时，输出上限为空，仍预留并审计已知输入', () => {
  expect(planLiveCall(input)).toEqual({ amount: { requests: 1, tokens: 1000, costMicros: 1000 }, inputTokens: 1000, outputTokens: null });
  expect(planLiveCall({ ...input, upstreamOutput: true }).outputTokens).toBeNull();
});
it('单次限制保留原数值，输入超限拒绝；费用以精确小数向上预留', () => {
  expect(() => planLiveCall({ ...input, maxInputTokens: 999 })).toThrow('input_limit');
  expect(planLiveCall({ ...input, maxInputTokens: 1200, maxOutputTokens: 10, outputPrice: 0.0000011 }))
    .toMatchObject({ amount: { tokens: 1210, costMicros: 1201 }, outputTokens: 10 });
});
it('无限单次输出取模型与比赛剩余令牌、费用中最紧的边界', () => {
  const agent = { ...unlimited, tokens: 1500 }, match = { ...unlimited, costMicros: 1601 };
  expect(planLiveCall({ ...input, agent, match })).toMatchObject({ outputTokens: 300, amount: { tokens: 1300, costMicros: 1600 } });
  expect(planLiveCall({ ...input, agent: { ...unlimited, tokens: 1200 }, match })).toMatchObject({ outputTokens: 200 });
});
it('零价输出不会因有限费用伪造输出上限；有限令牌仍生效', () => {
  const match = { ...unlimited, costMicros: 1000 };
  expect(planLiveCall({ ...input, outputPrice: 0, match }).outputTokens).toBeNull();
  expect(planLiveCall({ ...input, outputPrice: 0, match: { ...match, tokens: 1234 } }).outputTokens).toBe(234);
});
it.each([
  [{ ...unlimited, requests: 0 }, unlimited, 'participant_budget'],
  [unlimited, { ...unlimited, tokens: 1000 }, 'competition_budget'],
  [{ ...unlimited, costMicros: 1001 }, unlimited, 'participant_budget'],
] as const)('无法支付输入和至少一个输出令牌时出站前拒绝', (agent, match, reason) => {
  expect(() => planLiveCall({ ...input, agent, match })).toThrow(reason);
});
it('显式或预算推导出的输出边界不能被上游托管路由忽略', () => {
  expect(() => planLiveCall({ ...input, upstreamOutput: true, maxOutputTokens: 20 })).toThrow('output_limit_unsupported');
  expect(() => planLiveCall({ ...input, upstreamOutput: true, match: { ...unlimited, tokens: 1200 } })).toThrow('output_limit_unsupported');
});
it('不可精确表达的费用边界明确失败，不用占位大数绕过', () => {
  expect(() => planLiveCall({ ...input, outputPrice: 1e-20, match: { ...unlimited, costMicros: 1001 } })).toThrow('request_limit_unrepresentable');
});
