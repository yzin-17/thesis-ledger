import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { strategySchema, backtestModelResolutionRequestSchema } from '@thesis-ledger/schemas';
import {
  VersionedExecutionRules,
  tradingCalendars,
  type ExecutionRuleFacts,
} from '@thesis-ledger/domain';
import { strategyResearchExecutionModel } from '../../src/backtest/backtest-strategy-research-model.js';
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
  startDate: '2026-10-07',
  endDate: '2026-11-07',
  currency: 'CNY',
  adjustment: 'none',
});
const at = '2026-11-07T12:00:00Z';

describe('已确认的研究默认规则', () => {
  it('费用按策略继承，研究边界直接披露并冻结', () => {
    const copied = structuredClone(strategy);
    copied.cost.minimumCommission = { currency: 'CNY', amount: '0.000000000000000000000000000001' };
    const result = strategyResearchExecutionModel(request, copied, at);
    expect(result).toMatchObject({ status: 'available', policy: 'research-defaults' });
    expect(result.model.segments[0]).toMatchObject({
      fees: {
        commission: {
          rate: strategy.cost.commissionRate,
          minimum: { kind: 'amount', amount: copied.cost.minimumCommission.amount },
        },
        stampDuty: { rate: '0' },
      },
      source: { kind: 'researchPreset', configuredAt: at },
      execution: {
        sellableAfterTradingDays: 1,
        saleReinvestableAfterTradingDays: 0,
        price: { kind: 'noDailyLimit' },
      },
      assumptions: result.notes,
    });
    expect(result.notes.join('')).toContain('税费暂不计入');
    expect(result.notes.join('')).toContain('停牌、退市');
  });

  it('归一化假设仅用于复权；日期不被自动截断', () => {
    const result = strategyResearchExecutionModel({ ...request, adjustment: 'qfq' }, strategy, at);
    expect(result.model.scope.range).toEqual({ start: request.startDate, end: request.endDate });
    expect(result.model.segments[0]?.execution).toMatchObject({
      normalizedExecution: {
        quantityUnits: 'continuous-normalized-decimal',
        tickSizeConstraint: 'not-applied',
      },
    });
    expect(
      strategyResearchExecutionModel(request, strategy, at).model.segments[0]?.execution,
    ).not.toHaveProperty('normalizedExecution');
  });

  it('模型阶段不请求历史事实，避免再次卡在假设或当天保守时间', async () => {
    const backtestInstrumentFacts = vi.fn(async () => {
      throw new Error('历史状态尚未到保守可用时间，执行规则为 modelAssumption');
    });
    const service = new BacktestModelResolutionService(
      {
        strategyVersion: { findUnique: async () => ({ schemaVersion: 2, schema: strategy }) },
      } as never,
      { backtestInstrumentFacts } as never,
    );
    expect(await service.resolve(request)).toMatchObject({
      status: 'available',
      policy: 'research-defaults',
    });
    expect(backtestInstrumentFacts).not.toHaveBeenCalled();
    expect(await service.resolve({ ...request, policy: 'historical-rules' })).toMatchObject({
      status: 'blocked',
      reasonCode: 'rules-unavailable',
    });
    expect(backtestInstrumentFacts).toHaveBeenCalledTimes(1);
  });

  it.each(['HK', 'US'] as const)('%s 按研究默认结算并披露，不声称历史事实', (market) => {
    const result = strategyResearchExecutionModel(
      { ...request, currency: market === 'HK' ? 'HKD' : 'USD' },
      {
        ...strategy,
        executionInstrument: {
          market,
          assetType: 'stock',
          symbol: market === 'HK' ? '00700.HK' : 'AAPL.US',
        },
      },
      at,
    );
    expect(result.model.segments[0]?.execution).toMatchObject({ sellableAfterTradingDays: 0 });
    expect(result.notes.join('')).toContain('买入当日可卖');
    expect(result.model.segments[0]?.source.kind).toBe('researchPreset');
  });

  it.each([false, true])('研究模型仍拒绝不可交易标的或停牌，停牌=%s', (suspended) => {
    const model = strategyResearchExecutionModel(request, strategy, at).model;
    const segment = model.segments[0]!;
    if (segment.execution.mode !== 'exchange' || !segment.fees) throw new Error('fixture');
    const facts: ExecutionRuleFacts = {
      version: 'controlled',
      calendar: tradingCalendars.CN,
      calendarProvider: 'controlled',
      calendarProviderRevision: '1',
      calendarAvailableAt: '2026-01-01T00:00:00Z',
      instrument: {
        symbol: '600519.SH',
        market: 'CN',
        instrumentType: 'STOCK',
        currency: 'CNY',
        lotSize: '100',
        tickSize: '0.01',
        tradable: suspended,
        provider: 'controlled',
        providerRevision: '1',
        occurredAt: '2026-01-01T00:00:00Z',
        availableAt: '2026-01-01T00:00:00Z',
      },
      order: {
        type: 'Market',
        timeInForce: 'DAY',
        executionTiming: 'nextEligibleBarOpen',
        fillPolicy: 'full-or-reject',
        longOnly: true,
      },
      price: { reference: 'previousClose' },
      positionSettlement: { sellableAfterTradingDays: 1 },
      cashSettlement: { buyDebitAfterTradingDays: 0, sellCreditAfterTradingDays: 0 },
      statutoryCharges: [],
    };
    const rules = new VersionedExecutionRules(facts).withExecutionModel({
      ...segment,
      execution: {
        mode: 'exchange', calendarMarket: 'CN', reserveCashAt: 'orderAccepted', buyDebitAt: 'fill',
        sellableAfterTradingDays: segment.execution.sellableAfterTradingDays,
        saleReinvestableAfterTradingDays: segment.execution.saleReinvestableAfterTradingDays,
        price: segment.execution.price,
      },
      fees: segment.fees,
    });
    expect(
      rules.evaluate({
        symbol: '600519.SH',
        market: 'CN',
        side: 'buy',
        quantity: '100',
        rawPrice: '10',
        previousClose: '10',
        evaluatedAt: '2026-11-06T01:30:00Z',
        suspended,
      }),
    ).toMatchObject({ accepted: false, code: 'RULE_REJECTED' });
  });
});
