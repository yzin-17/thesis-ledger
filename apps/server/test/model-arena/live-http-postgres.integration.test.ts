import { randomUUID } from 'node:crypto';
import { Module, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { expect, it, vi } from 'vitest';
import { ThesisLedgerApiClient } from '@thesis-ledger/api-client';
import { arenaLiveAccountSchema } from '@thesis-ledger/schemas';
import { PrismaService } from '../../src/platform/prisma.service.js';
import { ApiExceptionFilter } from '../../src/platform/api-exception.filter.js';
import { IdentityGuard } from '../../src/identity/identity.guard.js';
import { InstrumentDisplayService } from '../../src/market/instruments/instrument-display.service.js';
import { LiveMatchesController } from '../../src/model-arena/live/live-matches.controller.js';
import { LiveMatchesRepository } from '../../src/model-arena/live/live-matches.repository.js';
import { LiveMatchesQuery } from '../../src/model-arena/live/live-matches.query.js';
import { LiveValuations } from '../../src/model-arena/live/live-valuations.js';
import { LiveMatchesCatalog } from '../../src/model-arena/live/live-matches-catalog.js';
import { liveProtocolFixture } from './live-fixture.js';
import { liveAgents, saveLiveAccount } from '../../src/model-arena/live/live-storage.js';
const url = process.env.AI_PROVIDER_DATABASE_URL;
it.skipIf(!url)('共享客户端经过实际HTTP入口完成建赛、归属、暂停恢复与结束；无模型或行情出站', async () => {
  if (new URL(url!).hostname !== '127.0.0.1' || new URL(url!).pathname !== '/ai_provider_concurrency_fixture') throw Error('需要隔离数据库');
  const db = new PrismaService({ datasourceUrl: url! }), owner = randomUUID(), other = randomUUID(), ids: string[] = [];
  const store = new LiveMatchesRepository(db), capture = vi.fn();
  const market = { getSession: vi.fn().mockResolvedValue({ state: 'unknown', tradingDayState: 'unknown', reason: 'calendar_unavailable', evaluatedAt: new Date().toISOString(), sessions: [] }) };
  const query = new LiveMatchesQuery(db, new InstrumentDisplayService(db), market as never);
  const guard = { canActivate: (context: ExecutionContext) => {
    const req = context.switchToHttp().getRequest();
    const id = req.header('x-controlled-owner');
    if (id !== owner && id !== other) throw new UnauthorizedException();
    req.identityPrincipal = { id, username: 'controlled', displayName: '受控用户' }; return true;
  } };
  const auth = vi.spyOn(IdentityGuard.prototype, 'canActivate').mockImplementation(async (context) => guard.canActivate(context));
  class TestModule {}
  Module({ controllers: [LiveMatchesController], providers: [
    { provide: LiveMatchesRepository, useValue: store }, { provide: LiveMatchesQuery, useValue: query },
    { provide: LiveValuations, useValue: { capture } }, { provide: IdentityGuard, useValue: guard },
    { provide: LiveMatchesCatalog, useValue: new LiveMatchesCatalog(db) },
  ] })(TestModule);
  const app = await NestFactory.create(TestModule, { logger: false });
  app.setGlobalPrefix('api/v1'); app.useGlobalFilters(new ApiExceptionFilter()); await app.listen(0, '127.0.0.1');
  const base = await app.getUrl(), path = base + '/api/v1/arena-matches';
  const client = new ThesisLedgerApiClient(base + '/api/v1/', (input, init) => fetch(input, { ...init, headers: { ...init?.headers, 'x-controlled-owner': owner } }));
  try {
    expect((await fetch(path)).status).toBe(401);
    const unlimited = { requests: null, tokens: null, costMicros: null };
    const p = liveProtocolFixture({ startsOn: null, endsOn: null, calendarVersion: null, budget: unlimited });
    p.entrants = p.entrants.map((e) => ({ ...e, budget: unlimited }));
    const created = await client.arenaMatches.create(p); ids.push(created.id);
    expect(created.state).toBe('draft');
    expect((await client.arenaMatches.list()).map((m) => m.id)).toContain(created.id);
    const catalog = await client.arenaMatches.catalog({ search: p.title, pageSize: 10 });
    expect(catalog.items.map((m) => m.id)).toContain(created.id);
    expect((await fetch(path + '/catalog')).status).toBe(401);
    expect((await fetch(path + '/catalog?pageSize=1000', { headers: { 'x-controlled-owner': owner } })).status).toBe(400);
    expect((await fetch(path + '/catalog?ownerId=' + owner, { headers: { 'x-controlled-owner': other } })).status).toBe(400);
    const otherResult = await fetch(path + '/catalog', { headers: { 'x-controlled-owner': other } });
    expect(await otherResult.json()).toMatchObject({ items: [], total: 0 });
    const detail = await client.arenaMatches.get(created.id);
    expect(detail.agents).toHaveLength(2); expect(detail.frames).toEqual([]); expect(detail.sealedFrame).toBeNull();
    expect(detail.protocol).toMatchObject({ startsOn: null, endsOn: null, calendarVersion: null });
    expect(detail.remaining).toEqual(unlimited); for (const agent of detail.agents) expect(agent.remaining).toEqual(unlimited);
    expect(catalog.items.find((m) => m.id === created.id)).toMatchObject({ startsOn: null, endsOn: null });
    expect(detail.agents.every((a) => a.availability.cash === null && a.availability.tradingDate === null)).toBe(true);
    const first = (await liveAgents(db, created.id))[0]!, book = arenaLiveAccountSchema.parse(first.account);
    book.fills = ['2026-11-12T01:00:00.000Z', '2026-11-12T15:00:00.000Z'].map((marketTime) => ({
      id: randomUUID(), orderId: randomUUID(), symbol: 'AAPL.US', side: 'buy', quantity: '1', price: '10',
      fee: '0', cashDelta: '-10', marketTime, recordedAt: marketTime, sourceRef: 'controlled', evidence: null,
    }));
    await saveLiveAccount(db, first.id, book);
    const points = await client.arenaMatches.points(created.id, { symbol: 'AAPL.US', start: '2026-11-11', end: '2026-11-11', entrantId: first.id });
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ protocolVersion: 2, roundId: null, day: '2026-11-11', executedAt: '2026-11-12T01:00:00.000Z', entrantId: first.id });
    expect(await client.arenaMatches.points(created.id, { symbol: 'AAPL.US', start: '2026-11-11', end: '2026-11-12', entrantId: detail.agents.find((a) => a.id !== first.id)!.id })).toEqual([]);
    expect((await fetch(path + '/' + created.id + '/points?symbol=AAPL.US&start=2026-11-11&end=2026-11-12', { headers: { 'x-controlled-owner': other } })).status).toBe(404);
    expect((await fetch(path + '/' + created.id, { headers: { 'x-controlled-owner': other } })).status).toBe(404);
    expect((await fetch(path + '/invalid', { headers: { 'x-controlled-owner': owner } })).status).toBe(400);
    const invalid = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-controlled-owner': owner }, body: JSON.stringify({ ...p, ownerId: other }) });
    expect(invalid.status).toBe(400);
    await client.arenaMatches.transition(created.id, 'start');
    await expect(client.arenaMatches.transition(created.id, 'start')).rejects.toThrow();
    await client.arenaMatches.transition(created.id, 'pause');
    const paused = await client.arenaMatches.get(created.id);
    expect(paused.state).toBe('paused');
    await client.arenaMatches.transition(created.id, 'start');
    expect(await client.arenaMatches.trigger(created.id, first.id)).toEqual({ id: first.id, state: 'waiting' });
    await expect(client.arenaMatches.trigger(created.id, randomUUID())).rejects.toThrow();
    await client.arenaMatches.transition(created.id, 'end');
    expect((await client.arenaMatches.get(created.id)).state).toBe('ended');
    expect(capture).toHaveBeenCalledOnce();
    const single = await client.arenaMatches.create({ ...p, entrants: p.entrants.slice(0, 1) }); ids.push(single.id);
    expect((await client.arenaMatches.get(single.id)).agents).toHaveLength(1);
    await client.arenaMatches.transition(single.id, 'start');
    await client.arenaMatches.transition(single.id, 'pause');
    await client.arenaMatches.transition(single.id, 'start');
    await client.arenaMatches.transition(single.id, 'end');
    expect((await client.arenaMatches.get(single.id)).state).toBe('ended');
    const empty = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-controlled-owner': owner }, body: JSON.stringify({ ...p, entrants: [] }) });
    expect(empty.status).toBe(400);
    expect((await fetch(path + '/' + created.id)).status).toBe(401);
  } finally {
    auth.mockRestore();
    await app.close();
    for (const id of ids) {
      await db.$executeRaw`DELETE FROM "ArenaLiveCycle" WHERE "matchId"=${id}::uuid`;
      await db.$executeRaw`DELETE FROM "ArenaLiveAgent" WHERE "matchId"=${id}::uuid`;
      await db.$executeRaw`DELETE FROM "ArenaLiveMatch" WHERE id=${id}::uuid`;
    }
    await db.$disconnect();
  }
});
