import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { MarketInstrumentEvidence } from '../../dist/src/market/market-instrument-evidence.js';
import { MarketNewsController } from '../../dist/src/market/market-news.controller.js';
import { MarketNewsReader } from '../../dist/src/market/market-news-reader.js';
import { MarketNewsFeedReader } from '../../dist/src/market/market-news-feed-reader.js';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaService } from '../../dist/src/platform/prisma.service.js';
import { ApiExceptionFilter } from '../../dist/src/platform/api-exception.filter.js';
import { IdentityController } from '../../dist/src/identity/identity.controller.js';
import { IdentityGuard } from '../../dist/src/identity/identity.guard.js';
import { IdentityService } from '../../dist/src/identity/identity.service.js';
import { InstrumentDisplayService } from '../../dist/src/market/instruments/instrument-display.service.js';
import { MarketPeriodCalendarReader } from '../../dist/src/market/market-period-calendar-reader.js';
import { WatchlistController } from '../../dist/src/watchlist/watchlist.controller.js';
import { WatchlistReader } from '../../dist/src/watchlist/watchlist-reader.js';
import { WatchlistRepository } from '../../dist/src/watchlist/watchlist.repository.js';
import { ModelArenaController } from '../../dist/src/model-arena/model-arena.controller.js';
import { ModelArenaRepository } from '../../dist/src/model-arena/model-arena.repository.js';
import { ArenaRoundReports } from '../../dist/src/model-arena/arena-round-report.js';
import { ArenaSchedule } from '../../dist/src/model-arena/arena-schedule.js';
import { ArenaComparisons } from '../../dist/src/model-arena/arena-comparison.js';
import { ArenaWeekController } from '../../dist/src/model-arena/arena-week.controller.js';
import { ArenaWeekProjector } from '../../dist/src/model-arena/arena-week-project.js';
import { ArenaWeekStore } from '../../dist/src/model-arena/arena-week-store.js';

export function fixtureDatabase() {
  const url = new URL(process.env.JOURNAL_REVIEW_DATABASE_URL);
  if (
    url.hostname !== '127.0.0.1' ||
    url.pathname !== '/journal_review_fixture' ||
    process.env.NODE_ENV !== 'test' ||
    !process.env.ARENA_QUEUE_TEST_SCOPE
  )
    throw Error('需要隔离数据库与队列');
  url.username = 'fixture_app';
  return new PrismaService({ datasourceUrl: url.href });
}

export function sessions() {
  const base = new Date();
  // 使用未来的周四、周五和下周一，确保宿主数据库实际写入时间早于周报截止。
  base.setUTCDate(base.getUTCDate() + ((4 - base.getUTCDay() + 7) % 7) + 7);
  return [0, 1, 4].map((delta) => {
    const day = new Date(base);
    day.setUTCDate(day.getUTCDate() + delta);
    const tradingDate = day.toISOString().slice(0, 10);
    return { tradingDate, startAt: tradingDate + 'T01:30:00Z', endAt: tradingDate + 'T07:00:00Z' };
  });
}

export function fixtureNews(symbol, day) {
  const file = new URL(
    '../../../../packages/schemas/fixtures/news-search-v1.samples.json',
    import.meta.url,
  );
  const sample = JSON.parse(readFileSync(file, 'utf8')).samples.find(
    (s) => s.name === 'available',
  ).response;
  const item = {
    ...sample.items[0],
    title: '受控公告披露新增订单',
    publishedAt: day.endAt,
    sourceAvailableAt: day.endAt,
    fetchedAt: day.endAt,
    relatedInstruments: [{ market: 'CN', assetType: 'STOCK', symbol }],
  };
  return {
    ref: symbol + ':' + item.id,
    async read(input) {
      const items =
        input.instrument.symbol === symbol &&
        Date.parse(input.publishedStart) <= Date.parse(day.endAt) &&
        Date.parse(day.endAt) <= Date.parse(input.publishedEnd)
          ? [item]
          : [];
      return {
        instrument: input.instrument,
        status: 'available',
        items,
        errors: [],
        source: sample.route,
        fetchedAt: input.publishedEnd,
        upstreamAttempts: 1,
        nextCursor: null,
        cacheIdentity: 'market-news-v1:' + 'a'.repeat(64),
        coverage: {
          ...sample.coverage,
          publishedStart: input.publishedStart,
          publishedEnd: input.publishedEnd,
          examinedCount: items.length,
          returnedCount: items.length,
          uniqueEvidenceCount: items.length,
        },
      };
    },
  };
}

export async function serve(db, days, news) {
  const calendar = {
    market: 'CN',
    timezone: 'Asia/Shanghai',
    revision: 'fixture',
    coverageStart: days[0].tradingDate,
    coverageEnd: days[2].tradingDate,
    sessions: days,
  };
  class FixtureModule {}
  Module({
    controllers: [
      IdentityController,
      WatchlistController,
      MarketNewsController,
      ModelArenaController,
      ArenaWeekController,
    ],
    providers: [
      { provide: PrismaService, useValue: db },
      { provide: MarketNewsReader, useValue: news },
      { provide: MarketNewsFeedReader, useValue: {} },
      { provide: InstrumentDisplayService, useValue: new InstrumentDisplayService(db) },
      {
        provide: MarketPeriodCalendarReader,
        useValue: { read: async () => ({ status: 'ready', calendar }) },
      },
      IdentityService,
      IdentityGuard,
      WatchlistReader,
      WatchlistRepository,
      ModelArenaRepository,
      ArenaSchedule,
      ArenaRoundReports,
      ArenaComparisons,
      ArenaWeekProjector,
      ArenaWeekStore,
    ],
  })(FixtureModule);
  const app = await NestFactory.create(FixtureModule, { logger: false, abortOnError: false });
  app.useGlobalFilters(new ApiExceptionFilter());
  app.setGlobalPrefix('api/v1', { exclude: ['api/market-data/news'] });
  await app.listen(0, '127.0.0.1');
  return app;
}

export function sources(symbol, day, news) {
  const availableAt = day.endAt;
  const evidence = new MarketInstrumentEvidence(
    undefined,
    undefined,
    undefined,
    undefined,
    news,
    undefined,
  );
  const market = {
    prepare: async () => {},
    corporateActions: async () => ({ [symbol]: ['cash', 'split'] }),
    recentNews: evidence.recentNews.bind(evidence),
    read: async (_, date) => [
      {
        kind: 'daily_bar',
        symbol,
        date,
        ref: 'bar:' + date,
        availableAt,
        observedAt: availableAt,
        open: '10',
        close: '10',
      },
    ],
  };
  const provider = (model) => ({
    metadata: {
      modelPricing: { [model]: { costPer1kInput: 0, costPer1kOutput: 0, costCurrency: 'USD' } },
    },
    sdkRuntime: () => ({ baseURL: 'http://127.0.0.1:1', apiKey: '', authMode: 'none' }),
  });
  const routes = {
    strict: (_, model) => provider(model),
    strictReadyContract: ({ model }) => ({
      provider: provider(model),
      execution: { mode: 'json_validated', adapter: 'openai-compatible' },
    }),
  };
  const calls = [];
  const sdk = {
    async generate({ model, messages }) {
      const input = JSON.parse(messages[1].content);
      calls.push({ model, input });
      const order =
        model === 'alpha' ? { action: 'target', weightBps: 5000 } : { action: 'observe' };
      return {
        actualModel: model,
        output: {
          actions: [
            {
              symbol,
              ...order,
              references: [news.ref],
              reason: '基于冻结资讯的受控判断',
              invalidatedBy: '订单取消',
            },
          ],
        },
        usage: { status: 'reported', inputTokens: 100, outputTokens: 50, totalTokens: 150 },
        providerCost: '0',
        providerCostCurrency: 'USD',
      };
    },
  };
  const opening = {
    read: async ({ openAt }) => ({
      status: 'available',
      fact: {
        symbol,
        openAt: openAt.toISOString(),
        price: '10',
        lot: '1',
        tick: '0.01',
        sellable: '0',
        buyBlocked: null,
        sellBlocked: null,
        sourceRef: 'fixture:next-open',
      },
    }),
  };
  return { market, routes, calls, sdk, opening };
}
