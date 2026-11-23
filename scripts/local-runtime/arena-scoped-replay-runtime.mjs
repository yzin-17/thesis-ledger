/** 在目标容器中装配现有正式服务，不调用任何全局生命周期或队列入口。 */
export async function createScopedReplayRuntime(scope, historicalTools) {
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
    const registry = new AiProviderRegistry(), sdk = new AiSdkGenerationAdapter();
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
    const market = { getSession: (market, at) => sessions.read(market, at) };
    const matches = new LiveMatchesRepository(db), cycles = new LiveCyclesRepository(db), budget = new LiveResearchBudget(db);
    const execution = new LiveExecutionContext(db, market, historical.blocked, historical.replay);
    const orders = new LiveOrdersRepository(db, execution);
    const call = new LiveResearchCall(db, registry, sdk, budget);
    research = new LiveResearchRunner(db, { generate: async (...args) => { await guard(); return call.generate(...args); } }, historical.tools, budget, orders);
    const replay = new LiveReplayRuntime(db, historical.replay, matches);
    const runtime = new LiveRuntime(db, historical.blocked, market, historical.blocked, cycles, orders,
      research, historical.blocked, matches, replay);
    let stopping = false;
    const stop = () => { stopping = true; research.stop(); };
    timer = setTimeout(stop, Math.max(1, scope.deadlineAt - Date.now()));
    const snapshot = async id => {
      if (id !== scope.matchId) throw new Error('禁止访问其他比赛');
      const match = await liveMatch(db, id), agents = await liveAgents(db, id);
      const rows = await db.$queryRaw`SELECT id,"matchId",state,reason,attempt,"requestId" FROM "ArenaLiveCycle"
        WHERE "matchId"=${id}::uuid ORDER BY "createdAt",id`;
      const pending = rows.filter(row => row.state === 'pending' || row.state === 'running');
      return { id, state: match.state, protocol: arenaLiveProtocolSchema.parse(match.protocol),
        timeline: await liveTimeline(db, id), pending, remainingRequests: match.remaining.requests,
        failure: rows.find(row => row.state === 'failed' || row.state === 'unknown_usage')?.reason ?? null,
        attention: agents.find(agent => agent.state === 'needs_attention' || agent.state === 'budget_exhausted')?.reason ?? null };
    };
    return { now: Date.now, guard, snapshot, stopped: () => stopping,
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
