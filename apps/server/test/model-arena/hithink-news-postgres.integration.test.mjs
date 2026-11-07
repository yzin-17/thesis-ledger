import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import {
  correlateMarketNewsRead,
  marketInstrumentFactSchema,
  marketNewsDefaultPageSize,
  marketNewsDefaultWindowMs,
  marketNewsReadResultSchema,
} from '@thesis-ledger/schemas';

const receiptDir = process.env.ARENA_HITHINK_RECEIPT_DIR;
const symbol = '600036.SH';

function receipt(name) {
  return JSON.parse(readFileSync(join(receiptDir, name), 'utf8'));
}

// 使用目标 Server 的双入口回执，不重拉新闻。隔离库使用受控收盘价和进程内模型接收端。
it.skipIf(!receiptDir)('详情显示的同花顺新闻进入两个参赛者共享的冻结材料', async () => {
  const url = new URL(process.env.JOURNAL_REVIEW_DATABASE_URL);
  expect([url.hostname, url.pathname, process.env.NODE_ENV]).toEqual([
    '127.0.0.1',
    '/journal_review_fixture',
    'test',
  ]);
  const { PrismaService } = await import('../../dist/src/platform/prisma.service.js');
  const { ArenaResearchPackets } =
    await import('../../dist/src/model-arena/arena-research-packets.js');
  const { ArenaRoundAdmission } =
    await import('../../dist/src/model-arena/arena-round-admission.js');
  const { ArenaModelDecisions } =
    await import('../../dist/src/model-arena/arena-model-decisions.js');
  const { ModelArenaRepository } =
    await import('../../dist/src/model-arena/model-arena.repository.js');
  const { ArenaRoundReports } = await import('../../dist/src/model-arena/arena-round-report.js');
  const { sources } = await import('./journey-fixture.mjs');
  const { releaseArenaFixture } = await import('./fixture-cleanup.js');
  const detail = marketNewsReadResultSchema.parse(receipt('instrument-detail-live.json'));
  const capture = receipt('arena-source-live.json');
  const page = correlateMarketNewsRead(capture.query, capture.page);
  const facts = marketInstrumentFactSchema.array().parse(capture.facts);
  for (const response of [detail, page]) {
    expect(response.instrument).toEqual({ symbol, market: 'CN', assetType: 'STOCK' });
    expect(response.source).toMatchObject({
      providerId: 'hithink',
      upstreamSource: 'hithink-news-stock-timeline',
    });
    expect(['available', 'partial']).toContain(response.status);
    expect(response.errors).toEqual([]);
    expect(
      Date.parse(response.coverage.publishedEnd) - Date.parse(response.coverage.publishedStart),
    ).toBe(marketNewsDefaultWindowMs);
  }
  expect(page.source).toEqual(detail.source);
  expect(capture.query.limit).toBe(marketNewsDefaultPageSize);
  const sharedItems = page.items.filter((i) =>
    detail.items.some(
      (d) =>
        d.id === i.id &&
        d.title === i.title &&
        d.publisher === i.publisher &&
        Date.parse(d.publishedAt) === Date.parse(i.publishedAt) &&
        (d.originalUrl ?? d.url) === (i.originalUrl ?? i.url),
    ),
  );
  expect(sharedItems.length).toBeGreaterThan(0);
  const article = sharedItems.find((item) => item.title.includes('招商银行')) ?? sharedItems[0];
  const news = { ref: symbol + ':' + article.id };
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(
    new Date(page.fetchedAt),
  );
  const protocol = {
    ...receipt('arena-protocol.json'),
    title: '同花顺新闻隔离联验',
    startsOn: day,
    endsOn: day,
  };
  const [instrument] = protocol.instruments;
  expect(instrument.symbol).toBe(symbol);
  const owner = randomUUID();
  const db = new PrismaService({ datasourceUrl: url.href });
  try {
    await db.instrument.create({
      data: {
        id: instrument.instrumentId,
        market: 'SH',
        canonicalCode: '600036',
        instrumentType: 'STOCK',
        displayName: '招商银行',
        generation: 1,
      },
    });
    const store = new ModelArenaRepository(db);
    const match = await store.create(owner, protocol);
    await store.transition(owner, match.id, 'running');
    const now = Date.now();
    await db.arenaOccurrence.create({
      data: {
        arenaId: match.id,
        tradingDate: day,
        dueAt: new Date(now - 1000),
        deadlineAt: new Date(now + 60_000),
        nextOpenAt: new Date(now + 86400_000),
        calendarRevision: protocol.calendarVersion,
        maxAttempts: 1,
        state: 'complete',
      },
    });
    const entrants = (await store.read(owner, match.id)).entrants;
    const round = await new ArenaRoundAdmission(db).open(
      owner,
      match.id,
      day,
      new Map(
        entrants.map((e) => [
          e.id,
          { currency: 'USD', maxCostMicros: e.providerId === 'cloudflare' ? 2800 : 0 },
        ]),
      ),
    );
    expect(round.outcome.state).toBe('open');
    const { market, routes, sdk, calls } = sources(
      symbol,
      { endAt: new Date(page.fetchedAt).toISOString() },
      news,
    );
    let reads = 0;
    const packets = new ArenaResearchPackets(db, {
      ...market,
      async recentNews(p) {
        expect(p.instruments).toEqual(protocol.instruments);
        reads++;
        return facts;
      },
    });
    const packet = await packets.freeze(round.id);
    expect((await packets.freeze(round.id)).id).toBe(packet.id);
    expect(reads).toBe(1);
    const entries = await db.arenaReservation.findMany({ where: { roundId: round.id } });
    expect(entries.map((e) => e.decisionState)).toEqual(['ready', 'ready']);
    const decider = new ArenaModelDecisions(db, routes, sdk);
    await Promise.all(entries.map((e) => decider.execute(e.id)));
    const report = await new ArenaRoundReports(db).read(owner, match.id, round.id);
    expect(report.fingerprint).toBe(packet.fingerprint);
    expect(calls.map((c) => c.model).sort()).toEqual(protocol.entrants.map((e) => e.model).sort());
    for (const c of calls) expect(c.input.facts).toEqual(packet.facts);
    const articles = report.facts.filter((f) => f.kind === 'news');
    expect(articles).toEqual([...facts].sort((a, b) => a.ref.localeCompare(b.ref)));
    expect(articles.map((a) => a.ref).sort()).toEqual(
      page.items.map((i) => symbol + ':' + i.id).sort(),
    );
    for (const a of articles) {
      const item = page.items.find((i) => symbol + ':' + i.id === a.ref);
      expect(a).toMatchObject({
        title: item.title,
        publishedAt: new Date(item.publishedAt).toISOString(),
        publisher: item.publisher,
        url: item.originalUrl ?? item.url,
        symbol,
      });
      expect(Date.parse(a.availableAt)).toBeGreaterThanOrEqual(Date.parse(item.fetchedAt));
      expect(Date.parse(a.availableAt)).toBeLessThanOrEqual(packet.asOf.getTime());
      expect(Date.parse(a.publishedAt)).toBeLessThanOrEqual(packet.asOf.getTime());
    }
    for (const e of report.entries) expect(e.decision.actions[0].references).toEqual([news.ref]);
    const evidence = {
      targetSource: page.source,
      upstreamAttempts: page.upstreamAttempts,
      status: page.status,
      overlap: sharedItems.length,
      asOf: packet.asOf,
      fingerprint: packet.fingerprint,
      localModelReceivers: calls.map((c) => c.model),
      reference: news.ref,
      articles,
    };
    writeFileSync(
      join(
        receiptDir,
        'research-freeze-' + packet.asOf.toISOString().replaceAll(':', '-') + '.json',
      ),
      JSON.stringify(evidence, null, 2),
      { flag: 'wx', mode: 0o600 },
    );
    console.log(
      '同花顺冻结材料',
      JSON.stringify({
        articles: articles.length,
        sharedItems: sharedItems.length,
        modelInputs: calls.length,
        asOf: packet.asOf,
        fingerprint: packet.fingerprint,
        ref: news.ref,
      }),
    );
  } finally {
    await releaseArenaFixture(db, owner);
    await db.$disconnect();
  }
});
