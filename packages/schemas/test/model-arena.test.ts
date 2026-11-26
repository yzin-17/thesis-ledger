import { expect, it } from 'vitest';
import {
  arenaProtocolSchema,
  arenaCanTransition,
  arenaRoundStateSchema,
  arenaParticipantResultSchema,
} from '../src/model-arena.js';
const budget = { requests: 20, tokens: 100000, costMicros: 200000 };
const protocol = {
  version: 'arena-historical-match-protocol-v1',
  title: '两模型实验',
  market: 'CN',
  currency: 'CNY',
  timeZone: 'Asia/Shanghai',
  calendarId: 'SSE',
  calendarVersion: 'v1',
  startsOn: '2026-11-05',
  endsOn: '2026-11-30',
  instruments: [
    {
      instrumentId: '00000000-0000-4000-8000-000000000001',
      symbol: '600000.SH',
      assetType: 'STOCK',
    },
  ],
  entrants: ['甲', '乙'].map((model) => ({
    model,
    providerId: 'fixture',
    budget,
    maxInputTokens: 1000,
    maxOutputTokens: 500,
  })),
  initialCash: '100000.00',
  fees: { version: 'v1', buyBps: 2, sellBps: 3, minimum: '5', slippageBps: 1 },
  maxPositionBps: 5000,
  benchmarks: ['cash', 'equal_weight_buy_hold'],
  decisionDeadlineMinutes: 30,
  maxInfrastructureAttempts: 2,
  budgetCurrency: 'USD',
  budget,
};
it('赛制可冻结重读，支持单模型并保留完整的单市场协议', () => {
  expect(arenaProtocolSchema.parse(JSON.parse(JSON.stringify(protocol)))).toEqual(protocol);
  expect(arenaProtocolSchema.parse({ ...protocol, entrants: protocol.entrants.slice(0, 1) }).entrants).toHaveLength(1);
  for (const bad of [
    { entrants: [] },
    { entrants: [protocol.entrants[0], protocol.entrants[0]] },
    { market: 'US' },
    { currency: 'HKD' },
    { timeZone: 'UTC' },
    { calendarVersion: '' },
    { fees: undefined },
    { budget: { ...budget, costMicros: -1 } },
    { initialCash: '0' },
    { maxPositionBps: 10001 },
    { endsOn: '2026-11-04' },
  ])
    expect(arenaProtocolSchema.safeParse({ ...protocol, ...bad }).success).toBe(false);
});
it('未开轮与开轮后模型失败使用各自的状态', () => {
  expect(
    arenaRoundStateSchema.safeParse({
      state: 'unopened',
      reason: 'unknown_pricing',
      entrantId: null,
    }).success,
  ).toBe(true);
  expect(arenaParticipantResultSchema.parse('timeout')).toBe('timeout');
  expect(
    arenaRoundStateSchema.safeParse({ state: 'unopened', reason: 'timeout', entrantId: null })
      .success,
  ).toBe(false);
  expect(arenaCanTransition('draft', 'running')).toBe(true);
  expect(arenaCanTransition('ended', 'running')).toBe(false);
});
