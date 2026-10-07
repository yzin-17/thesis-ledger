import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { BacktestNavRunController } from '../../src/backtest/backtest-nav-run.controller.js';
import { BacktestNavRunListService } from '../../src/backtest/backtest-nav-run-list.service.js';
import { BacktestNavRunService } from '../../src/backtest/backtest-nav-run.service.js';
import { BacktestQueueService } from '../../src/backtest/backtest-queue.service.js';
import { BacktestRunService } from '../../src/backtest/backtest-run.service.js';
import { prepareNavRunConfigV3 } from '../../src/backtest/backtest-nav-preparation.js';
import { navPreparationFixture } from './nav-preparation.fixtures.js';

describe('NAV Run 历史列表', () => {
  it('HTTP 返回严格的当前合同摘要，跳过旧合同和损坏记录', async () => {
    const source = navPreparationFixture();
    const prepared = await prepareNavRunConfigV3(source.options);
    const config = prepared.runConfig;
    const strategyVersionId = '11111111-1111-4111-8111-111111111111';
    const periodStart = new Date(`${config.startDate}T00:00:00.000Z`);
    const periodEnd = new Date(`${config.endDate}T00:00:00.000Z`);
    const rows = [
      row('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', config, { periodStart, periodEnd }),
      row('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', config, {
        periodStart,
        periodEnd,
        createdAt: new Date('2026-09-30T09:00:00.000Z'),
      }),
      row('cccccccc-cccc-4ccc-8ccc-cccccccccccc', config, { mode: 'V2' }),
      row('dddddddd-dddd-4ddd-8ddd-dddddddddddd', config, {
        input: { contractVersion: 3, schemaVersion: '2', inputKind: 'nav', runConfig: config },
      }),
      row('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', config, {
        runConfig: {},
      }),
      row('ffffffff-ffff-4fff-8fff-ffffffffffff', config, { status: 'unknown' }),
    ];
    const findMany = vi.fn(async () => rows);
    const listService = new BacktestNavRunListService({
      backtestJob: { findMany },
    } as never);

    @Module({
      controllers: [BacktestNavRunController],
      providers: [
        { provide: BacktestNavRunService, useValue: {} },
        { provide: BacktestRunService, useValue: {} },
        { provide: BacktestQueueService, useValue: {} },
        { provide: BacktestNavRunListService, useValue: listService },
      ],
    })
    class TestModule {}

    const app = await NestFactory.create(TestModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    try {
      const response = await fetch(`${await app.getUrl()}/api/v1/backtests/runs/nav`);
      expect(response.status).toBe(200);
      const body = (await response.json()) as Array<Record<string, unknown>>;
      expect(body).toHaveLength(2);
      expect(body[0]).toEqual({
        contractVersion: 3,
        inputKind: 'nav',
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        strategyVersionId,
        symbol: config.navInput.symbol,
        status: 'queued',
        stage: 'queued',
        progress: 0,
        periodStart: new Date(`${config.startDate}T00:00:00.000Z`).toISOString(),
        periodEnd: new Date(`${config.endDate}T00:00:00.000Z`).toISOString(),
        errorCode: null,
        errorSummary: null,
        createdAt: '2026-09-30T10:00:00.000Z',
        updatedAt: '2026-09-30T10:00:00.000Z',
      });
      expect(body[1]?.id).toBe('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
      expect(body[0]).not.toHaveProperty('result');
      expect(body[0]).not.toHaveProperty('metrics');
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            mode: 'V3',
            AND: [
              { input: { path: ['contractVersion'], equals: 3 } },
              { input: { path: ['schemaVersion'], equals: '3' } },
              { input: { path: ['inputKind'], equals: 'nav' } },
            ],
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 100,
          select: expect.not.objectContaining({ result: true, snapshotManifest: true }),
        }),
      );
    } finally {
      await app.close();
    }
  });
});

function row(id: string, runConfig: unknown, overrides: Record<string, unknown> = {}) {
  return {
    id,
    strategyVersionId: '11111111-1111-4111-8111-111111111111',
    mode: 'V3',
    status: 'queued',
    stage: 'queued',
    progress: 0,
    periodStart: new Date('2026-09-01T00:00:00.000Z'),
    periodEnd: new Date('2026-09-30T00:00:00.000Z'),
    errorCode: null,
    errorSummary: null,
    createdAt: new Date('2026-09-30T10:00:00.000Z'),
    updatedAt: new Date('2026-09-30T10:00:00.000Z'),
    input: { contractVersion: 3, schemaVersion: '3', inputKind: 'nav', runConfig },
    runConfig,
    ...overrides,
  };
}
