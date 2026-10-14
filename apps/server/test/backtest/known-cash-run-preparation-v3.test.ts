import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { backtestRunPreparationRequestV3Schema } from '@thesis-ledger/schemas';
import { BacktestRunPreparationService } from '../../src/backtest/backtest-run-preparation.service.js';
import { knownCashSnapshotFixture } from './known-cash-snapshot-fixtures.js';
import { hashCanonicalManifest } from '../../src/backtest/backtest-snapshot.js';

async function fixture() {
  const f = await knownCashSnapshotFixture(true);
  const c = f.input.runConfig;
  const request = backtestRunPreparationRequestV3Schema.parse({
    contractVersion: 3,
    requestId: 'known-prepare',
    strategyVersionId: '11111111-1111-4111-8111-111111111111',
    adjustment: 'none',
    accountingBasis: 'raw-events',
    history: { basis: 'fixed-provider-snapshot' },
    cashEventResearch: c.executionPriceProtocol.cashEventResearch,
    knownCashResearch: c.knownCashPreparation!.input.policy,
    runConfig: {
      startDate: c.startDate,
      endDate: c.endDate,
      dataAsOf: c.dataAsOf,
      baseCurrency: c.baseCurrency,
      initialCash: c.initialCash,
      valuationPolicy: c.valuationPolicy,
      executionModel: c.executionModel,
    },
  });
  const prisma = {
    strategyVersion: {
      findUnique: vi.fn(async () => ({ schemaVersion: 2, schema: f.input.strategy })),
    },
  };
  const control = {
    getPolicy: vi.fn(async () => ({
      contractVersion: 3,
      consumer: 'thesis-ledger',
      requestId: 'policy',
      revision: 1,
      enabled: true,
      syncState: 'applied',
      effectiveStale: false,
      routes: [
        {
          key: f.input.executionRouteKey,
          targets: [{ providerId: 'hithink', upstreamSource: 'hithink-financial-api' }],
        },
      ],
    })),
  };
  const announcements = {
    prepare: vi.fn(async () => {
      throw new Error('旧完整公告不应调用');
    }),
  };
  const knownCash = { acquire: vi.fn(async () => c.knownCashPreparation!) };
  const service = new BacktestRunPreparationService(
    prisma as never,
    f.reader as never,
    control as never,
    announcements as never,
    undefined,
    knownCash as never,
  );
  return { ...f, request, knownCash, service, announcements };
}

describe('已知现金公开准备入口', () => {
  it('公司行动信号在价格及现金取得前明确拒绝', async () => {
    const f = await fixture();
    f.input.strategy.entry = { type: 'corporateActionEvent', eventType: 'CASH_DIVIDEND' };
    expect(await f.service.prepare(f.request)).toMatchObject({ status: 'blocked', diagnostics: [expect.objectContaining({ message: '已知现金研究不能使用公司行动策略信号' })] });
    expect(f.reader.readV3).not.toHaveBeenCalled();
    expect(f.knownCash.acquire).not.toHaveBeenCalled();
  });
  it('原价/实际策略预热后取得现金，冻结全部输入并进入原执行预检', async () => {
    const f = await fixture();
    const result = await f.service.prepare(f.request);
    if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
    expect(result.runConfig.knownCashPreparation).toEqual(f.input.runConfig.knownCashPreparation);
    expect(result.runConfig.frozenPriceWarmupPolicy).toBe('cash-reference-calendar-buffer-v1');
    expect(result.executionPreflight.status).toBe('ready');
    expect(hashCanonicalManifest(result.runConfig)).toBe(hashCanonicalManifest(JSON.parse(JSON.stringify(result.runConfig))));
    expect(result.executionPreflight.revisionStamp?.runConfigChecksum).toBe(hashCanonicalManifest(JSON.parse(JSON.stringify(result.runConfig))));
    expect(f.announcements.prepare).not.toHaveBeenCalled();
    expect(f.knownCash.acquire).toHaveBeenCalledWith(
      expect.objectContaining({
        revisions: { desiredRevision: 1, effectivePolicyRevision: 1, catalogRevision: 1 },
        executionPriceProtocol: f.input.runConfig.executionPriceProtocol,
      }),
    );
  });
  it('现金失败保留原因，不产生零事件或prepared；复权/缺假设在来源前拒绝', async () => {
    const f = await fixture();
    f.knownCash.acquire.mockRejectedValue(new Error('source_unavailable:fixture'));
    expect(await f.service.prepare(f.request)).toMatchObject({
      status: 'blocked',
      diagnostics: [expect.objectContaining({ message: 'source_unavailable:fixture' })],
    });
    f.reader.readV3.mockClear();
    await expect(f.service.prepare({ ...f.request, adjustment: 'qfq' })).rejects.toThrow();
    await expect(
      f.service.prepare({
        ...f.request,
        knownCashResearch: { version: 'known-announced-cash-events-v1' },
      }),
    ).rejects.toThrow();
    expect(f.reader.readV3).not.toHaveBeenCalled();
  });
});
