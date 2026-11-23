// 仅装配现有只读研究能力；不启动 Nest、Runner 或持久化比赛服务。
export async function isolatedHistoricalTools() {
  const load = (file) => import(`./dist/src/${file}.js`);
  const [
    prisma,
    dsaModule,
    instrumentsModule,
    historyModule,
    replayModule,
    calendarModule,
    lifecycleModule,
    actionsModule,
    toolsModule,
  ] = await Promise.all([
    import('@prisma/client'),
    load('integration/dsa/dsa.client'),
    load('market/instrument.service'),
    load('market/market-arena-history-source'),
    load('market/market-arena-replay-reader'),
    load('market/market-period-calendar-reader'),
    load('market/market-lifecycle-reader-v3'),
    load('market/market-action-coverage'),
    load('model-arena/live/live-research-tools'),
  ]);
  const db = new prisma.PrismaClient();
  const localRead =
    (method) =>
    (...args) =>
      db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
        return new instrumentsModule.InstrumentService(tx)[method](...args);
      });
  const instruments = {
    search: localRead('search'),
    resolveCanonicalSymbols: localRead('resolveCanonicalSymbols'),
  };
  const dsa = new dsaModule.DsaClient();
  const blocked = new Proxy(
    {},
    {
      get: () => () => {
        throw Error('禁止访问当前行情或业务存储');
      },
    },
  );
  const replay = new replayModule.MarketArenaReplayReader(
    new calendarModule.MarketPeriodCalendarReader(dsa),
    blocked,
    dsa,
    new lifecycleModule.MarketLifecycleReaderV3(dsa),
    new actionsModule.MarketActionCoverage(dsa),
    new historyModule.MarketArenaHistorySource(dsa, instruments),
  );
  return {
    replay,
    blocked,
    close: () => db.$disconnect(),
    tools: new toolsModule.LiveResearchTools(
      instruments,
      blocked,
      blocked,
      blocked,
      blocked,
      replay,
    ),
  };
}

export async function collectIsolatedToolResults(input, requests) {
  const runtime = await isolatedHistoricalTools();
  try {
    const toolResults = [];
    for (const request of requests) {
      let outcome;
      try {
        outcome = {
          status: 'ready',
          data: await runtime.tools.execute(
            input.protocol,
            request,
            new AbortController().signal,
            input.asOf,
          ),
        };
      } catch (error) {
        outcome = { status: 'unavailable', reason: error.message.slice(0, 500) };
      }
      toolResults.push({ request, outcome });
    }
    return { toolResults, observedAt: input.asOf };
  } finally {
    await runtime.close();
  }
}

export async function validateIsolatedDecision(input, raw) {
  const runtime = await isolatedHistoricalTools();
  try {
    const { arenaLiveDecisionSchema, arenaLiveAccountSchema, arenaLiveProtocolSchema } =
      await import('@thesis-ledger/schemas');
    const { arenaSubmitDecision } = await import('@thesis-ledger/domain');
    const { LiveExecutionContext } =
      await import('./dist/src/model-arena/live/live-execution-context.js');
    const { liveOrderCommand } =
      await import('./dist/src/model-arena/live/live-order-identities.js');
    const decision = arenaLiveDecisionSchema.parse(raw);
    const account = arenaLiveAccountSchema.parse(input.account);
    const protocol = arenaLiveProtocolSchema.parse(input.protocol);
    const prepared = await new LiveExecutionContext(
      runtime.blocked,
      runtime.blocked,
      runtime.blocked,
      runtime.replay,
    ).build(protocol, [account], decision, [], input.asOf);
    const now = Date.parse(input.asOf);
    const open =
      prepared.session.state === 'open' &&
      prepared.session.sessions.some(
        (s) => Date.parse(s.startAt) <= now && Date.parse(s.endAt) > now,
      );
    if (decision.orders.length && !open) throw Error('market_closed');
    const next = arenaSubmitDecision(
      account,
      account.revision,
      liveOrderCommand(randomUUID(), decision),
      {
        ...prepared.context,
        at: input.asOf,
        quotes: prepared.context.quotes.filter(
          (q) => now - Date.parse(q.marketTime) <= protocol.resources.maxQuoteAgeSeconds * 1000,
        ),
      },
    );
    return {
      status: 'passed',
      persistence: 'memory_only',
      session: prepared.session.state,
      revisionBefore: account.revision,
      revisionAfter: next.revision,
      orders: next.orders.length,
      watchedSymbols: next.watchedSymbols,
      wakeups: next.wakeups,
    };
  } finally {
    await runtime.close();
  }
}
