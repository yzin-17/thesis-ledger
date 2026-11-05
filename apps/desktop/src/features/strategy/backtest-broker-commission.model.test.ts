import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { calculateExecutionModelFees } from '@thesis-ledger/domain';
import { backtestExecutionModelSchemaV3 } from '@thesis-ledger/schemas';
import {
  applyBrokerCommission,
  defaultBrokerCommission,
} from './backtest-broker-commission.model.js';

function model(market: 'HK' | 'US') {
  const value = backtestExecutionModelSchemaV3.parse(
    JSON.parse(
      readFileSync(
        new URL(
          '../../../../../packages/schemas/fixtures/backtest-execution-model.cn-2024q1.json',
          import.meta.url,
        ),
        'utf8',
      ),
    ),
  );
  const currency = market === 'HK' ? 'HKD' : 'USD';
  value.scope = {
    ...value.scope,
    market,
    currency,
    instrumentType: 'ETF',
    symbol: market === 'HK' ? '02800.HK' : 'SPY.US',
    timezone: market === 'HK' ? 'Asia/Hong_Kong' : 'America/New_York',
  };
  for (const segment of value.segments) {
    if (!segment.fees || segment.execution.mode !== 'exchange')
      throw new Error('夹具必须为交易所模型');
    segment.source = {
      kind: 'historicalFact',
      knownAt: '2026-11-05T00:00:00Z',
      description: '受控规则可知时钟',
      revision: 'controlled-fact-v1',
      references: ['https://example.invalid/controlled-etf-model'],
    };
    segment.execution.calendarMarket = market;
    segment.execution.price = { kind: 'noDailyLimit', reason: '受控配置' };
    segment.fees.currency = currency;
    segment.fees.commission = { ...segment.fees.commission, currency };
    for (const code of ['stampDuty', 'transferFee', 'handlingFee', 'regulatoryFee'] as const)
      segment.fees[code] = { treatment: 'notApplicable', reason: '受控配置，公共收费另行组合' };
  }
  return backtestExecutionModelSchemaV3.parse(value);
}

describe('现有富途成本研究模板的ETF消费', () => {
  it.each(['HK', 'US'] as const)(
    '%s保留ETF身份、历史可知时钟与原模型，明确当前收费研究性质',
    (market) => {
      const original = model(market);
      const before = structuredClone(original);
      const profile = defaultBrokerCommission(market, false);
      const frozen = applyBrokerCommission(original, profile, '2026-11-06T00:00:00Z');
      expect(frozen.scope.instrumentType).toBe('ETF');
      expect(frozen.segments[0]!.source).toMatchObject({
        kind: 'userConfiguration',
        historicalKnownAt: '2026-11-05T00:00:00Z',
      });
      expect(frozen.segments[0]!.fees!.brokerCommission?.applicability).toBe(
        'current-schedule-research',
      );
      expect(original).toEqual(before);
      profile.commission.rate = '1';
      expect(frozen.segments[0]!.fees!.brokerCommission?.commission.rate).not.toBe('1');
    },
  );
  it('港股ETF沿成交额和固定平台费，美股ETF实际股数不得用归一化份数替代', () => {
    const hk = applyBrokerCommission(model('HK'), defaultBrokerCommission('HK')).segments[0]!.fees!;
    const hkResult = calculateExecutionModelFees(hk, {
      side: 'buy',
      turnover: '10000',
      currency: 'HKD',
    });
    expect(hkResult.charges.map((fee) => fee.amount)).toEqual(['3', '15']);
    const us = applyBrokerCommission(model('US'), defaultBrokerCommission('US', false)).segments[0]!
      .fees!;
    expect(
      calculateExecutionModelFees(us, {
        side: 'buy',
        turnover: '10000',
        currency: 'USD',
        quantity: '500',
        price: '20',
        quantityBasis: 'actual-units',
      }).charges.map((fee) => fee.amount),
    ).toEqual(['2.45', '2.5']);
    expect(() =>
      calculateExecutionModelFees(us, {
        side: 'buy',
        turnover: '10000',
        currency: 'USD',
        quantity: '500',
        price: '20',
        quantityBasis: 'normalized-units',
      }),
    ).toThrow('实际股数');
  });
});
