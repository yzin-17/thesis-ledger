/** 在目标容器中装配现有正式服务，不调用任何全局生命周期或队列入口。 */
export async function createScopedReplayRuntime(scope, historicalTools, liveReaders, modelHttpFactory) {
  const load = name => import('./dist/src/' + name + '.js');
  const { PrismaClient } = await import('@prisma/client');
  const db = new PrismaClient();
  let historical, redis, research, timer;
  try {
    const { RedisService, redisKey } = await load('platform/redis.service');
    redis = new RedisService();
    const { AiProviderRegistry } = await load('ai/provider-registry');
    const { AiSdkGenerationAdapter } = await load('ai/ai-sdk-generation.adapter');
    const { ProviderHealthService } = await load('providers/provider-health.service');
    const { ProviderConfigService } = await load('providers/provider-config.service');
    const { AiProviderService } = await load('ai/ai-provider.service');
    const { AiRoutingSettingsService } = await load('ai/ai-routing-settings.service');
    const registry = new AiProviderRegistry(), nativeSdk = new AiSdkGenerationAdapter();
    const modelHttp = scope.useHttpsTransport ? await modelHttpFactory() : null;
    const sdk = { generate: input => nativeSdk.generate(modelHttp ? { ...input, httpClient: modelHttp } : input) };
    const health = new ProviderHealthService(db, redis), configs = new ProviderConfigService(db, health);
    const providers = new AiProviderService(configs, health, registry, sdk, new AiRoutingSettingsService(db), db);
    const { arenaLiveProtocolSchema, aiGenerationContracts } = await import('@thesis-ledger/schemas');
    const { liveMatch, liveAgents } = await load('model-arena/live/live-storage');
    const { liveTimeline } = await load('model-arena/live/live-timeline');
    const protocol = arenaLiveProtocolSchema.parse(scope.protocol);
    const binding = protocol.entrants[0];
    const guard = async () => {
      if (await redis.client.hget(redisKey('queue', 'arena') + ':live:meta', 'paused') !== '1'
        || await redis.client.get(redisKey('lock', 'arena-maintenance-owner')) !== scope.ownerToken)
        throw new Error('原共享队列暂停或归属已变化');
      await providers.refreshRegistry();
      const route = registry.strictReadyContract({ providerId: binding.providerId, model: binding.model,
        contract: aiGenerationContracts.arenaLiveResearch.ref, budgetAuthorized: true });
      if (route.execution.readiness.configurationFingerprint !== scope.configurationFingerprint) throw new Error('模型准入配置变化');
    };
    await guard();
    historical = await historicalTools();
    const { DsaClient } = await load('integration/dsa/dsa.client');
    const { MarketPeriodCalendarReader } = await load('market/market-period-calendar-reader');
    const { MarketSessionReader } = await load('market/market-session-reader');
    const sessions = new MarketSessionReader(new MarketPeriodCalendarReader(new DsaClient()));
    const { LiveMatchesRepository } = await load('model-arena/live/live-matches.repository');
    const { LiveExecutionContext } = await load('model-arena/live/live-execution-context');
    const { LiveOrdersRepository } = await load('model-arena/live/live-orders.repository');
    const { LiveCyclesRepository } = await load('model-arena/live/live-cycles.repository');
    const { LiveResearchBudget } = await load('model-arena/live/live-research-budget');
    const { LiveResearchCall } = await load('model-arena/live/live-research-call');
    const { LiveResearchRunner } = await load('model-arena/live/live-research-runner');
    const { LiveReplayRuntime } = await load('model-arena/live/live-replay-runtime');
    const { LiveRuntime } = await load('model-arena/live/live-runtime');
    const live = scope.completeLiveCycle ? await liveReaders(db, redis, historical) : null;
    const market = live?.market ?? { getSession: (market, at) => sessions.read(market, at) };
    const matches = new LiveMatchesRepository(db), cycles = new LiveCyclesRepository(db), budget = new LiveResearchBudget(db);
    const execution = new LiveExecutionContext(db, market, live?.reader ?? historical.blocked, historical.replay, live?.valuation);
    const orders = new LiveOrdersRepository(db, execution);
    const call = new LiveResearchCall(db, registry, sdk, budget);
    research = new LiveResearchRunner(db, { generate: async (...args) => { await guard(); return call.generate(...args); } }, live?.tools ?? historical.tools, budget, orders);
    const replay = new LiveReplayRuntime(db, historical.replay, matches);
    const runtime = new LiveRuntime(db, historical.blocked, market, historical.blocked, cycles, orders,
      research, historical.blocked, matches, replay);
    let liveEvidence;
    const recoveredCycles = new Set();
    for (const cycleId of scope.acknowledgedNetworkFailures ?? []) {
      const [row] = await db.$queryRaw`SELECT state,"matchId","requestAudit"->'calls'->-1->'error'->>'code' AS code
        FROM "ArenaLiveCycle" WHERE id=${cycleId}::uuid`;
      if (row?.matchId !== scope.matchId || row.state !== 'unknown_usage' || row.code !== 'transport_unknown')
        throw new Error('续行历史网络失败不匹配');
      recoveredCycles.add(cycleId);
    }
    const captureAccount = async id => ({ at: new Date().toISOString(), matchId: id,
      agents: (await liveAgents(db, id)).map(agent => ({ id: agent.id, account: agent.account, remaining: agent.remaining })) });
    const prepareLive = async id => {
      if (!live || id !== scope.matchId || (await liveTimeline(db, id))?.phase !== 'live') throw new Error('实时范围未授权');
      liveEvidence = { before: await captureAccount(id) };
      const match = await liveMatch(db, id), agents = await liveAgents(db, id);
      if (agents.length !== 1) throw new Error('实时参赛者数量变化');
      await matches.trigger(match.ownerId, id, agents[0].id);
      const { LiveAppointments } = await load('model-arena/live/live-appointments');
      await new LiveAppointments(db, market).admit(id);
    };
    const captureLive = async id => {
      if (!live || id !== scope.matchId) throw new Error('实时范围未授权');
      await orders.expire(id);
      const session = await market.getSession(protocol.market);
      if (session.state === 'open') await orders.match(id);
      const { LiveValuations } = await load('model-arena/live/live-valuations');
      const frame = await new LiveValuations(db, live.valuation, execution).capture(id);
      if (!frame?.complete) throw new Error('live_valuation_incomplete');
      liveEvidence.after = await captureAccount(id);
      liveEvidence.frame = frame;
      liveEvidence.session = { state: session.state, date: session.date, reason: session.reason ?? null };
      return liveEvidence;
    };
    let stopping = false;
    const stop = () => { stopping = true; research.stop(); };
    timer = setTimeout(stop, Math.max(1, scope.deadlineAt - Date.now()));
    const snapshot = async id => {
      if (id !== scope.matchId) throw new Error('禁止访问其他比赛');
      const match = await liveMatch(db, id), agents = await liveAgents(db, id);
      const rows = await db.$queryRaw`SELECT id,"matchId",state,reason,attempt,"requestId",input->>'replay' AS replay,
        "requestAudit"->'calls'->-1->'error'->>'code' AS "failureCode" FROM "ArenaLiveCycle"
        WHERE "matchId"=${id}::uuid ORDER BY "createdAt",id`;
      const pending = rows.filter(row => row.state === 'pending' || row.state === 'running');
      const failed = rows.find(row => ['failed', 'unknown_usage'].includes(row.state) && !recoveredCycles.has(row.id));
      return { id, state: match.state, protocol: arenaLiveProtocolSchema.parse(match.protocol),
        timeline: await liveTimeline(db, id), pending, remainingRequests: match.remaining.requests,
        successfulLiveCycles: rows.filter(row => row.state === 'succeeded' && row.replay !== 'true').map(row => row.id),
        failure: failed?.reason ?? null, failedCycleId: failed?.id,
        recoveryEligible: failed?.state === 'unknown_usage' && failed.failureCode === 'transport_unknown',
        attention: agents.find(agent => agent.state === 'needs_attention' || agent.state === 'budget_exhausted')?.reason ?? null };
    };
    const recover = async (id, cycleId) => {
      if (id !== scope.matchId || !scope.maxNetworkRecoveries) throw new Error('恢复范围未授权');
      const [row] = await db.$queryRaw`SELECT state,"matchId","requestAudit"->'calls'->-1->'error'->>'code' AS code
        FROM "ArenaLiveCycle" WHERE id=${cycleId}::uuid`;
      if (row?.matchId !== id || row.state !== 'unknown_usage' || row.code !== 'transport_unknown')
        throw new Error('仅允许未提交的网络未知观察续行');
      const match = await liveMatch(db, id), agents = await liveAgents(db, id);
      if (agents.length !== 1) throw new Error('恢复参赛者数量变化');
      await matches.retry(match.ownerId, id, agents[0].id);
      recoveredCycles.add(cycleId);
      if ((await liveTimeline(db, id))?.phase === 'live') {
        const { LiveAppointments } = await load('model-arena/live/live-appointments');
        await new LiveAppointments(db, market).admit(id);
      }
    };
    return { now: Date.now, guard, snapshot, prepareLive, captureLive, recover, stopped: () => stopping,
      advance: async id => { if (id !== scope.matchId) throw new Error('禁止推进其他比赛'); await replay.reconcile(id); },
      execute: async delivery => {
        const [cycle] = await db.$queryRaw`SELECT "matchId" FROM "ArenaLiveCycle" WHERE id=${delivery.id}::uuid`;
        if (cycle?.matchId !== scope.matchId) throw new Error('禁止执行其他比赛周期');
        await runtime.execute(delivery);
      },
      pause: async id => {
        if (id !== scope.matchId) throw new Error('禁止暂停其他比赛');
        const match = await liveMatch(db, id);
        if (match.state === 'running') await matches.transition(match.ownerId, id, 'paused');
      },
      stop,
      close: async () => { clearTimeout(timer); stop(); await historical.close(); await db.$disconnect(); await redis.onModuleDestroy(); },
    };
  } catch (error) {
    clearTimeout(timer); research?.stop(); await historical?.close(); await db.$disconnect(); await redis?.onModuleDestroy(); throw error;
  }
}
