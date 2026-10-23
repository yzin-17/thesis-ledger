import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { Module, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { ledgerEventEnvelopeSchema } from '@thesis-ledger/schemas';
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
  probeExecution,
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

  const snapshot = async (accountId: string) => ({
    events: await prisma.ledgerEvent.findMany({ where: { accountId }, orderBy: { id: 'asc' } }),
    state: await prisma.accountLedgerState.findUnique({ where: { accountId } }),
    positions: await prisma.position.findMany({ where: { accountId } }),
    balances: await prisma.cashBalance.findMany({ where: { accountId } }),
  });

  it('客户端伪报 VERIFIED 经生产 HTTP 拒绝，事务不留下事件或版本', async () => {
    const account = await prisma.account.create({
      data: { name: 'T18 未验证创建 HTTP 夹具', type: 'securities' },
    });
    const before = await snapshot(account.id);
    const command = probeExecution(account.id, '600519.SH', `t18-create-${account.id}`);
    const rejected = await ledgerHttp(origin)('/executions', {
      ...command,
      payload: { ...command.payload, capabilityVerification: 'VERIFIED' },
    });
    expect(rejected).toMatchObject({ status: 409, payload: { error: 'LEDGER_VALIDATION_FAILED' } });
    expect(await snapshot(account.id)).toEqual(before);
  });

  it('历史 VERIFIED 可读与幂等重放，新更正、跨账户及恢复均不能伪报', async () => {
    const account = await prisma.account.create({
      data: { name: 'T18 历史验证 HTTP 夹具', type: 'securities' },
    });
    const target = await prisma.account.create({
      data: { name: 'T18 跨账户 HTTP 夹具', type: 'securities' },
    });
    const request = ledgerHttp(origin);
    const command = probeExecution(account.id, '600519.SH', `t18-history-${account.id}`);
    const payload = { ...command.payload, capabilityVerification: 'VERIFIED' };
    const eventId = randomUUID();
    const result = { eventIds: [eventId] };
    // 以存储层追加升级前的独立历史夹具；不更新既有事件，也不关闭 append-only 保护。
    const eventFields = {
      occurredAt: command.occurredAt,
      timePrecision: command.timePrecision,
      sourceTimezone: command.sourceTimezone,
      economicOrderKey: command.economicOrderKey,
      source: command.source,
      actorId: command.actorId,
    };
    await repository.withAccountWrite(account.id, async (context) => {
      await repository.appendRevision(
        context,
        ledgerEventEnvelopeSchema.parse({
          ...eventFields,
          accountId: account.id,
          payload,
          version: 3,
          eventId,
          factId: randomUUID(),
          type: 'BUY_EXECUTION',
          ledgerRevision: context.nextLedgerRevision.toString(),
          recordedAt: new Date().toISOString(),
          revisionAction: 'CREATE',
          payloadVersion: 1,
        }),
      );
      return { value: null, advanceRevision: true };
    });
    const before = await snapshot(account.id);
    const targetBefore = await snapshot(target.id);
    const current = await request(`/${account.id}/events`);
    expect(current.status).toBe(200);
    expect(current.payload).toMatchObject({
      events: [{ payload: { capabilityVerification: 'VERIFIED' } }],
    });
    expect(await request('/executions', { ...command, payload })).toMatchObject({
      status: 201,
      payload: { eventIds: result.eventIds, idempotentReplay: true },
    });
    expect(await snapshot(account.id)).toEqual(before);
    const correction = {
      ...command,
      payload,
      expectedLedgerRevision: '1',
      supersedesEventId: result.eventIds[0],
      reason: 'T18 不能伪报已验证',
    };
    expect(
      await request('/executions/replace', {
        ...correction,
        command: 'REPLACE_EXECUTION',
        source: { ...command.source, externalId: `t18-replace-${account.id}` },
      }),
    ).toMatchObject({ status: 409, payload: { error: 'LEDGER_VALIDATION_FAILED' } });
    expect(
      await request('/executions/move-account', {
        ...eventFields,
        side: command.side,
        payload,
        command: 'MOVE_EXECUTION_ACCOUNT',
        sourceAccountId: account.id,
        targetAccountId: target.id,
        expectedSourceLedgerRevision: '1',
        expectedTargetLedgerRevision: '0',
        supersedesEventId: result.eventIds[0],
        reason: 'T18 跨账户不能伪报已验证',
        source: { ...command.source, externalId: `t18-move-${account.id}` },
      }),
    ).toMatchObject({ status: 409, payload: { error: 'LEDGER_VALIDATION_FAILED' } });
    expect(await snapshot(account.id)).toEqual(before);
    expect(await snapshot(target.id)).toEqual(targetBefore);
    const voided = await request('/executions/void', {
      command: 'VOID_EXECUTION',
      accountId: account.id,
      expectedLedgerRevision: '1',
      supersedesEventId: result.eventIds[0],
      actorId: command.actorId,
      reason: 'T18 恢复边界夹具',
      source: { ...command.source, externalId: `t18-void-${account.id}` },
    });
    expect(voided.status).toBe(201);
    const afterVoid = await snapshot(account.id);
    expect(
      await request('/executions/restore', {
        ...correction,
        command: 'RESTORE_EXECUTION',
        expectedLedgerRevision: '2',
        supersedesEventId: (voided.payload as { eventIds: string[] }).eventIds[0],
        source: { ...command.source, externalId: `t18-restore-${account.id}` },
      }),
    ).toMatchObject({ status: 409, payload: { error: 'LEDGER_VALIDATION_FAILED' } });
    expect(await snapshot(account.id)).toEqual(afterVoid);
  });
});
