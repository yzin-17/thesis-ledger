import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { Module, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { PerformanceController } from '../../src/performance/performance.controller.js';
import { PerformanceService } from '../../src/performance/performance.service.js';
import { PerformanceDataService } from '../../src/performance/performance-data.service.js';
import { PerformanceLayerService } from '../../src/performance/performance-layer.service.js';
import { PerformanceSnapshotService } from '../../src/performance/performance-snapshot.service.js';
import { PerformanceValuationSeriesService } from '../../src/performance/performance-valuation-series.service.js';
import { ApiExceptionFilter } from '../../src/platform/api-exception.filter.js';

export const correctnessDatabaseUrl = process.env.PERFORMANCE_CORRECTNESS_DATABASE_URL;

/** 真实业务服务与存储，未装配行情/通知/模型客户端。 */
export async function createCorrectnessHttpFixture() {
  const url = new URL(correctnessDatabaseUrl ?? '');
  if (
    url.hostname !== '127.0.0.1' ||
    url.pathname !== '/portfolio_valuation_fixture' ||
    url.username !== 'fixture_owner'
  )
    throw new Error('仅允许明确的正确性隔离数据库');
  const prisma = new PrismaClient({ datasourceUrl: url.toString() });
  let app: INestApplication | undefined;
  try {
    const identity = await prisma.$queryRaw<
      Array<{ database: string; owner: string }>
    >`SELECT current_database() AS database, current_user AS owner`;
    if (
      identity[0]?.database !== 'portfolio_valuation_fixture' ||
      identity[0].owner !== 'fixture_owner'
    )
      throw new Error('隔离数据库实际身份不符');
    const market = {} as never;
    const data = new PerformanceDataService(prisma as never, market);
    const snapshots = new PerformanceSnapshotService(prisma as never, market, data);
    const layers = new PerformanceLayerService(prisma as never, market, data);
    const series = new PerformanceValuationSeriesService(
      prisma as never,
      layers,
      snapshots,
      market,
    );
    const performance = new PerformanceService(
      prisma as never,
      market,
      snapshots,
      undefined,
      layers,
      undefined,
      data,
    );
    Reflect.defineMetadata(
      'design:paramtypes',
      [PerformanceService, PerformanceValuationSeriesService],
      PerformanceController,
    );
    @Module({
      controllers: [PerformanceController],
      providers: [
        { provide: PerformanceService, useValue: performance },
        { provide: PerformanceValuationSeriesService, useValue: series },
      ],
    })
    class HttpModule {}
    app = await NestFactory.create(HttpModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.listen(0, '127.0.0.1');
    const origin = `${await app.getUrl()}/api/v1/performance`;
    const request = async (path: string, body?: unknown) => {
      const response = await fetch(
        `${origin}${path}`,
        body === undefined
          ? undefined
          : {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            },
      );
      return { status: response.status, body: (await response.json()) as Record<string, unknown> };
    };
    const account = async () =>
      (
        await prisma.account.create({
          data: { name: '收益 HTTP 合成账户', type: 'securities', mode: 'actual', currency: 'CNY' },
        })
      ).id;
    const snapshotsFor = async (accountId: string, lastValue: number) => {
      for (const [date, value] of [
        ['2025-01-01T00:00:00Z', 100],
        ['2026-01-01T00:00:00Z', lastValue],
      ] as const) {
        await prisma.portfolioSnapshot.create({
          data: {
            accountId,
            scope: 'account',
            mode: 'actual',
            slotKey: randomUUID(),
            idempotencyKey: randomUUID(),
            capturedAt: new Date(date),
            valuationDate: new Date(date),
            source: 'DAILY_CLOSE',
            valuationBasis: 'ESTIMATED',
            valuationStatus: 'COMPLETE',
            marketValue: value,
            costValue: 100,
            cashValue: 0,
            totalValue: value,
            baseCurrency: 'CNY',
            payloadVersion: 1,
            payload: { mode: 'actual', partial: false, currency: 'CNY' },
          },
        });
      }
    };
    const flow = (accountId: string, direction: 'INFLOW' | 'OUTFLOW', amount: string) =>
      prisma.ledgerEvent.create({
        data: {
          accountId,
          type: 'CASH_FLOW',
          occurredAt: new Date('2025-06-01T00:00:00Z'),
          payload: {
            direction,
            category: direction === 'INFLOW' ? 'DEPOSIT' : 'WITHDRAWAL',
            amount,
            currency: 'CNY',
          },
        },
      });
    const close = async () => {
      await app?.close();
      await prisma.$disconnect();
    };
    return { prisma, request, account, snapshotsFor, flow, close, origin };
  } catch (error) {
    await app?.close();
    await prisma.$disconnect();
    throw error;
  }
}
export type CorrectnessHttpFixture = Awaited<ReturnType<typeof createCorrectnessHttpFixture>>;
