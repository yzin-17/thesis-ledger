import { expect, it } from 'vitest';
import { arenaLiveDecisionSchema, arenaLiveProtocolSchema } from '../src/arena-live-protocol.js';
import { arenaLiveBudgetSchema, arenaLiveRemainingBudgetSchema } from '../src/arena-live-budget.js';

const budget = { requests: 20, tokens: 100000, costMicros: 1000000 };
const protocol = {
  version: 2, title: '自主比赛', market: 'US', currency: 'USD', timeZone: 'America/New_York',
  calendarId: 'NASDAQ', calendarVersion: 'fixture', startsOn: '2026-11-12', endsOn: '2026-12-01',
  universe: 'market', instruments: [], allowWebSearch: false, initialCash: '100000',
  entrants: ['甲', '乙'].map((model) => ({ model, providerId: 'fixture', budget, maxInputTokens: 10000, maxOutputTokens: 2000 })),
  maxPositionBps: 5000, fees: { version: 'fixture', buyBps: 2, sellBps: 2, minimum: '1', slippageBps: 1 },
  benchmarks: ['cash'], decisionDeadlineMinutes: 10, maxInfrastructureAttempts: 2, budgetCurrency: 'USD', budget,
  resources: { maxActiveSymbols: 50, maxResearchSteps: 20, maxCycleSeconds: 300, quoteIntervalSeconds: 30, maxQuoteAgeSeconds: 60 },
};
it('自主单次上限可独立省略或为空，零仍无效；可选配置采用共享默认值', () => {
  const p = arenaLiveProtocolSchema.parse({ ...protocol, title: undefined, initialCash: undefined, maxPositionBps: undefined,
    fees: { buyBps: 0 }, resources: { maxResearchSteps: 5 }, allowWebSearch: undefined, budgetCurrency: undefined,
    entrants: protocol.entrants.map(({ model, providerId }) => ({ model, providerId })) });
  expect(p).toMatchObject({ title: '自主模型比赛', initialCash: '100000', maxPositionBps: 5000, allowWebSearch: false, budgetCurrency: 'USD',
    resources: { maxResearchSteps: 5, maxCycleSeconds: null }, fees: { buyBps: 0, sellBps: 0, minimum: '0', slippageBps: 0 } });
  expect(p.entrants[0]).toMatchObject({ maxInputTokens: null, maxOutputTokens: null });
  expect(arenaLiveProtocolSchema.parse({ ...protocol, fees: undefined, resources: undefined }).resources).toMatchObject({ maxQuoteAgeSeconds: 60, maxResearchSteps: null, maxCycleSeconds: null });
  for (const maxOutputTokens of [0, -1, 0.5, '', Infinity]) expect(arenaLiveProtocolSchema.safeParse({ ...protocol,
    entrants: protocol.entrants.map((e) => ({ ...e, maxOutputTokens })) }).success).toBe(false);
  for (const patch of [{ initialCash: '0' }, { maxPositionBps: 0 }, { resources: { maxCycleSeconds: 0 } }])
    expect(arenaLiveProtocolSchema.safeParse({ ...protocol, ...patch }).success).toBe(false);
});
it('步骤和时限分别可空，省略时无限，有限值保持且零拒绝', () => {
  const parsed = arenaLiveProtocolSchema.parse({ ...protocol, resources: {}, decisionDeadlineMinutes: undefined });
  expect(parsed.resources).toMatchObject({ maxResearchSteps: null, maxCycleSeconds: null });
  expect(parsed.decisionDeadlineMinutes).toBeNull();
  for (const resources of [{ maxResearchSteps: 2, maxCycleSeconds: null }, { maxResearchSteps: null, maxCycleSeconds: 30 }])
    expect(arenaLiveProtocolSchema.parse({ ...protocol, resources }).resources).toMatchObject(resources);
  for (const resources of [{ maxResearchSteps: 0 }, { maxCycleSeconds: 0 }, { maxResearchSteps: -1 }, { maxCycleSeconds: 1.5 }])
    expect(arenaLiveProtocolSchema.safeParse({ ...protocol, resources }).success).toBe(false);
});
it('自主总预算可缺省，维度独立可空，明确的零不转换为不限额', () => {
  const empty = { requests: null, tokens: null, costMicros: null };
  expect(arenaLiveBudgetSchema.parse(undefined)).toEqual(empty);
  expect(arenaLiveBudgetSchema.parse({})).toEqual(empty);
  expect(arenaLiveRemainingBudgetSchema.safeParse({}).success).toBe(false);
  expect(arenaLiveRemainingBudgetSchema.safeParse(undefined).success).toBe(false);
  expect(arenaLiveRemainingBudgetSchema.parse(empty)).toEqual(empty);
  expect(arenaLiveBudgetSchema.parse({ requests: 0, costMicros: 100 })).toEqual({ requests: 0, tokens: null, costMicros: 100 });
  const p = arenaLiveProtocolSchema.parse({ ...protocol, budget: undefined, entrants: protocol.entrants.map((e) => ({ ...e, budget: undefined })) });
  expect(p.budget).toEqual(empty); expect(p.entrants.every((e) => JSON.stringify(e.budget) === JSON.stringify(empty))).toBe(true);
  for (const requests of [-1, 1.5, '100', Infinity, NaN]) expect(arenaLiveBudgetSchema.safeParse({ requests }).success).toBe(false);
  expect(arenaLiveBudgetSchema.safeParse({ costMicros: 2147483648 }).success).toBe(false);
});
it('全市场无需预先圈定标的，仍要求同市场、相同模型预算及不同绑定', () => {
  expect(arenaLiveProtocolSchema.parse(protocol)).toEqual(protocol);
  expect(arenaLiveProtocolSchema.parse({ ...protocol, entrants: protocol.entrants.slice(0, 1) }).entrants).toHaveLength(1);
  for (const patch of [
    { entrants: [] },
    { universe: 'fixed' }, { currency: 'CNY' }, { timeZone: 'Asia/Shanghai' },
    { entrants: [protocol.entrants[0], protocol.entrants[0]] },
    { entrants: [protocol.entrants[0], { ...protocol.entrants[1], budget: { ...budget, requests: 1 } }] },
    { benchmarks: ['cash', 'equal_weight_buy_hold'] },
  ]) expect(arenaLiveProtocolSchema.safeParse({ ...protocol, ...patch }).success).toBe(false);
});
it('自主日期可分别省略，双边存在才校验顺序，空字符串及非法日期仍拒绝', () => {
  const open = { ...protocol, startsOn: undefined, endsOn: undefined, calendarVersion: undefined };
  expect(arenaLiveProtocolSchema.parse(open)).toMatchObject({ startsOn: null, endsOn: null, calendarVersion: null });
  for (const patch of [{ startsOn: null }, { endsOn: null }, { startsOn: null, endsOn: null }])
    expect(arenaLiveProtocolSchema.safeParse({ ...protocol, ...patch }).success).toBe(true);
  for (const patch of [{ startsOn: '' }, { endsOn: '2026-02-30' }, { endsOn: '2026-11-01' }])
    expect(arenaLiveProtocolSchema.safeParse({ ...protocol, ...patch }).success).toBe(false);
});
it('模型可仅预约成交事件；没有任何预约的决策无效', () => {
  const decision = { summary: '等待成交后观察', orders: [], cancelOrderIds: [], watchedSymbols: [], wakeups: [{ kind: 'fill', symbol: null }] };
  expect(arenaLiveDecisionSchema.parse(decision)).toEqual(decision);
  expect(arenaLiveDecisionSchema.safeParse({ ...decision, wakeups: [] }).success).toBe(false);
});
it('限价和退出委托需要价格，成对退出必须匹配标的、数量和类型', () => {
  const base = { clientId: 'take', symbol: 'AAPL.US', side: 'sell', kind: 'take_profit', quantity: '10', price: '250', expiresOn: null, exitGroup: 'exit' };
  const decision = { summary: '退出计划', orders: [base, { ...base, clientId: 'stop', kind: 'stop_loss', price: '180' }], cancelOrderIds: [], watchedSymbols: [], wakeups: [{ kind: 'fill', symbol: 'AAPL.US' }] };
  expect(arenaLiveDecisionSchema.safeParse(decision).success).toBe(true);
  expect(arenaLiveDecisionSchema.safeParse({ ...decision, orders: [base] }).success).toBe(false);
  expect(arenaLiveDecisionSchema.safeParse({ ...decision, orders: [base, { ...base, clientId: 'stop', kind: 'stop_loss', price: null }] }).success).toBe(false);
});
