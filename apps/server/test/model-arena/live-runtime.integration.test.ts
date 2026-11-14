import { createServer } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { aiGenerationContracts, arenaLiveAccountSchema } from '@thesis-ledger/schemas';
import type { ArenaPaperContext } from '@thesis-ledger/domain';
import { PrismaService } from '../../src/platform/prisma.service.js';
import { RedisService } from '../../src/platform/redis.service.js';
import { AiProviderRegistry } from '../../src/ai/provider-registry.js';
import { AiSdkGenerationAdapter } from '../../src/ai/ai-sdk-generation.adapter.js';
import { LiveMatchesRepository } from '../../src/model-arena/live/live-matches.repository.js';
import { LiveAppointments } from '../../src/model-arena/live/live-appointments.js';
import { LiveCyclesRepository } from '../../src/model-arena/live/live-cycles.repository.js';
import { LiveOrdersRepository } from '../../src/model-arena/live/live-orders.repository.js';
import { LiveResearchBudget } from '../../src/model-arena/live/live-research-budget.js';
import { LiveResearchCall } from '../../src/model-arena/live/live-research-call.js';
import { LiveResearchRunner } from '../../src/model-arena/live/live-research-runner.js';
import { LiveRuntime } from '../../src/model-arena/live/live-runtime.js';
import { LiveValuations } from '../../src/model-arena/live/live-valuations.js';
import { liveAgents, type LiveCycleRow } from '../../src/model-arena/live/live-storage.js';
import { liveProtocolFixture } from './live-fixture.js';
import { LiveReplayRuntime } from '../../src/model-arena/live/live-replay-runtime.js';

const url = process.env.JOURNAL_REVIEW_DATABASE_URL;
it.skipIf(!url || !process.env.ARENA_QUEUE_TEST_SCOPE).each([false, true])(
  '真实隔离队列经SDK研究、统一下单、观察成交与事件预约收敛，历史回放：%s',
  async (replayMode) => {
    if (
      new URL(url!).hostname !== '127.0.0.1' ||
      new URL(url!).pathname !== '/journal_review_fixture'
    )
      throw Error('需要专属隔离数据库');
    const db = new PrismaService({ datasourceUrl: url! }),
      redis = new RedisService();
    const { server, seen, registry } = await localLiveResearchFixture();
    const { session, market, execution } = liveExecutionFixture();
    const matches = new LiveMatchesRepository(db),
      cycles = new LiveCyclesRepository(db),
      orders = new LiveOrdersRepository(db, execution),
      appointments = new LiveAppointments(db, market);
    const budget = new LiveResearchBudget(db),
      call = new LiveResearchCall(db, registry, new AiSdkGenerationAdapter(), budget);
    const tools = {
      execute: vi.fn(
        async (_p: unknown, _request: unknown, _signal: AbortSignal, asOf?: string) => ({
          price: '10',
          symbol: 'AAPL.US',
          source: 'controlled',
          observedAt: asOf ?? new Date().toISOString(),
        }),
      ),
    };
    const runner = new LiveResearchRunner(db, call, tools, budget, orders);
    const valuations = new LiveValuations(
      db,
      {
        read: async () => ({
          at: new Date(),
          session: session(),
          prices: new Map([['AAPL.US', '10']]),
          marketTime: new Date().toISOString(),
          evidence: {},
          missing: {},
        }),
      },
      execution,
    );
    const firstReplay = '2026-11-02T14:31:00.000Z',
      secondReplay = '2026-11-02T14:32:00.000Z';
    const replay = new LiveReplayRuntime(
      db,
      {
        next: async (_p, after, target) => {
          if (after < firstReplay) return firstReplay;
          if (after < secondReplay) return secondReplay;
          return target;
        },
        observe: async (_p, at) => ({
          ...(await execution.build(undefined, undefined, undefined, undefined, at)),
          at,
          prices: new Map([['AAPL.US', '10']]),
          evidence: { controlled: true },
        }),
      },
      matches,
    );
    const runtime = new LiveRuntime(
      db,
      redis,
      market,
      appointments,
      cycles,
      orders,
      runner,
      valuations,
      matches,
      replay,
    );
    let matchId: string | undefined;
    const instrumentId = randomUUID(),
      owner = randomUUID();
    try {
      await redis.ping();
      await db.instrument.create({
        data: {
          id: instrumentId,
          canonicalCode: 'AAPL',
          market: 'US',
          instrumentType: 'STOCK',
          displayName: '受控苹果',
          generation: 1,
        },
      });
      const p = liveProtocolFixture({
        startsOn: replayMode ? '2026-11-01' : null,
        budgetCurrency: replayMode ? 'CNY' : 'USD',
        entrants: ['first', 'second'].map((model) => ({
          model,
          providerId: 'fixture',
          budget: { requests: 10, tokens: 1000000, costMicros: 1000000 },
          maxInputTokens: 50000,
          maxOutputTokens: 2000,
        })),
      });
      const created = await matches.create(owner, p);
      matchId = created.id;
      await matches.transition(owner, created.id, 'running');
      runtime.start();
      const succeeded = async () =>
        (
          await db.$queryRaw<
            LiveCycleRow[]
          >`SELECT * FROM "ArenaLiveCycle" WHERE "matchId"=${created.id}::uuid AND state='succeeded'`
        ).length;
      await vi.waitFor(async () => expect(await succeeded()).toBe(2), { timeout: 15000 });
      expect(seen).toHaveLength(4);
      expect(tools.execute).toHaveBeenCalledTimes(2);
      if (replayMode)
        expect(tools.execute.mock.calls.every((args) => args[3] === firstReplay)).toBe(true);
      const submitted = await liveAgents(db, created.id);
      expect(submitted.map((a) => arenaLiveAccountSchema.parse(a.account).orders.length)).toEqual([
        1, 1,
      ]);
      if (replayMode) {
        await replay.reconcile(created.id);
        await replay.reconcile(created.id);
      } else {
        await orders.match(created.id);
        await valuations.capture(created.id);
        await appointments.admit(created.id);
      }
      await runtime.reconcile();
      await vi.waitFor(async () => expect(await succeeded()).toBe(4), { timeout: 15000 });
      expect(seen).toHaveLength(6);
      for (const agent of await liveAgents(db, created.id)) {
        const book = arenaLiveAccountSchema.parse(agent.account);
        expect(book.fills).toHaveLength(1);
        expect(book.cash).toBe('9000');
        expect(book.wakeups.map((w) => w.condition.kind)).toEqual(['price']);
      }
      await appointments.admit(created.id);
      await runtime.reconcile();
      expect(seen).toHaveLength(6);
      await db.$executeRaw`UPDATE "ArenaLiveAgent" SET state='needs_attention' WHERE "matchId"=${created.id}::uuid`;
      for (const agent of await liveAgents(db, created.id))
        await matches.retry(owner, created.id, agent.id);
      await appointments.admit(created.id);
      redis.client.disconnect();
      await expect(runtime.reconcile()).rejects.toThrow();
      expect((await cycles.pending()).filter((c) => c.matchId === created.id)).toHaveLength(2);
      expect(seen).toHaveLength(6);
      await redis.client.connect();
      await matches.transition(owner, created.id, 'paused');
    } finally {
      await runtime.onModuleDestroy();
      await redis.onModuleDestroy();
      server.close();
      server.closeAllConnections();
      if (matchId) {
        await db.$executeRaw`DELETE FROM "ArenaLiveValuation" WHERE "matchId"=${matchId}::uuid`;
        await db.$executeRaw`DELETE FROM "ArenaLiveCycle" WHERE "matchId"=${matchId}::uuid`;
        await db.$executeRaw`DELETE FROM "ArenaLiveAgent" WHERE "matchId"=${matchId}::uuid`;
        await db.$executeRaw`DELETE FROM "ArenaLiveMatch" WHERE id=${matchId}::uuid`;
      }
      await db.instrument.deleteMany({ where: { id: instrumentId } });
      await db.$disconnect();
    }
  },
  45000,
);

async function localLiveResearchFixture() {
  const counts = new Map<string, number>(),
    seen: Record<string, unknown>[] = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(Buffer.from(c));
    const body = JSON.parse(Buffer.concat(chunks).toString()) as {
      model: string;
      messages: unknown[];
    };
    seen.push(body);
    const count = (counts.get(body.model) ?? 0) + 1;
    counts.set(body.model, count);
    let output: unknown;
    if (count === 1) output = { action: 'tools', requests: [{ name: 'quote', symbol: 'AAPL.US' }] };
    else
      output = {
        action: 'decision',
        decision: {
          summary: count === 2 ? '受控研究后限价买入' : '成交后保持观察',
          orders:
            count === 2
              ? [
                  {
                    clientId: 'buy',
                    symbol: 'AAPL.US',
                    side: 'buy',
                    kind: 'limit',
                    quantity: '100',
                    price: '10',
                    expiresOn: null,
                    exitGroup: null,
                  },
                ]
              : [],
          cancelOrderIds: [],
          watchedSymbols: ['AAPL.US'],
          wakeups:
            count === 2
              ? [{ kind: 'fill', symbol: 'AAPL.US' }]
              : [{ kind: 'price', symbol: 'AAPL.US', operator: 'lte', price: '9' }],
        },
      };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        id: randomUUID(),
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: body.model,
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: JSON.stringify(output) },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      }),
    );
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw Error('本机模型HTTP未启动');
  const baseURL = 'http://127.0.0.1:' + addr.port + '/v1';
  const registry = new AiProviderRegistry();
  registry.register({
    id: 'fixture',
    models: ['first', 'second'],
    metadata: {
      baseURL,
      authMode: 'none',
      upstreamFormat: 'chat-completions',
      chatImplementation: 'compatible',
      adapter: 'openai-compatible',
      modelPricing: Object.fromEntries(
        ['first', 'second'].map((model) => [
          model,
          {
            costPer1kInput: 0,
            costPer1kOutput: 0,
            costCurrency: 'USD',
            pricingVersion: 'controlled',
            updatedAt: new Date().toISOString(),
            source: 'user' as const,
          },
        ]),
      ),
      executionRoutes: ['first', 'second'].map((model) => ({
        model,
        mode: 'json_validated',
        contract: aiGenerationContracts.arenaLiveResearch.ref,
      })),
    },
    sdkRuntime: () => ({ baseURL, apiKey: '', authMode: 'none', timeoutMs: 10000 }),
  });

  return { server, seen, registry };
}
function liveExecutionFixture() {
  const session = (now = new Date()) => {
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(now);
    return {
      state: 'open' as const,
      tradingDayState: 'open' as const,
      date: day,
      evaluatedAt: now.toISOString(),
      sessions: [
        {
          tradingDate: day,
          startAt: new Date(now.getTime() - 3600000).toISOString(),
          endAt: new Date(now.getTime() + 3600000).toISOString(),
        },
      ],
    };
  };
  const market = {
    getSession: vi.fn(async (_market: unknown, at?: Date) => session(at)),
    getQuote: vi.fn(),
  };
  const execution = {
    build: vi.fn(
      async (
        _p?: unknown,
        _books?: unknown,
        _decision?: unknown,
        _symbols?: unknown,
        replayAt?: string,
      ) => {
        const at = replayAt ?? new Date().toISOString(),
          day = session(new Date(at)).date;
        return {
          session: session(new Date(at)),
          missing: {},
          context: {
            at,
            tradingDate: day,
            maxPositionBps: 10000,
            maxActiveSymbols: 50,
            fees: { buyBps: 0, sellBps: 0, minimum: '0', slippageBps: 0 },
            allowedSymbols: new Set(['AAPL.US']),
            quotes: [
              {
                symbol: 'AAPL.US',
                price: '10',
                marketTime: at,
                observedAt: at,
                sourceRef: 'controlled-market',
                evidence: { controlled: true },
                tradingDate: day,
                positionAvailableOn: day,
                cashAvailableOn: day,
                lot: '1',
                tick: '0.01',
                buyBlocked: null,
                sellBlocked: null,
                statutoryBuyFee: () => '0',
                statutorySellFee: () => '0',
              },
            ],
            expiresAt: () => new Date(Date.parse(at) + 3600000).toISOString(),
            newId: randomUUID,
          } satisfies ArenaPaperContext,
        };
      },
    ),
  };

  return { session, market, execution };
}
