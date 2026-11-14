const ids = { match: '11111111-1111-4111-8111-111111111111', a: '22222222-2222-4222-8222-222222222222', b: '33333333-3333-4333-8333-333333333333', cycle: '44444444-4444-4444-8444-444444444444', fill: '55555555-5555-4555-8555-555555555555' };
function arenaLiveFixture(s) {
  const budget = { requests: 100, tokens: 1000000, costMicros: 1000000 }, at = '2026-11-12T14:30:00.000Z';
  const protocol = s.arenaLiveProtocolSchema.parse({ version: 2, title: '自主模型对决', market: 'US', currency: 'USD', calendarId: 'US', calendarVersion: 'controlled', timeZone: 'America/New_York',
    startsOn: '2026-11-01', endsOn: '2026-12-31', initialCash: '10000', maxPositionBps: 5000, decisionDeadlineMinutes: 5, maxInfrastructureAttempts: 3,
    universe: 'market', instruments: [], allowWebSearch: true, fees: { version: 'controlled', buyBps: 0, sellBps: 0, minimum: '0', slippageBps: 0 }, benchmarks: ['cash'], budgetCurrency: 'USD', budget,
    resources: { maxActiveSymbols: 50, maxResearchSteps: 20, maxCycleSeconds: 300, quoteIntervalSeconds: 30, maxQuoteAgeSeconds: 60 },
    entrants: ['Atlas', 'Orion'].map((model) => ({ providerId: '受控模型', model, budget, maxInputTokens: 30000, maxOutputTokens: 2000 })),
  });
  const decision = { summary: '估值仍在合理范围，维持现有持仓。等待价格触及观察条件后重新研究，再决定是否调整仓位。', orders: [], cancelOrderIds: [], watchedSymbols: ['AAPL.US'], wakeups: [{ kind: 'price', symbol: 'AAPL.US', operator: 'lte', price: '9' }] };
  const agents = [ids.a, ids.b].map((id, i) => ({ id, providerId: '受控模型', model: protocol.entrants[i].model, state: 'waiting', reason: null, remaining: budget,
    availability: { tradingDate: '2026-11-12', cash: i ? '8000' : '9000', shares: { 'AAPL.US': '0' } },
    account: { revision: 2, cash: i ? '8000' : '9000', cashSettlements: [], positions: [{ symbol: 'AAPL.US', quantity: i ? '200' : '100', acquiredOn: '2026-11-12', availableOn: '2026-11-13' }], orders: [], watchedSymbols: ['AAPL.US'],
      wakeups: [{ id, createdAt: at, firedAt: null, condition: decision.wakeups[0] }],
      fills: [{ id, orderId: ids.fill, symbol: 'AAPL.US', side: 'buy', quantity: i ? '200' : '100', price: '10', fee: '0', cashDelta: i ? '-2000' : '-1000', marketTime: at, recordedAt: at, sourceRef: 'controlled', evidence: { source: '受控浏览器样本', quote: { marketTime: at, price: '10' } } }],
    }, cycles: [{ id: i ? ids.a : ids.cycle, agentId: id, state: 'succeeded', trigger: '[]', attempt: 1, createdAt: at, completedAt: at, reason: null, decision, requestId: ids.fill, usage: { calls: [{ usage: { inputTokens: 5000, outputTokens: 1000 }, cost: '0.01' }], tools: [] } }],
  }));
  const frames = Array.from({ length: 241 }, (_, i) => {
    const price = 10 + Math.sin(i / 30) * 0.5 + i / 500, missing = i >= 90 && i < 100;
    const marks = agents.map((a, j) => ({ agentId: a.id, nav: missing ? null : String(Number(a.account.cash) + price * Number(a.account.positions[0].quantity)),
      returnRatio: missing ? null : String((Number(a.account.cash) + price * Number(a.account.positions[0].quantity)) / 10000 - 1), peakNav: '10200', drawdown: '0.01', complete: !missing, reason: missing ? 'valuation_price_missing' : null, rank: missing ? null : 2 - j }));
    return { at: new Date(Date.parse(at) + i * 30000).toISOString(), marketTime: new Date(Date.parse(at) + i * 30000).toISOString(), complete: !missing, reason: missing ? 'common_valuation_incomplete' : null, marks, benchmarks: [{ id: 'cash', nav: '10000', returnRatio: '0' }] };
  });
  const detail = s.arenaLiveDetailSchema.parse({ id: ids.match, state: 'running', protocol, createdAt: at, startedAt: at, endedAt: null, agents, frames, remaining: budget, sealedFrame: null,
    periodReturns: ['today', 'week', 'month', 'all'].map((period) => ({ period, rows: frames.at(-1).marks.map((m) => ({ agentId: m.agentId, returnRatio: m.returnRatio })) })),
    session: { state: 'open' }, instrumentDirectory: { 'AAPL.US': '苹果' } });
  const list = s.arenaLiveSummarySchema.array().parse([{ id: ids.match, state: detail.state, protocol, createdAt: at, startedAt: at, endedAt: null }]);
  return { detail, list, ids };
}
module.exports = { arenaLiveFixture, ids };
