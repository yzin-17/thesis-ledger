import 'reflect-metadata';
import { Module, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LedgerController } from '../../src/ledger/ledger.controller.js';
import { LedgerCommandService } from '../../src/ledger/ledger-command.service.js';
import { CashLedgerCommandService } from '../../src/ledger/cash-ledger-command.service.js';
import { LedgerV2Repository } from '../../src/ledger/ledger-v2.repository.js';
import { LedgerQueryService } from '../../src/ledger/ledger-query.service.js';
import { LedgerService } from '../../src/ledger/ledger.service.js';
import { BaselineImportService } from '../../src/ledger/baseline-import.service.js';
import { BaselineReconciliationService } from '../../src/ledger/baseline-reconciliation.service.js';
import { InstrumentDirectoryService } from '../../src/market/instruments/instrument-directory.service.js';
import { ApiExceptionFilter } from '../../src/platform/api-exception.filter.js';
import {
  ledgerHttp,
  runCurrentLedgerHttpProbe,
  runOldLedgerHttpProbe,
} from './current-envelope-http-probe.js';

const databaseUrl = process.env.LEDGER_CURRENT_TEST_DATABASE_URL;
const isolated = databaseUrl ? describe : describe.skip;

isolated('隔离 PostgreSQL 与生产 Ledger HTTP 闭环', () => {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl ?? '' });
  const repository = new LedgerV2Repository(prisma as never);
  const queries = new LedgerQueryService(
    prisma as never,
    repository,
    new InstrumentDirectoryService(prisma as never),
  );
  let app: INestApplication;
  let origin: string;
  beforeAll(async () => {
    const url = new URL(databaseUrl ?? '');
    if (url.hostname !== '127.0.0.1' || url.pathname !== '/ledger_current_fixture')
      throw new Error('仅允许 E03 独立本机数据库');
    const identity = await prisma.$queryRaw<
      Array<{ name: string }>
    >`SELECT current_database() AS name`;
    expect(identity[0]?.name).toBe('ledger_current_fixture');
    // Vitest 转换不生成构造参数元数据，生产 Nest build 会生成。
    Reflect.defineMetadata(
      'design:paramtypes',
      [
        LedgerService,
        LedgerCommandService,
        CashLedgerCommandService,
        BaselineImportService,
        BaselineReconciliationService,
        LedgerQueryService,
      ],
      LedgerController,
    );
    @Module({
      controllers: [LedgerController],
      providers: [
        { provide: LedgerCommandService, useValue: new LedgerCommandService(repository) },
        { provide: CashLedgerCommandService, useValue: new CashLedgerCommandService(repository) },
        { provide: LedgerQueryService, useValue: queries },
        { provide: LedgerService, useValue: {} },
        { provide: BaselineImportService, useValue: {} },
        { provide: BaselineReconciliationService, useValue: {} },
      ],
    })
    class HttpModule {}
    app = await NestFactory.create(HttpModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.listen(0, '127.0.0.1');
    origin = await app.getUrl();
  });
  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  it('当前 HTTP 创建、幂等、修订、撤销、恢复、审计与历史重放保持经济投影', async () => {
    const account = await prisma.account.create({
      data: { name: 'E03-d HTTP 夹具', type: 'securities' },
    });
    await prisma.asset.upsert({
      where: { symbol: '600519.SH' },
      update: {},
      create: {
        symbol: '600519.SH',
        name: 'E03 经济夹具',
        market: 'CN',
        assetType: 'stock',
        currency: 'CNY',
        identityStatus: 'confirmed',
      },
    });
    const result = await runCurrentLedgerHttpProbe(ledgerHttp(origin), account.id, '600519.SH');
    expect(result.audit.events).toHaveLength(5);
    const rows = await prisma.ledgerEvent.findMany({ where: { accountId: account.id } });
    expect(rows.every((row) => row.envelopeVersion === 3 && row.payloadVersion === 1)).toBe(true);
    const position = await prisma.position.findFirstOrThrow({ where: { accountId: account.id } });
    expect(position.quantity.toString()).toBe('10');
    const balance = await prisma.cashBalance.findFirstOrThrow({ where: { accountId: account.id } });
    expect(balance.settledAmount.toString()).toBe('898');
    expect(balance.pendingPayable.toString()).toBe('0');
    const state = await prisma.accountLedgerState.findUniqueOrThrow({
      where: { accountId: account.id },
    });
    expect(state).toMatchObject({ ledgerRevision: 5n, projectionGeneration: 5n });
  });

  it('旧空版本通过生产 HTTP 明确拒绝读取与写入，原状态不变', async () => {
    const account = await prisma.account.create({
      data: { name: 'E03-d 旧记录 HTTP 夹具', type: 'securities' },
    });
    const row = await prisma.ledgerEvent.create({
      data: {
        accountId: account.id,
        type: 'CASH_FLOW',
        envelopeVersion: null,
        payloadVersion: 1,
        payload: { amount: '100' },
        occurredAt: new Date('2026-09-29T02:00:00.000Z'),
      },
    });
    const before = await prisma.ledgerEvent.findMany({ where: { accountId: account.id } });
    const rejected = await runOldLedgerHttpProbe(
      ledgerHttp(origin),
      account.id,
      row.id,
      '600519.SH',
    );
    expect(rejected.results).toHaveLength(5);
    expect(await prisma.ledgerEvent.findMany({ where: { accountId: account.id } })).toEqual(before);
    expect(
      await prisma.accountLedgerState.findUnique({ where: { accountId: account.id } }),
    ).toBeNull();
    expect(await prisma.position.count({ where: { accountId: account.id } })).toBe(0);
    expect(await prisma.cashBalance.count({ where: { accountId: account.id } })).toBe(0);
  });
});
