import { describe, expect, it, vi } from 'vitest';
import type { AiCostFacts } from '@thesis-ledger/schemas';
import { liveCallCostMicros } from '../../src/model-arena/live/live-call-cost.js';
import { LiveResearchCall } from '../../src/model-arena/live/live-research-call.js';
import { liveProtocolFixture } from './live-fixture.js';

const cost = (amount: string | null, currency: string | null, status: AiCostFacts['status'] = 'estimated'): AiCostFacts => ({
  amount, currency, status, source: 'configured_model_pricing', pricingVersion: 'controlled',
});
describe('模型费用在比赛预算中的扣减', () => {
  it.each([undefined, { costPer1kInput: 0, costPer1kOutput: 0 },
    { costPer1kInput: 0.1, costPer1kOutput: 0, costCurrency: 'USD' },
    { costPer1kInput: 0, costPer1kOutput: 0.1, costCurrency: 'USD' }])('未明确完整零费率或非零异币种仍在出站前拒绝：%j', async (pricing) => {
    const p = liveProtocolFixture({ budgetCurrency: 'CNY' }), entrant = p.entrants[0]!;
    const db = { $queryRaw: vi.fn().mockResolvedValueOnce([{ state: 'running', attempt: 1, leaseUntil: new Date(Date.now() + 60000), matchId: 'match', agentId: 'agent' }])
      .mockResolvedValueOnce([{ id: 'match', protocol: p }]).mockResolvedValueOnce([{ id: 'agent', providerId: entrant.providerId, model: entrant.model }]) };
    const registry = { strictReadyContract: vi.fn(() => ({ provider: { metadata: { modelPricing: { [entrant.model]: pricing } }, sdkRuntime: () => ({ baseURL: 'http://127.0.0.1:1', apiKey: '' }) } })) };
    const sdk = { generate: vi.fn() }, budget = { reserve: vi.fn() };
    await expect(new LiveResearchCall(db as never, registry as never, sdk, budget as never).generate('cycle', 1, [])).rejects.toThrow('unknown_pricing');
    expect(sdk.generate).not.toHaveBeenCalled(); expect(budget.reserve).not.toHaveBeenCalled();
  });
  it('明确零金额跨币种仍为零，费用原币种保持不变', () => {
    const original = cost('0', 'USD');
    expect(liveCallCostMicros(original, 'CNY')).toBe(0);
    expect(original).toEqual(cost('0', 'USD'));
  });
  it('非零异币种及未知费用保持不可计费，极小非零值不当成零', () => {
    expect(liveCallCostMicros(cost('0.000000000000000000001', 'USD'), 'CNY')).toBeNull();
    expect(liveCallCostMicros(cost(null, null, 'unknown'), 'CNY')).toBeNull();
    expect(liveCallCostMicros(cost('0', null), 'CNY')).toBeNull();
  });
  it('相同币种按原始小数向上计微单位，超安全整数范围保持未知', () => {
    expect(liveCallCostMicros(cost('0.000000000000000000001', 'CNY'), 'CNY')).toBe(1);
    expect(liveCallCostMicros(cost('0.1234561', 'CNY'), 'CNY')).toBe(123457);
    expect(liveCallCostMicros(cost('99999999999999999999', 'CNY'), 'CNY')).toBeNull();
  });
});
