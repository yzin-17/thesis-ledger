import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  strategySchema,
  backtestInstrumentFactsResponseSchema,
  backtestModelResolutionRequestSchema,
} from '@thesis-ledger/schemas';
import { savedStrategyExecutionModel } from '../../src/backtest/backtest-saved-strategy-model.js';
import { BacktestModelResolutionService } from '../../src/backtest/backtest-model-resolution.service.js';

const strategy = strategySchema.parse(
  JSON.parse(
    readFileSync(
      new URL('../../../../packages/schemas/fixtures/backtest-v2.exchange.json', import.meta.url),
      'utf8',
    ),
  ),
);
const request = backtestModelResolutionRequestSchema.parse({
  strategyVersionId: '11111111-1111-4111-8111-111111111111',
  startDate: '2024-01-02',
  endDate: '2024-03-29',
  currency: 'CNY',
  adjustment: 'none',
});
const configuredAt = '2026-11-07T12:00:00Z';
const response = () =>
  backtestInstrumentFactsResponseSchema.parse({
    version: 1,
    status: 'supported',
    provider: 'controlled',
    providerRevision: 'rules-r1',
    coverage: { start: request.startDate, end: request.endDate, complete: true },
    facts: [
      {
        ...strategy.executionInstrument,
        instrumentType: 'STOCK',
        currency: 'CNY',
        lotSize: '100',
        tickSize: '0.01',
        tradable: true,
        provider: 'controlled',
        providerRevision: 'rules-r1',
        occurredAt: '2024-01-01T00:00:00Z',
        availableAt: '2026-01-01T00:00:00Z',
        executionRules: {
          status: 'supported',
          version: 'rules-v1',
          range: { start: request.startDate, end: request.endDate },
          price: { reference: 'previousClose', maxUpRatio: '0.1', maxDownRatio: '0.1' },
          positionSettlement: { sellableAfterTradingDays: 1 },
          cashSettlement: { buyDebitAfterTradingDays: 0, sellCreditAfterTradingDays: 0 },
          statutoryCharges: [{ code: 'STAMP_DUTY', side: 'sell', rate: '0.0005', minimum: null }],
        },
      },
    ],
  });

describe('已保存策略的自动执行模型', () => {
  it('复用策略佣金、最低佣金及来源收费，不捏造最低额', () => {
    const model = savedStrategyExecutionModel(request, strategy, response(), configuredAt);
    expect(model.scope).toMatchObject({
      symbol: '600519.SH',
      range: { start: request.startDate, end: request.endDate },
    });
    expect(model.segments[0]).toMatchObject({
      source: { kind: 'researchPreset', configuredAt },
      fees: {
        commission: { rate: strategy.cost.commissionRate, minimum: { kind: 'none' } },
        stampDuty: { rate: '0.0005', side: 'sell' },
      },
      execution: {
        sellableAfterTradingDays: 1,
        saleReinvestableAfterTradingDays: 0,
        price: { kind: 'dailyLimit', maxUpRatio: '0.1' },
      },
    });
    const copied = structuredClone(strategy);
    copied.cost.minimumCommission = { amount: '0.000000000000000000000000000001', currency: 'CNY' };
    const minimumModel = savedStrategyExecutionModel(request, copied, response(), configuredAt);
    expect(minimumModel.segments[0]?.fees?.commission.minimum).toEqual({
      kind: 'amount',
      amount: copied.cost.minimumCommission.amount,
    });
  });

  it('按所选复权方式生成显式归一化模型', () => {
    const model = savedStrategyExecutionModel(
      { ...request, adjustment: 'qfq' },
      strategy,
      response(),
      configuredAt,
    );
    expect(model.segments[0]?.execution).toMatchObject({
      price: { kind: 'noDailyLimit' },
      normalizedExecution: {
        quantityUnits: 'continuous-normalized-decimal',
        dailyPriceLimit: 'not-applied',
      },
    });
  });

  it('市场规则变更按实际日期拆段，收费也分别冻结', () => {
    const data = response(),
      first = data.facts[0]!;
    if (first.executionRules.status !== 'supported') throw new Error('fixture');
    first.executionRules.range.end = '2024-02-01';
    const second = structuredClone(first);
    if (second.executionRules.status !== 'supported') throw new Error('fixture');
    second.executionRules.range = { start: '2024-02-02', end: request.endDate };
    second.executionRules.statutoryCharges[0]!.rate = '0.001';
    data.facts.push(second);
    expect(
      savedStrategyExecutionModel(request, strategy, data, configuredAt).segments.map(
        (x) => x.range,
      ),
    ).toEqual([
      { start: request.startDate, end: '2024-02-01' },
      { start: '2024-02-02', end: request.endDate },
    ]);
  });

  it.each([
    'gap',
    'conflict',
    'future',
    'future-precision',
    'currency',
    'unknown-fee',
    'settlement',
  ])('资料 %s 不完整时明确阻断', (kind) => {
    const data = response(),
      first = data.facts[0]!;
    if (first.executionRules.status !== 'supported') throw new Error('fixture');
    if (kind === 'gap') first.executionRules.range.start = '2024-02-01';
    if (kind === 'future') first.availableAt = '2027-01-01T00:00:00Z';
    if (kind === 'future-precision') first.availableAt = '2026-11-07T12:00:00.000000001Z';
    if (kind === 'currency') first.currency = 'USD';
    if (kind === 'unknown-fee') first.executionRules.statutoryCharges[0]!.code = 'unknown';
    if (kind === 'settlement') first.executionRules.cashSettlement.buyDebitAfterTradingDays = 1;
    if (kind === 'conflict') {
      const second = structuredClone(first);
      if (second.executionRules.status !== 'supported') throw new Error('fixture');
      second.executionRules.price.maxUpRatio = '0.2';
      data.facts.push(second);
    }
    expect(() => savedStrategyExecutionModel(request, strategy, data, configuredAt)).toThrow(
      /[\u3400-\u9fff]/,
    );
  });

  it('只读解析服务读取已保存版本，源异常返回业务原因', async () => {
    const findUnique = vi.fn(async () => ({ schema: strategy, schemaVersion: 1 }));
    const backtestInstrumentFacts = vi.fn(async () => response());
    const service = new BacktestModelResolutionService(
      { strategyVersion: { findUnique } } as never,
      { backtestInstrumentFacts } as never,
    );
    const strict = { ...request, policy: 'historical-rules' };
    expect(await service.resolve(strict)).toMatchObject({
      status: 'available',
      policy: 'historical-rules',
    });
    expect(findUnique).toHaveBeenCalledWith({ where: { id: request.strategyVersionId } });
    backtestInstrumentFacts.mockRejectedValueOnce(new Error('source down'));
    expect(await service.resolve(strict)).toMatchObject({
      status: 'blocked',
      reasonCode: 'rules-unavailable',
      message: expect.stringContaining('请稍后重试'),
    });
  });
});
