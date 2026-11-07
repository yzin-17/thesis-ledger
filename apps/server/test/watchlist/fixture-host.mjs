import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../dist/src/platform/prisma.service.js';
import { ApiExceptionFilter } from '../../dist/src/platform/api-exception.filter.js';
import { WatchlistController } from '../../dist/src/watchlist/watchlist.controller.js';
import { WatchlistRepository } from '../../dist/src/watchlist/watchlist.repository.js';
import { WatchlistReader } from '../../dist/src/watchlist/watchlist-reader.js';
import { IdentityGuard } from '../../dist/src/identity/identity.guard.js';
import { IdentityService } from '../../dist/src/identity/identity.service.js';
import { IdentityController } from '../../dist/src/identity/identity.controller.js';
import { InstrumentDisplayService } from '../../dist/src/market/instruments/instrument-display.service.js';

const url = new URL(process.env.JOURNAL_REVIEW_DATABASE_URL);
if (!process.send || url.hostname !== '127.0.0.1' || url.pathname !== '/journal_review_fixture')
  throw new Error('需要隔离数据库及父进程');
url.username = 'fixture_app';
const db = new PrismaClient({ datasourceUrl: url.href });
class FixtureModule {}
Module({
  controllers: [WatchlistController, IdentityController],
  providers: [
    { provide: PrismaService, useValue: db },
    IdentityService,
    IdentityGuard,
    WatchlistRepository,
    WatchlistReader,
    { provide: InstrumentDisplayService, useValue: new InstrumentDisplayService(db) },
  ],
})(FixtureModule);
const app = await NestFactory.create(FixtureModule, { logger: false });
app.useGlobalFilters(new ApiExceptionFilter());
app.setGlobalPrefix('api/v1');
await app.listen(0, '127.0.0.1');
process.once('disconnect', async () => {
  await app.close();
  await db.$disconnect();
});
process.send(await app.getUrl());
