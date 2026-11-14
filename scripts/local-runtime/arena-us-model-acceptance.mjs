// 独立 PostgreSQL 中使用真实本地模型及历史价格；不注册队列或访问业务写接口。
import '../../apps/server/node_modules/reflect-metadata/Reflect.js';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { aiGenerationContracts, arenaLiveAccountSchema, arenaLiveProtocolSchema } from '../../packages/schemas/dist/index.js';
import { DecimalValue } from '../../packages/domain/dist/index.js';
import { PrismaService } from '../../apps/server/dist/src/platform/prisma.service.js';
import { AiProviderRegistry } from '../../apps/server/dist/src/ai/provider-registry.js';
import { createStoredAiProvider } from '../../apps/server/dist/src/ai/ai-provider-runtime.js';
import { parseAiProviderSettings } from '../../apps/server/dist/src/ai/ai-provider-summary.js';
import { routeSnapshotsFromProviderRow } from '../../apps/server/dist/src/ai/ai-provider-readiness.persistence.js';
import { AiSdkGenerationAdapter } from '../../apps/server/dist/src/ai/ai-sdk-generation.adapter.js';
import { LiveMatchesRepository } from '../../apps/server/dist/src/model-arena/live/live-matches.repository.js';
import { liveAgents } from '../../apps/server/dist/src/model-arena/live/live-storage.js';
import { saveLiveTimeline, liveTimeline } from '../../apps/server/dist/src/model-arena/live/live-timeline.js';
import { LiveResearchBudget } from '../../apps/server/dist/src/model-arena/live/live-research-budget.js';
import { LiveResearchCall } from '../../apps/server/dist/src/model-arena/live/live-research-call.js';
import { LiveResearchRunner } from '../../apps/server/dist/src/model-arena/live/live-research-runner.js';
import { LiveOrdersRepository } from '../../apps/server/dist/src/model-arena/live/live-orders.repository.js';
import { LiveExecutionContext } from '../../apps/server/dist/src/model-arena/live/live-execution-context.js';
import { LiveReplayRuntime } from '../../apps/server/dist/src/model-arena/live/live-replay-runtime.js';
import { historyObservation } from './arena-us-history-observation.mjs';

export async function acceptUsModel({ databaseUrl, configPath, historyPath, output, dispatch }) {
  const url = new URL(databaseUrl);
  assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.pathname, '/arena_us_model_acceptance');
  const config = JSON.parse(readFileSync(configPath)), capture = JSON.parse(readFileSync(historyPath));
  assert.equal(config.provider.settings.authMode, 'none');
  const protocol = arenaLiveProtocolSchema.parse({ ...config.protocol,
    title: config.protocol.title + ' · 隔离功能验收', startsOn: capture.date, endsOn: capture.date });
  const { title: _a, startsOn: _b, endsOn: _c, ...rest } = protocol;
  const { title: _d, startsOn: _e, endsOn: _f, ...sourceRest } = config.protocol;
  assert.deepEqual(rest, sourceRest, '除隔离标题与单日窗口外配置必须一致');
  const history = historyObservation(capture), db = new PrismaService({ datasourceUrl: databaseUrl });
  const write = (name, value) => writeFileSync(resolve(output, name), JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  try {
    const matches = new LiveMatchesRepository(db), owner = randomUUID();
    const match = await matches.create(owner, protocol); await matches.transition(owner, match.id, 'running');
    const [agent] = await liveAgents(db, match.id), account = arenaLiveAccountSchema.parse(agent.account);
    const initial = await liveTimeline(db, match.id), at = history.firstAt;
    await saveLiveTimeline(db, match.id, { ...initial, phase: 'replay', cursorAt: at, pendingAt: at, status: 'research', reason: null });
    const cycleId = randomUUID(), input = { protocol, account, asOf: at, replay: true,
      marketSession: { state: 'open', date: capture.date, reason: 'controlled-functional-execution' } };
    const lease = new Date(Date.now() + 60000);
    await db.$executeRaw`INSERT INTO "ArenaLiveCycle" (id,"matchId","agentId",state,attempt,trigger,"bookRevision",input,"leaseUntil")
      VALUES (${cycleId}::uuid,${match.id}::uuid,${agent.id}::uuid,'running',1,'[]',${account.revision},${JSON.stringify(input)}::jsonb,${lease})`;
    const row = { ...config.provider, encryptedCredentials: null, updatedAt: new Date(config.provider.updatedAt) };
    const provider = await createStoredAiProvider(row, { readCredential: () => { throw new Error('禁止读取凭证'); } }, 30000);
    assert(provider);
    const registry = new AiProviderRegistry();
    registry.replace([provider], routeSnapshotsFromProviderRow(row, parseAiProviderSettings(row.settings), row.health));
    registry.strictReadyContract({ providerId: protocol.entrants[0].providerId, model: protocol.entrants[0].model,
      contract: aiGenerationContracts.arenaLiveResearch.ref, budgetAuthorized: true });
    const budget = new LiveResearchBudget(db), call = new LiveResearchCall(db, registry, new AiSdkGenerationAdapter(), budget);
    const execution = new LiveExecutionContext(db, {}, {}, { observe: async (p, time) => history.observe(p, time) });
    const orders = new LiveOrdersRepository(db, execution);
    const plan = { matchId: match.id, cycleId, model: protocol.entrants[0].model, protocol, originalSourceId: config.sourceId,
      ...history.fixture, scope: '真实模型、真实历史价格、受控执行条件的隔离功能验收',
      protocolHash: createHash('sha256').update(JSON.stringify(protocol)).digest('hex'), modelDispatched: dispatch };
    write('plan.json', plan);
    if (!dispatch) return { status: 'prepared', modelCalls: 0, ...plan };
    const runner = new LiveResearchRunner(db, { generate: (id, attempt, messages, signal) => call.generate(id, attempt,
      [...messages.slice(0, 2), { role: 'user', content: '本轮为独立模拟功能验收。唯一已载入真实历史行情为 AAPL.US；执行状态、单位、日历和结算条件为明确标记的受控功能样本，未认证历史可交易性。本轮请先用 quote 读取 AAPL.US；资料可用时提交一笔 1 股市价买入委托，并预约 kind=fill 的成交观察及下一分钟的时间观察。仅操作当前隔离账户，不发出真实交易。' }, ...messages.slice(2)], signal) },
    { execute: history.tool }, budget, orders);
    console.log(JSON.stringify({ status: 'model_started', matchId: match.id, cycleId, model: protocol.entrants[0].model }));
    const progress = setInterval(async () => {
      try {
        const [state] = await db.$queryRaw`SELECT state,"leaseUntil",
          jsonb_array_length(COALESCE("requestAudit"->'calls','[]'::jsonb)) AS calls,
          "requestAudit"->'calls'->-1->>'state' AS "lastCallState" FROM "ArenaLiveCycle" WHERE id=${cycleId}::uuid`;
        console.log(JSON.stringify({ status: 'observing_existing_research', ...state }));
      } catch { console.log(JSON.stringify({ status: 'progress_read_unavailable' })); }
    }, 60000);
    try { await runner.execute(cycleId, 1); } finally { clearInterval(progress); }
    const [cycle] = await db.$queryRaw`SELECT * FROM "ArenaLiveCycle" WHERE id=${cycleId}::uuid`;
    const submitted = arenaLiveAccountSchema.parse((await liveAgents(db, match.id))[0].account);
    write('research.json', { cycle, account: submitted });
    assert.equal(cycle.state, 'succeeded', '模型研究未成功，保留原始审计');
    assert.equal(submitted.orders.length, 1); assert.equal(submitted.orders[0].state, 'active');
    assert(submitted.wakeups.some(w => !w.firedAt));
    const replay = new LiveReplayRuntime(db, history, matches);
    await replay.reconcile(match.id); await replay.reconcile(match.id);
    const final = arenaLiveAccountSchema.parse((await liveAgents(db, match.id))[0].account);
    const pending = await db.$queryRaw`SELECT id,state,trigger FROM "ArenaLiveCycle" WHERE "matchId"=${match.id}::uuid AND state='pending'`;
    write('result.json', { ...plan, submitted, account: final, pending, timeline: await liveTimeline(db, match.id), audit: cycle.requestAudit });
    assert.equal(final.fills.length, 1); assert.equal(final.orders[0].state, 'filled');
    assert.equal(final.positions[0].quantity, '1'); assert.equal(final.positions[0].availableOn, '2026-11-16');
    assert.equal(pending.length, 1, '成交或时间预约应生成下一次研究，尚未调用模型');
    assert.equal(final.fills[0].evidence.historicalPitCertified, false);
    assert((cycle.requestAudit.calls ?? []).every(c => c.state === 'settled' && c.used));
    const modelCalls = cycle.requestAudit.calls.filter(c => c.input?.contract);
    assert(modelCalls.length && modelCalls.every(c => c.modelIdentity?.accepted === true && c.actualModel));
    assert(cycle.requestAudit.tools.some(t => t.input?.name === 'quote' && t.outcome?.status === 'ready'));
    const fill = final.fills[0];
    assert.equal(final.cash, DecimalValue.from(protocol.initialCash).minus(DecimalValue.from(fill.quantity).times(fill.price)).minus(fill.fee).toString());
    return { status: 'passed', matchId: match.id, fills: final.fills.length, cash: final.cash, nextCycles: pending.length,
      modelCalls: modelCalls.length, historicalPitCertified: false };
  } finally { await db.$disconnect(); }
}
