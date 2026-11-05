import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  calculateExecutionModelFees,
  resolveExecutionModelSegment,
  type FrozenExecutionModel,
} from '@thesis-ledger/domain';
import {
  backtestExecutionModelSchemaV3,
  marketPublicFeesRequestV3Schema,
  marketPublicFeesResponseV3Schema,
} from '@thesis-ledger/schemas';
import { DsaDataCapabilityReaderV3 } from '../../src/integration/dsa/dsa-data-capability-reader-v3.js';
import { combinePublicFeesExecutionModelV3 } from '../../src/backtest/backtest-public-fees-model-v3.js';

const fixture = (name: string) =>
  JSON.parse(
    readFileSync(new URL(`../../../../packages/schemas/fixtures/${name}`, import.meta.url), 'utf8'),
  );
function inputs(market: 'CN' | 'HK' | 'US') {
  const sample = fixture(`market-${market.toLowerCase()}-etf-public-fees-v3.json`);
  const request = marketPublicFeesRequestV3Schema.parse(sample.request);
  const response = marketPublicFeesResponseV3Schema.parse(sample.response);
  const model = fixture('backtest-execution-model.cn-2024q1.json');
  const currency = { CN: 'CNY', HK: 'HKD', US: 'USD' }[market];
  model.scope = {
    ...model.scope,
    market,
    currency,
    symbol: response.symbol,
    instrumentType: 'ETF',
    range: response.range,
    timezone: { CN: 'Asia/Shanghai', HK: 'Asia/Hong_Kong', US: 'America/New_York' }[market],
  };
  for (const segment of model.segments) {
    segment.range = response.range;
    segment.source = {
      kind: 'userConfiguration',
      configuredAt: sample.fixtureClock,
      description: 'ETF公共费率组合的受控执行配置',
      references: ['https://example.invalid/controlled-etf-execution-model'],
      revision: 'etf-controlled-model-v1',
    };
    segment.assumptions = ['非来源费项和成交条件为受控配置，不证明该证券历史规则。'];
    segment.execution.calendarMarket = market;
    segment.execution.price = { kind: 'noDailyLimit', reason: '受控执行坐标' };
    segment.fees.currency = currency;
    segment.fees.commission = {
      ...segment.fees.commission,
      currency,
      rate: '0',
      minimum: { kind: 'none' },
    };
    for (const code of ['stampDuty', 'handlingFee', 'regulatoryFee', 'transferFee'])
      segment.fees[code] = { treatment: 'notApplicable', reason: '受控模型未纳入' };
    for (const charge of response.segments[0]!.charges) {
      if (charge.rate === '0') continue;
      segment.fees[charge.code] = {
        ...segment.fees.commission,
        side: charge.side,
        basis: charge.basis,
        rate: charge.code === 'tradingActivityFee' ? charge.rate : '0',
        ...(charge.maximumAmount ? { maximumAmount: charge.maximumAmount } : {}),
        ...(charge.lowPriceExemption ? { lowPriceExemption: charge.lowPriceExemption } : {}),
      };
    }
  }
  return { request, response, model: backtestExecutionModelSchemaV3.parse(model) };
}

describe('三个ETF历史切片的正式请求与执行冻结', () => {
  it.each(['CN', 'HK', 'US'] as const)(
    '%s保留精确资产、来源和有界窗口，不借用股票响应',
    async (market) => {
      const { request, response } = inputs(market);
      const post = vi.fn(async () => response);
      const reader = new DsaDataCapabilityReaderV3(post, (parse) => parse());
      expect(await reader.publicFees(request)).toEqual(response);
      expect(post.mock.calls[0]).toEqual([
        '/api/v3/thesis-ledger/market/public-fees',
        request,
        expect.any(Function),
      ]);
      const wrong = structuredClone(response);
      wrong.routeKey.assetType = 'STOCK';
      const other = new DsaDataCapabilityReaderV3(
        async () => wrong,
        (parse) => parse(),
      );
      await expect(other.publicFees(request)).rejects.toMatchObject({ code: 'invalid-response' });
    },
  );
  it('CN部分收费保持其他模型设置，真实经手费计算0.40且冻结不被后续编辑改写', () => {
    const { model, response } = inputs('CN');
    const original = structuredClone(model);
    const result = combinePublicFeesExecutionModelV3(model, response, '2026-11-06T00:00:00Z');
    const segment = resolveExecutionModelSegment(result as unknown as FrozenExecutionModel, {
      expectedVersion: result.version,
      symbol: response.symbol,
      market: 'CN',
      instrumentType: 'ETF',
      currency: 'CNY',
      evaluatedAt: '2023-08-28T02:00:00Z',
      dataAsOf: '2026-11-06T00:00:00Z',
    });
    expect(
      calculateExecutionModelFees(segment.fees!, {
        side: 'sell',
        turnover: '10000',
        currency: 'CNY',
      }).total,
    ).toBe('0.4');
    expect(result.segments[0]!.assumptions.some((value) => value.includes('非完整账单'))).toBe(
      true,
    );
    expect(model).toEqual(original);
    response.segments[0]!.charges[0]!.rate = '1';
    model.segments[0]!.assumptions.push('后续修改');
    expect(result.segments[0]!.fees!.handlingFee).toMatchObject({ rate: '0.00004' });
    expect(result.segments[0]!.assumptions).not.toContain('后续修改');
  });
  it('港股ETF有明确印花税豁免，notApplicable模型可绑定零费率事实', () => {
    const { model, response } = inputs('HK');
    const result = combinePublicFeesExecutionModelV3(model, response, '2026-11-06T00:00:00Z');
    expect(result.segments[0]!.fees!.stampDuty).toMatchObject({ treatment: 'notApplicable' });
    const fees = calculateExecutionModelFees(result.segments[0]!.fees!, {
      side: 'sell',
      turnover: '10000',
      currency: 'HKD',
    });
    expect(fees.total).toBe('0.86');
    expect(fees.charges.some((fee) => fee.code === 'stampDuty')).toBe(false);
    response.segments[0]!.charges.find((fee) => fee.code === 'stampDuty')!.rate = '0.001';
    expect(() => combinePublicFeesExecutionModelV3(model, response)).toThrow('金额计算设置');
  });
  it('美股ETF保存T+2边界、TAF实际股数和上限，归一化输入拒绝', () => {
    const { model, response } = inputs('US');
    const result = combinePublicFeesExecutionModelV3(model, response, '2026-11-06T00:00:00Z');
    expect(result.segments.map((segment) => segment.range.start)).toEqual([
      '2024-05-10',
      '2024-05-20',
    ]);
    const fee = calculateExecutionModelFees(result.segments[0]!.fees!, {
      side: 'sell',
      turnover: '1000',
      currency: 'USD',
      quantity: '100',
      price: '10',
      quantityBasis: 'actual-units',
    });
    expect(fee.charges.find((charge) => charge.code === 'tradingActivityFee')?.amount).toBe('0.02');
    for (const segment of model.segments)
      if (segment.execution.mode === 'exchange')
        segment.execution.normalizedExecution = {
          priceCoordinate: 'continuous-decimal',
          quantityUnits: 'continuous-normalized-decimal',
          lotSizeConstraint: 'not-applied',
          tickSizeConstraint: 'not-applied',
          dailyPriceLimit: 'not-applied',
          feeBasis: 'simulatedTurnover',
        };
    expect(() => combinePublicFeesExecutionModelV3(model, response)).toThrow('归一化数量');
  });
  it('来源时钟晚于冻结截点、资产身份或窗口不一致均拒绝', () => {
    const partial = inputs('CN');
    delete partial.response.provenance.coverageDescription;
    expect(() => combinePublicFeesExecutionModelV3(partial.model, partial.response)).toThrow('覆盖说明');
    const { model, response } = inputs('HK');
    expect(() =>
      combinePublicFeesExecutionModelV3(model, response, '2026-11-01T00:00:00Z'),
    ).toThrow('冻结截点');
    const wrong = structuredClone(model);
    wrong.scope.instrumentType = 'STOCK';
    expect(() => combinePublicFeesExecutionModelV3(wrong, response)).toThrow('范围不一致');
    const gap = structuredClone(response);
    gap.segments[0]!.range.start = '2025-08-07';
    expect(() => combinePublicFeesExecutionModelV3(model, gap)).toThrow('缺口');
  });
});
