import { expect, it } from 'vitest';
import { arenaAdjustLiveBudget, arenaBudgetCountLabel, arenaBudgetCostLabel } from '../src/arena-live-budget.js';

const unlimited = { requests: null, tokens: null, costMicros: null };
const reserved = { requests: 1, tokens: 1000, costMicros: 100 };
it('无限维度在预留、已知结算及未知耗用后仍为空，并可序列化', () => {
  for (const [used, refund] of [[null, false], [reserved, true], [null, true]] as const) {
    const result = arenaAdjustLiveBudget(unlimited, reserved, used, refund);
    expect(result).toEqual(unlimited); expect(JSON.stringify(result)).toBe('{"requests":null,"tokens":null,"costMicros":null}');
  }
});
it('混合额度只扣减有限维度，不修改原值，零额度及不足明确拒绝', () => {
  const mixed = { requests: 2, tokens: null, costMicros: 150 };
  expect(arenaAdjustLiveBudget(mixed, reserved, null, false)).toEqual({ requests: 1, tokens: null, costMicros: 50 });
  expect(mixed.costMicros).toBe(150);
  expect(() => arenaAdjustLiveBudget({ ...unlimited, requests: 0 }, reserved, null, false)).toThrow('participant_budget');
  expect(() => arenaAdjustLiveBudget({ ...unlimited, tokens: 999 }, reserved, null, false)).toThrow('participant_budget');
});
it('有限维度按实际耗用退回差额，未知耗用保留预留', () => {
  const held = { requests: 1, tokens: null, costMicros: 50 };
  expect(arenaAdjustLiveBudget(held, reserved, { requests: 1, tokens: 80, costMicros: 30 }, true)).toEqual({ requests: 1, tokens: null, costMicros: 120 });
  expect(arenaAdjustLiveBudget(held, reserved, null, true)).toEqual(held);
  expect(arenaAdjustLiveBudget(held, reserved, { requests: 0, tokens: 0, costMicros: 0 }, true)).toEqual({ requests: 2, tokens: null, costMicros: 150 });
});
it('显示区分不限额、零、次数和六位小数费用', () => {
  expect(arenaBudgetCountLabel(null, ' 次')).toBe('不限额');
  expect(arenaBudgetCountLabel(0, ' 次')).toBe('0 次');
  expect(arenaBudgetCostLabel(null, 'USD')).toBe('不限额');
  expect(arenaBudgetCostLabel(0, 'USD')).toBe('0 USD');
  expect(arenaBudgetCostLabel(1, 'USD')).toBe('0.000001 USD');
});
