import { arenaLiveProtocolSchema, type ArenaLiveProtocol } from '@thesis-ledger/schemas';
export function liveProtocolFixture(overrides: Partial<ArenaLiveProtocol> = {}) {
  const budget = { requests: 10, tokens: 100000, costMicros: 1000000 };
  return arenaLiveProtocolSchema.parse({
    version: 2, title: '隔离自主比赛', market: 'US', currency: 'USD', timeZone: 'America/New_York',
    calendarId: 'fixture', calendarVersion: 'fixture', startsOn: null, endsOn: '2030-12-31',
    universe: 'market', instruments: [], allowWebSearch: false, initialCash: '10000',
    entrants: ['first', 'second'].map((model) => ({ model, providerId: 'fixture', budget, maxInputTokens: 10000, maxOutputTokens: 2000 })),
    maxPositionBps: 10000, fees: { version: 'fixture', buyBps: 0, sellBps: 0, minimum: '0', slippageBps: 0 },
    benchmarks: ['cash'], decisionDeadlineMinutes: 10, maxInfrastructureAttempts: 2, budgetCurrency: 'USD',
    budget: { requests: 20, tokens: 200000, costMicros: 2000000 },
    resources: { maxActiveSymbols: 50, maxResearchSteps: 20, maxCycleSeconds: 300, quoteIntervalSeconds: 30, maxQuoteAgeSeconds: 60 },
    ...overrides,
  });
}
