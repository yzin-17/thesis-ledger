const ids = {
  arena: '55555555-5555-4555-8555-555555555555',
  round: '66666666-6666-4666-8666-666666666666',
  week: '77777777-7777-4777-8777-777777777777',
  first: '88888888-8888-4888-8888-888888888888',
  second: '99999999-9999-4999-8999-999999999999',
};

function arenaRefreshFixture(schemas) {
  const day = '2026-11-02';
  const at = day + 'T07:00:00Z';
  const budget = { requests: 100, tokens: 100000, costMicros: 1000000 };
  const bindings = ['甲模型', '乙模型'].map((model) => ({
    providerId: 'controlled-model',
    model,
    budget,
    maxInputTokens: 1000,
    maxOutputTokens: 1000,
  }));
  const protocol = schemas.arenaProtocolSchema.parse({
    version: 1,
    title: '受控双模型比赛',
    market: 'CN',
    currency: 'CNY',
    calendarId: 'controlled-calendar',
    calendarVersion: 'controlled-v1',
    timeZone: 'Asia/Shanghai',
    startsOn: day,
    endsOn: '2026-11-06',
    instruments: [{ instrumentId: ids.arena, symbol: '600000.SH', assetType: 'STOCK' }],
    entrants: bindings,
    initialCash: '10000',
    maxPositionBps: 5000,
    fees: { version: 'controlled-v1', buyBps: 0, sellBps: 0, minimum: '0', slippageBps: 0 },
    benchmarks: ['cash', 'equal_weight_buy_hold'],
    decisionDeadlineMinutes: 30,
    maxInfrastructureAttempts: 2,
    budgetCurrency: 'USD',
    budget,
  });
  const entrants = bindings.map((e, i) => ({
    id: i ? ids.second : ids.first,
    providerId: e.providerId,
    model: e.model,
    cash: '10000',
    remaining: budget,
  }));
  const detail = schemas.arenaDetailSchema.parse({
    id: ids.arena,
    state: 'running',
    protocol,
    createdAt: at,
    remaining: budget,
    entrants,
    rounds: [{ id: ids.round, tradingDate: day, outcome: { state: 'sealed' } }],
  });
  const list = schemas.arenaSummarySchema
    .array()
    .parse([{ id: detail.id, state: detail.state, protocol, createdAt: at }]);
  const comparison = schemas.arenaComparisonSchema.parse({
    arenaId: ids.arena,
    start: day,
    end: '2026-11-06',
    currency: 'CNY',
    planned: 5,
    opened: 1,
    rows: entrants.map((e, i) => ({
      id: e.id,
      label: e.model,
      kind: 'model',
      metrics: {
        startNav: '10000',
        endNav: i ? '10000' : '10100',
        returnRatio: i ? '0' : '0.01',
        drawdown: '0',
        turnover: '0',
        tradeFees: '0',
        validCloses: 5,
        expectedCloses: 5,
      },
      rank: i + 1,
      decisions: 1,
    })),
  });
  const round = schemas.arenaRoundReportSchema.parse({
    id: ids.round,
    arenaId: ids.arena,
    tradingDate: day,
    asOf: at,
    fingerprint: 'controlled-frozen-input',
    closeMarks: [],
    facts: [],
    entries: entrants.map((e) => ({
      entrantId: e.id,
      providerId: e.providerId,
      model: e.model,
      state: 'observe',
      requestId: null,
      actualModel: e.model,
      modelCost: '0',
      costStatus: 'known',
      costCurrency: 'USD',
      receivedAt: at,
      executionReasons: {},
      decision: null,
      book: null,
      settledAt: at,
      executionAt: null,
      fills: [],
    })),
  });
  const weekly = schemas.arenaWeekDetailSchema.parse({
    id: ids.week,
    arenaId: ids.arena,
    title: '受控双模型比赛',
    week: day,
    revision: 2,
    publishedAt: '2026-11-06T09:00:00Z',
    digest: 'controlled-weekly-digest',
    report: {
      method: 'weekly-v1',
      calendarVersion: 'controlled-v1',
      week: day,
      cutoff: '2026-11-06T07:00:00Z',
      timeZone: 'Asia/Shanghai',
      comparison,
      observations: [
        {
          roundId: ids.round,
          day,
          symbol: '600000.SH',
          window: 5,
          state: 'pending',
          endDay: null,
          change: null,
          high: null,
          low: null,
          sourceRefs: [],
        },
      ],
      laterNews: Array.from({ length: 10 }, (_, i) => ({
        roundId: ids.round,
        symbol: '600000.SH',
        publishedAt: '2026-11-03T08:00:00Z',
        title: '受控后来资讯 ' + (i + 1) + '：此内容保留决策之后收录的时间语义',
        ref: 'controlled-later-news-' + i,
        url: 'https://example.invalid/controlled-news/' + i,
      })),
      rounds: [
        {
          id: ids.round,
          day,
          state: 'sealed',
          reason: null,
          fingerprint: 'controlled-frozen-input',
          entries: round.entries.map((e) => ({
            entrantId: e.entrantId,
            model: e.model,
            state: e.state,
            decision: e.decision,
            modelCost: e.modelCost,
            costStatus: e.costStatus,
            costCurrency: e.costCurrency,
            requestId: e.requestId,
          })),
        },
      ],
      fills: [],
    },
  });
  const weeklies = schemas.arenaWeekSummarySchema.array().parse([
    {
      id: weekly.id,
      arenaId: weekly.arenaId,
      title: weekly.title,
      week: weekly.week,
      revision: weekly.revision,
      publishedAt: weekly.publishedAt,
    },
  ]);
  function response(url) {
    const pathname = url.pathname;
    if (pathname === '/api/v1/model-arenas') return list;
    if (pathname === '/api/v1/model-arenas/' + ids.arena) return detail;
    if (pathname === '/api/v1/model-arenas/' + ids.arena + '/comparison') return comparison;
    if (pathname === '/api/v1/model-arenas/' + ids.arena + '/rounds/' + ids.round) return round;
    if (pathname === '/api/v1/model-weeklies') return weeklies;
    if (pathname === '/api/v1/model-weeklies/' + ids.arena + '/' + ids.week) return weekly;
    if (pathname === '/api/v1/identity/context') return { principal: { id: ids.first } };
  }
  return { detail, list, comparison, round, weekly, weeklies, response };
}

module.exports = { ids, arenaRefreshFixture };
