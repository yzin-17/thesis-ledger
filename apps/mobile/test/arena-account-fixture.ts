import type { ArenaLiveDetail } from '@thesis-ledger/schemas';

/** 只构造账户视图消费的事实，不作为完整服务端协议样本。 */
export function arenaAccountFixture() {
  return {
    state: 'running',
    timeline: null,
    instrumentDirectory: {},
    remaining: { requests: 2 },
    protocol: {
      timeZone: 'Asia/Shanghai',
      currency: 'CNY',
      budgetCurrency: 'USD',
      resources: { maxResearchSteps: 3, maxCycleSeconds: 60 },
      entrants: [
        { providerId: 'fixture', model: 'controlled', maxInputTokens: 1000, maxOutputTokens: 500 },
      ],
    },
    agents: [
      {
        id: 'agent',
        providerId: 'fixture',
        model: 'controlled',
        state: 'waiting',
        reason: null,
        remaining: { requests: 2, costMicros: '1000000' },
        cycles: [],
        availability: { cash: '1000', shares: {}, tradingDate: '2026-11-12' },
        account: { cash: '1000', wakeups: [], positions: [], orders: [], fills: [] },
      },
    ],
  } as unknown as ArenaLiveDetail;
}
