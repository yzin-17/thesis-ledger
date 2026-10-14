import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { calculateExecutionModelFees } from '@thesis-ledger/domain';
import { backtestExecutionModelSchemaV3, marketPublicFeesResponseV3Schema } from '@thesis-ledger/schemas';
import { combinePublicFeesExecutionModelV3 } from '../../src/backtest/backtest-public-fees-model-v3.js';

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../../../../packages/schemas/fixtures/${name}`, import.meta.url), 'utf8'));
function inputs(market: 'HK' | 'US') {
  const response = marketPublicFeesResponseV3Schema.parse(fixture(`market-${market.toLowerCase()}-public-fees-expanded-v3.response.json`).response);
  const model = fixture('backtest-execution-model.cn-2024q1.json');
  const currency = market === 'HK' ? 'HKD' : 'USD';
  model.scope = { ...model.scope, market, currency, symbol: response.symbol, range: response.range,
    timezone: market === 'HK' ? 'Asia/Hong_Kong' : 'America/New_York' };
  for (const segment of model.segments) {
    segment.range = response.range;
    segment.execution.calendarMarket = market;
    segment.execution.price = { kind: 'noDailyLimit', reason: '受控无日限制模型' };
    segment.fees.currency = currency;
    segment.fees.commission = { ...segment.fees.commission, currency, rate: '0', minimum: { kind: 'none' } };
    for (const code of ['stampDuty', 'handlingFee', 'regulatoryFee', 'transferFee'])
      segment.fees[code] = { treatment: 'notApplicable', reason: '未纳入费项' };
    for (const charge of response.segments[0]!.charges)
      segment.fees[charge.code] = { ...segment.fees.commission, side: charge.side, basis: charge.basis,
        rate: charge.code === 'tradingActivityFee' ? charge.rate : '0',
        ...(charge.maximumAmount ? { maximumAmount: charge.maximumAmount } : {}),
        ...(charge.lowPriceExemption ? { lowPriceExemption: charge.lowPriceExemption } : {}) };
  }
  return { response, model: backtestExecutionModelSchemaV3.parse(model) };
}

describe('扩展公共费项实际源与执行组合', () => {
  it('港股逐项金额进位进入组合模型，原模型不回写', () => {
    const { model, response } = inputs('HK');
    const original = JSON.stringify(model);
    const result = combinePublicFeesExecutionModelV3(model, response, '2026-10-08T00:00:00Z');
    expect(JSON.stringify(model)).toBe(original);
    const fees = result.segments[0]!.fees!;
    expect(fees.stampDuty).toMatchObject({ amountRounding: { mode: 'ceil', decimalPlaces: 0 } });
    expect(calculateExecutionModelFees(fees, { side: 'buy', turnover: '178', currency: 'HKD' }).total).toBe('1.01');
    expect(fees.afrcLevy?.rate).toBe('0.0000015');
  });
  it('TAF真实费率和上限与Section31成交边界共同冻结', () => {
    const { model, response } = inputs('US');
    const result = combinePublicFeesExecutionModelV3(model, response, '2026-10-08T00:00:00Z');
    expect(result.segments.map((segment) => segment.range.start)).toEqual(['2024-05-10', '2024-05-20']);
    expect(result.segments[0]!.fees?.tradingActivityFee).toMatchObject({ rate: '0.000166', maximumAmount: '8.30' });
    const calculated = calculateExecutionModelFees(result.segments[0]!.fees!, { side: 'sell', turnover: '1000', currency: 'USD',
      quantity: '100', price: '10', quantityBasis: 'actual-units' });
    expect(calculated.charges.find((charge) => charge.code === 'tradingActivityFee')?.amount).toBe('0.02');
  });
  it('即使显式选择TAF，归一化输入仍拒绝来源组合', () => {
    const { model, response } = inputs('US');
    for (const segment of model.segments) if (segment.execution.mode === 'exchange')
      segment.execution.normalizedExecution = { priceCoordinate: 'continuous-decimal', quantityUnits: 'continuous-normalized-decimal',
        lotSizeConstraint: 'not-applied', tickSizeConstraint: 'not-applied', dailyPriceLimit: 'not-applied', feeBasis: 'simulatedTurnover' };
    expect(() => combinePublicFeesExecutionModelV3(model, response)).toThrow('归一化数量');
  });
  it('未选新增费项、原件时钟在截点之后均拒绝，而不默认为零收费', () => {
    const { model, response } = inputs('HK');
    delete model.segments[0]!.fees!.afrcLevy;
    expect(() => combinePublicFeesExecutionModelV3(model, response)).toThrow('金额计算设置');
    const other = inputs('HK');
    expect(() => combinePublicFeesExecutionModelV3(other.model, other.response, '2026-10-07T00:00:00Z')).toThrow('冻结截点');
  });
});
