// 原样复用真实模型的已保存输出；修复验收版本号后重新提交，不新增模型调用。
import '../../apps/server/node_modules/reflect-metadata/Reflect.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { arenaLiveAccountSchema, arenaLiveDecisionSchema, arenaLiveProtocolSchema } from '../../packages/schemas/dist/index.js';
import { arenaDecisionPlanLines, arenaDueWakeups } from '../../packages/domain/dist/index.js';
import { fixtureAt, protectionContext } from '../fixtures/arena-contingent-orders.mjs';
import { PrismaService } from '../../apps/server/dist/src/platform/prisma.service.js';
import { LiveMatchesRepository } from '../../apps/server/dist/src/model-arena/live/live-matches.repository.js';
import { LiveOrdersRepository } from '../../apps/server/dist/src/model-arena/live/live-orders.repository.js';
import { LiveReplayRuntime } from '../../apps/server/dist/src/model-arena/live/live-replay-runtime.js';
import { liveAgents } from '../../apps/server/dist/src/model-arena/live/live-storage.js';
import { saveLiveTimeline, liveTimeline } from '../../apps/server/dist/src/model-arena/live/live-timeline.js';
import { replayAdvancedContingentCaptures } from './arena-contingent-advanced-replay.mjs';

export async function replayContingentCaptures({ databaseUrl, capture, output }) {
  if (!existsSync(resolve(capture, 'sell.json'))) return replayAdvancedContingentCaptures({ databaseUrl, capture, output });
  const firstCapture = JSON.parse(readFileSync(resolve(capture, 'sell.json'), 'utf8'));
  if (firstCapture.cycle.input.protocol.matching) return replayAdvancedContingentCaptures({ databaseUrl, capture, output });
  const url = new URL(databaseUrl);
  assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.pathname, '/arena_contingent_model_acceptance');
  const db = new PrismaService({ datasourceUrl: databaseUrl }), results = [];
  const write = (name, data) => writeFileSync(resolve(output, name), JSON.stringify(data, null, 2), { mode: 0o600, flag: 'wx' });
  try {
    for (const id of ['sell', 'research', 'full', 'each']) {
      const captured = JSON.parse(readFileSync(resolve(capture, id + '.json'), 'utf8'));
      if (!captured.result.configuration) {
        results.push({ id, status: 'no_valid_configuration', supported: captured.result.supported,
          category: captured.result.category, reason: captured.cycle.reason,
          generationErrors: captured.cycle.requestAudit.calls.flatMap(c => c.error ? [c.error.code ?? c.error] : []) });
        continue;
      }
      const decision = arenaLiveDecisionSchema.parse(captured.result.configuration);
      const protocol = arenaLiveProtocolSchema.parse(captured.cycle.input.protocol);
      const matches = new LiveMatchesRepository(db), owner = randomUUID(), match = await matches.create(owner, protocol);
      await matches.transition(owner, match.id, 'running');
      const [agent] = await liveAgents(db, match.id), initial = arenaLiveAccountSchema.parse(agent.account);
      await saveLiveTimeline(db, match.id, { ...await liveTimeline(db, match.id), phase: 'replay', cursorAt: fixtureAt,
        pendingAt: fixtureAt, status: 'research', reason: null });
      const cycleId = randomUUID(), deadline = new Date(Date.now() + 60000);
      const frozen = { ...captured.cycle.input, account: initial };
      await db.$executeRaw`INSERT INTO "ArenaLiveCycle" (id,"matchId","agentId",state,attempt,trigger,"bookRevision","requestId",input,"leaseUntil","deadlineAt")
        VALUES (${cycleId}::uuid,${match.id}::uuid,${agent.id}::uuid,'running',1,'[]',${initial.revision},${randomUUID()}::uuid,${JSON.stringify(frozen)}::jsonb,${deadline},${deadline})`;
      const session = { state: 'open', date: '2026-11-13', sessions: [{ tradingDate: '2026-11-13', startAt: '2026-11-13T14:30:00Z', endAt: '2026-11-13T21:00:00Z' }] };
      const second = '2026-11-13T15:01:00.000Z', third = '2026-11-13T15:02:00.000Z';
      let entered;
      const observe = async (_p, at) => {
        if (at === third) entered = arenaLiveAccountSchema.parse((await liveAgents(db, match.id))[0].account);
        const context = protectionContext(at, at === second ? '359' : '350');
        return { at, context, session, prices: new Map(context.quotes.map(q => [q.symbol, q.price])), evidence: { synthetic: true } };
      };
      const submitted = await new LiveOrdersRepository(db, { build: async () => ({ session, context: protectionContext(), missing: {} }) }).submit(cycleId, 1, decision);
      await db.$executeRaw`UPDATE "ArenaLiveAgent" SET state='budget_exhausted',reason='participant_budget' WHERE id=${agent.id}::uuid`;
      const source = { observe, next: async (_p, after, target) => {
        if (Date.parse(after) < Date.parse(second) && Date.parse(second) <= Date.parse(target)) return second;
        if (Date.parse(after) < Date.parse(third) && Date.parse(third) <= Date.parse(target)) return third;
        return target;
      } };
      const replayNow = new Date('2026-11-13T15:05:00.000Z');
      await new LiveReplayRuntime(db, source, matches).reconcile(match.id, replayNow);
      await new LiveReplayRuntime(db, source, matches).reconcile(match.id, replayNow);
      const final = arenaLiveAccountSchema.parse((await liveAgents(db, match.id))[0].account);
      const priceEvents = arenaDueWakeups(final.wakeups.filter(w => w.condition.kind === 'price'), protectionContext(third, '350').quotes, final.fills, third);
      const cycles = await db.$queryRaw`SELECT id,state FROM "ArenaLiveCycle" WHERE "matchId"=${match.id}::uuid`;
      const result = { id, supported: captured.result.supported, configuration: decision, readback: arenaDecisionPlanLines(decision),
        fills: final.fills.map(({ side, quantity, price }) => ({ side, quantity, price })),
        protectedAfterEntry: entered.orders.filter(o => o.parentOrderId && o.state === 'active').map(o => o.quantity),
        priceResearchEligible: priceEvents.length > 0, cycles: cycles.length, modelCalls: 0,
        category: captured.result.supported ? 'passed' : 'schema_not_supported' };
      write(id + '.json', { sourceCapture: resolve(capture, id + '.json'), originalIntent: captured.intent, submitted, entered, final, result });
      if (id !== 'each') {
        assert.deepEqual(final.fills.map(f => f.side), id === 'research' ? ['buy'] : ['buy', 'sell']);
        assert.equal(final.fills[0]?.quantity, '27');
        if (id !== 'research') {
          assert.deepEqual(result.protectedAfterEntry, ['27']); assert.equal(final.fills[1].quantity, '27');
          assert.equal(final.fills[1].price, '350');
        } else { assert.equal(priceEvents.length, 1); assert.equal(final.positions[0]?.quantity, '27'); }
        assert.equal(cycles.length, 1, '已有委托无需新模型周期');
      }
      results.push(result);
    }
    return { status: 'passed_supported_captured_cases', modelCalls: 0, providerWrites: 0, historicalWrites: 0, results };
  } finally { await db.$disconnect(); }
}
