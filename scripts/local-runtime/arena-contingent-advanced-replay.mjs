// 原样捕获配置经过正式仓储和历史运行时，与同配置的实时领域事件序列逐项核对。
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { arenaLiveAccountSchema, arenaLiveDecisionSchema, arenaLiveProtocolSchema } from '../../packages/schemas/dist/index.js';
import { arenaDecisionPlanLines } from '../../packages/domain/dist/index.js';
import { fixtureAt } from '../fixtures/arena-contingent-orders.mjs';
import { caseContext, caseEvents, simulateCase, contingentIntentCases, caseConfigurationConforms, caseExecutionConforms } from './arena-contingent-model-scenarios.mjs';
import { PrismaService } from '../../apps/server/dist/src/platform/prisma.service.js';
import { LiveMatchesRepository } from '../../apps/server/dist/src/model-arena/live/live-matches.repository.js';
import { LiveOrdersRepository } from '../../apps/server/dist/src/model-arena/live/live-orders.repository.js';
import { LiveReplayRuntime } from '../../apps/server/dist/src/model-arena/live/live-replay-runtime.js';
import { liveAgents, saveLiveAccount } from '../../apps/server/dist/src/model-arena/live/live-storage.js';
import { saveLiveTimeline, liveTimeline } from '../../apps/server/dist/src/model-arena/live/live-timeline.js';

function economics(book) {
  const names = new Map(book.orders.map(o => [o.id, o.clientId]));
  return { cash: book.cash, fills: book.fills.map(f => ({ side: f.side, quantity: f.quantity, price: f.price, fee: f.fee, order: names.get(f.orderId) })),
    positions: book.positions.map(p => ({ ...p, entryOrderId: names.get(p.entryOrderId) })),
    orders: book.orders.map(o => ({ clientId: o.clientId, state: o.state, filledQuantity: o.filledQuantity,
      remainingQuantity: o.remainingQuantity, reservedCash: o.reservedCash, trailingState: o.trailingState })) };
}
export async function replayAdvancedContingentCaptures({ databaseUrl, capture, output }) {
  const url = new URL(databaseUrl); assert.equal(url.hostname, '127.0.0.1');
  assert(['/arena_contingent_model_acceptance', '/ai_provider_concurrency_fixture'].includes(url.pathname));
  const db = new PrismaService({ datasourceUrl: databaseUrl }), results = [];
  const write = (name, data) => writeFileSync(resolve(output, name), JSON.stringify(data, null, 2), { mode: 0o600, flag: 'wx' });
  try {
    const receiptPath = resolve(capture, 'receipt.json');
    const selected = existsSync(receiptPath) ? JSON.parse(readFileSync(receiptPath, 'utf8')).results.map(r => r.id) : null;
    for (const sample of contingentIntentCases.filter(s => !selected || selected.includes(s.id))) {
      const captured = JSON.parse(readFileSync(resolve(capture, sample.id + '.json'), 'utf8'));
      if (!captured.result.configuration || captured.cycle.state !== 'succeeded') {
        results.push({ id: sample.id, category: captured.result.category, replayed: false }); continue;
      }
      const decision = arenaLiveDecisionSchema.parse(captured.result.configuration), protocol = arenaLiveProtocolSchema.parse(captured.cycle.input.protocol);
      const initial = arenaLiveAccountSchema.parse(captured.cycle.input.account);
      const matches = new LiveMatchesRepository(db), owner = randomUUID(), match = await matches.create(owner, protocol);
      await matches.transition(owner, match.id, 'running'); const [agent] = await liveAgents(db, match.id);
      await saveLiveAccount(db, agent.id, initial);
      await saveLiveTimeline(db, match.id, { ...await liveTimeline(db, match.id), phase: 'replay', cursorAt: fixtureAt, pendingAt: fixtureAt, status: 'research', reason: null });
      const cycleId = randomUUID(), deadline = new Date(Date.now() + 60000);
      await db.$executeRaw`INSERT INTO "ArenaLiveCycle" (id,"matchId","agentId",state,attempt,trigger,"bookRevision","requestId",input,"leaseUntil","deadlineAt")
        VALUES (${cycleId}::uuid,${match.id}::uuid,${agent.id}::uuid,'running',1,'[]',${initial.revision},${randomUUID()}::uuid,${JSON.stringify(captured.cycle.input)}::jsonb,${deadline},${deadline})`;
      const session = { state: 'open', date: '2026-11-13', sessions: [{ tradingDate: '2026-11-13', startAt: '2026-11-13T14:30:00Z', endAt: '2026-11-13T21:00:00Z' }] };
      const submitted = await new LiveOrdersRepository(db, { build: async () => ({ session, context: caseContext(), missing: {} }) }).submit(cycleId, 1, decision);
      await db.$executeRaw`UPDATE "ArenaLiveAgent" SET state='budget_exhausted',reason='participant_budget' WHERE id=${agent.id}::uuid`;
      const events = caseEvents(sample), snapshots = [];
      const read = async () => arenaLiveAccountSchema.parse((await liveAgents(db, match.id))[0].account);
      let previous;
      const source = { next: async (_p, after, target) => events.find(e => e.at > after && e.at <= target)?.at ?? target,
        observe: async (_p, at) => {
          if (previous) snapshots.push({ at: previous, book: await read() }); previous = at;
          const event = events.find(e => e.at === at) ?? events.at(-1);
          const context = caseContext(at, event.price);
          if (event.at !== at) for (const quote of context.quotes) quote.marketTime = event.at;
          return { at, context, session, prices: new Map(context.quotes.map(q => [q.symbol, q.price])), evidence: { independentSimulation: true } };
        } };
      const replayNow = new Date(Date.parse(events.at(-1).at) + 300000);
      // 运行时每批有一秒时间预算；繁忙宿主机可能需要多批，不能把批次结束当成回放完成。
      for (let batch = 0; batch < events.length + 4; batch++) {
        await new LiveReplayRuntime(db, source, matches).reconcile(match.id, replayNow);
        const timeline = await liveTimeline(db, match.id);
        assert.notEqual(timeline.status, 'blocked', timeline.reason ?? '回放阻塞');
        if (timeline.phase !== 'replay') break;
      }
      assert.equal((await liveTimeline(db, match.id)).phase, 'live', '全部事件必须完成回放');
      const final = await read(), expected = simulateCase(sample, submitted);
      assert.deepEqual(economics(final), economics(expected.final), sample.id + ' 实时与回放必须逐笔一致');
      const cycles = await db.$queryRaw`SELECT id FROM "ArenaLiveCycle" WHERE "matchId"=${match.id}::uuid`;
      assert.equal(cycles.length, 1, '已有计划不需要新模型调用');
      const configurationConforms = caseConfigurationConforms(sample, decision, initial);
      const executionConforms = caseExecutionConforms(sample, submitted, { final, snapshots: expected.snapshots });
      const category = configurationConforms ? (executionConforms ? 'passed' : 'engine_execution_deviation') : 'model_selected_wrong_structure';
      const result = { id: sample.id, category, replayed: true, runtimeMatchesDomain: true, modelCalls: 0,
        configuration: decision, readback: arenaDecisionPlanLines(decision, undefined, initial),
        fills: final.fills.map(({ side, quantity, price }) => ({ side, quantity, price })) };
      write(sample.id + '.json', { sourceCapture: resolve(capture, sample.id + '.json'), originalIntent: captured.intent, submitted, snapshots, final, result });
      results.push(result);
    }
    return { status: results.every(r => r.category === 'passed') ? 'passed' : 'needs_attention', modelCalls: 0, providerWrites: 0, historicalWrites: 0, results };
  } finally { await db.$disconnect(); }
}
