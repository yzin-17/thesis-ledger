import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { executionPriceProtocolSchema } from '../../schemas/src/market-price-protocol.js';
import { strategySchema, type BacktestStrategy } from '../../schemas/src/backtest-contract.js';
import {
  checkBacktestRuleCompatibility,
  type RulePriceCoordinateFacts,
  type RuleCompatibilityProtocol,
  type StrategyRuleCompatibilityContext,
  type StrategyRuleCompatibilityInput,
} from '../src/backtest-rule-compatibility.js';
import type {
  FrozenExecutionModel,
  FrozenExecutionModelChargedFee,
  FrozenExecutionModelFees,
  ExecutionModelRuleUnitFacts,
} from '../src/backtest-execution-model.js';

const normalizedProtocolFixture = JSON.parse(
  readFileSync(
    new URL('../../schemas/fixtures/execution-price.normalized-snapshot.json', import.meta.url),
    'utf8',
  ),
);
const normalizedProtocol: RuleCompatibilityProtocol =
  executionPriceProtocolSchema.parse(normalizedProtocolFixture);
const exchangeStrategyFixture = JSON.parse(
  readFileSync(
    new URL('../../schemas/fixtures/backtest-v2.exchange.json', import.meta.url),
    'utf8',
  ),
);
const typedExchangeStrategy: BacktestStrategy = strategySchema.parse(
  exchangeStrategyFixture,
) as BacktestStrategy;

const chargedFee = (basis = 'turnover'): FrozenExecutionModelChargedFee => ({
  treatment: 'charged',
  side: 'both',
  basis,
  currency: 'CNY',
  rate: '0.0003',
  minimum: { kind: 'none' },
});

const executionFees = (commissionBasis = 'turnover'): FrozenExecutionModelFees => ({
  currency: 'CNY',
  collection: 'perFillPerCharge',
  rounding: { mode: 'halfUp', decimalPlaces: 2 },
  commission: chargedFee(commissionBasis),
  stampDuty: { treatment: 'notApplicable', reason: '测试模型不适用' },
  transferFee: { treatment: 'includedInCommission', reason: '测试模型已包含' },
  regulatoryFee: { treatment: 'includedInCommission', reason: '测试模型已包含' },
  handlingFee: { treatment: 'includedInCommission', reason: '测试模型已包含' },
});

const exchangeModel = (
  options: { commissionBasis?: string; dailyLimit?: boolean } = {},
): FrozenExecutionModel => ({
  schemaVersion: 'execution-model-v1',
  id: 'cn-normalized-test',
  version: '1',
  scope: {
    symbol: '600519.SH',
    market: 'CN',
    instrumentType: 'stock',
    currency: 'CNY',
    timezone: 'Asia/Shanghai',
    range: { start: '2026-01-01', end: '2026-12-31' },
  },
  segments: [
    {
      id: 'segment-1',
      range: { start: '2026-01-01', end: '2026-12-31' },
      source: { kind: 'researchPreset', configuredAt: '2026-01-01T00:00:00Z' },
      assumptions: ['固定单元测试模型'],
      fees: executionFees(options.commissionBasis),
      execution: {
        mode: 'exchange',
        calendarMarket: 'CN',
        reserveCashAt: 'orderAccepted',
        buyDebitAt: 'fill',
        sellableAfterTradingDays: 1,
        saleReinvestableAfterTradingDays: 1,
        price: options.dailyLimit
          ? {
              kind: 'dailyLimit',
              reference: 'previousRawClose',
              maxUpRatio: '0.1',
              maxDownRatio: '0.1',
              rounding: 'halfUpToTick',
              minimumDistanceTicks: 1,
              minimumPriceTicks: 1,
            }
          : { kind: 'noDailyLimit', reason: '归一化序列研究不套用真实涨跌停' },
      },
    },
  ],
});

const coordinate = (
  coordinateId: string,
  protocol: RuleCompatibilityProtocol = normalizedProtocol,
  overrides: Partial<RulePriceCoordinateFacts> = {},
): RulePriceCoordinateFacts => ({
  coordinateId,
  currency: 'CNY',
  priceBasis: {
    adjustment: protocol.priceBasis.adjustment,
    quantityBasis: protocol.priceBasis.quantityBasis,
    volumeBasis: protocol.priceBasis.volumeBasis,
    conversionAvailable: protocol.priceBasis.conversionAvailable,
    conversionEvidenceRef: protocol.priceBasis.conversionEvidenceRef,
    dividendMeaning: protocol.priceBasis.dividendMeaning,
  },
  scaleTransform: {
    kind: 'uniform-multiplicative',
    factor: '2',
    evidenceRef: 'fixture:uniform-qfq-factor',
  },
  volumeToQuantityConversion: { available: false, evidenceRef: null },
  ...overrides,
});

const noExecutionConversions: ExecutionModelRuleUnitFacts = {
  realLotSize: '100',
  realTickSize: '0.01',
  actualQuantityConversion: { available: false, evidenceRef: null },
};

const makeContext = (
  overrides: Partial<StrategyRuleCompatibilityContext> = {},
): StrategyRuleCompatibilityContext => {
  const executionCoordinate = coordinate('execution-price');
  return {
    protocol: normalizedProtocol,
    executionModel: exchangeModel(),
    executionUnits: noExecutionConversions,
    executionCoordinate,
    sourceCoordinates: {
      execution: executionCoordinate,
      benchmark: coordinate('benchmark-price'),
    },
    ...overrides,
  };
};

const makeStrategy = (overrides: Record<string, unknown> = {}): BacktestStrategy =>
  strategySchema.parse({ ...exchangeStrategyFixture, ...overrides }) as BacktestStrategy;

const priceSeries = (sourceId: string, field = 'close') => ({
  type: 'series',
  sourceId,
  field,
});

const relativeTrend = () => ({
  type: 'compare',
  operator: 'gt',
  left: priceSeries('execution'),
  right: {
    type: 'indicator',
    name: 'MA',
    input: priceSeries('execution'),
    params: { period: 5 },
  },
});

describe('归一化回测规则单位兼容', () => {
  it('接受同一价格坐标内的趋势、相对突破、资金比例和持有期规则', () => {
    const strategy = makeStrategy({
      entry: {
        type: 'cross',
        direction: 'above',
        left: priceSeries('execution'),
        right: {
          type: 'indicator',
          name: 'Highest',
          input: priceSeries('execution'),
          params: { period: 20 },
        },
      },
      exit: {
        type: 'compare',
        operator: 'gte',
        left: { type: 'positionState', field: 'holdingPeriods' },
        right: { type: 'constant', value: '20' },
      },
      sizing: { type: 'percentOfEquity', percent: '0.5' },
      risk: [{ type: 'maxHoldingPeriod', periods: 30 }],
    });

    const report = checkBacktestRuleCompatibility(strategy, makeContext());
    expect(report.compatible).toBe(true);
    expect(report.scaleInvariance).toBe('proven');
    expect(report.issues).toEqual([]);
    expect(report.sourceStrategy).toBe(strategy);
  });

  it('用真实 V2 AST fixture 识别无转换证据的绝对价格阈值并保留原策略', () => {
    const strategy = typedExchangeStrategy;
    const report = checkBacktestRuleCompatibility(strategy, makeContext());

    expect(report.compatible).toBe(false);
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        code: 'ABSOLUTE_PRICE_THRESHOLD_UNCONVERTIBLE',
        path: ['entry'],
      }),
    );
    expect(report.sourceStrategy).toBe(strategy);
    expect(report.sourceStrategy).toEqual(exchangeStrategyFixture);
  });

  it('有证据的价格转换可支持原有绝对阈值并返回执行所需转换', () => {
    const protocol = executionPriceProtocolSchema.parse({
      ...normalizedProtocolFixture,
      priceBasis: {
        ...normalizedProtocolFixture.priceBasis,
        anchor: 'adjustment-base:2026-08-09',
        conversionAvailable: true,
        conversionEvidenceRef: 'fixture:verified-price-conversion',
      },
    }) as RuleCompatibilityProtocol;
    const executionCoordinate = coordinate('execution-price', protocol);
    const report = checkBacktestRuleCompatibility(
      typedExchangeStrategy,
      makeContext({
        protocol,
        executionCoordinate,
        sourceCoordinates: {
          execution: executionCoordinate,
          benchmark: coordinate('benchmark-price', protocol),
        },
      }),
    );

    expect(report.issues).toEqual([]);
    expect(report.compatible).toBe(true);
    expect(report.requiredConversions).toContainEqual({
      kind: 'price-to-raw',
      sourceId: 'execution',
      evidenceRef: 'fixture:verified-price-conversion',
    });
  });

  it('没有实际数量转换时拒绝真实固定数量和按真实份额计费', () => {
    const fixedQuantity = makeStrategy({ sizing: { type: 'fixedQuantity', quantity: '100' } });
    const quantityReport = checkBacktestRuleCompatibility(fixedQuantity, makeContext());
    expect(quantityReport.compatible).toBe(false);
    expect(quantityReport.issues).toContainEqual(
      expect.objectContaining({ code: 'ACTUAL_QUANTITY_CONVERSION_REQUIRED' }),
    );

    const absoluteQuantity = makeStrategy({
      entry: {
        type: 'compare',
        operator: 'gt',
        left: { type: 'positionState', field: 'quantity' },
        right: { type: 'constant', value: '100' },
      },
    });
    const absoluteQuantityReport = checkBacktestRuleCompatibility(absoluteQuantity, makeContext());
    expect(absoluteQuantityReport.compatible).toBe(false);
    expect(absoluteQuantityReport.issues).toContainEqual(
      expect.objectContaining({ code: 'ACTUAL_QUANTITY_CONVERSION_REQUIRED' }),
    );

    const feeReport = checkBacktestRuleCompatibility(
      makeStrategy({ entry: relativeTrend() }),
      makeContext({ executionModel: exchangeModel({ commissionBasis: 'perShare' }) }),
    );
    expect(feeReport.compatible).toBe(false);
    expect(feeReport.issues).toContainEqual(
      expect.objectContaining({ code: 'ACTUAL_UNIT_FEE_UNSUPPORTED' }),
    );
  });

  it('真实 daily limit 需要 tick 和可靠原始价格转换', () => {
    const report = checkBacktestRuleCompatibility(
      makeStrategy({ entry: relativeTrend() }),
      makeContext({ executionModel: exchangeModel({ dailyLimit: true }) }),
    );

    expect(report.compatible).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toContain('RAW_PRICE_CONVERSION_REQUIRED');
  });

  it('拒绝缺少兼容数量单位的 VWAP 和量参与率，并保留输入 AST', () => {
    const vwapStrategy = makeStrategy({
      entry: {
        type: 'compare',
        operator: 'gt',
        left: {
          type: 'indicator',
          name: 'VWAP',
          input: priceSeries('execution'),
          params: { period: 10 },
        },
        right: priceSeries('execution'),
      },
    });
    const vwapReport = checkBacktestRuleCompatibility(vwapStrategy, makeContext());
    expect(vwapReport.compatible).toBe(false);
    expect(vwapReport.issues).toContainEqual(
      expect.objectContaining({ code: 'VWAP_UNITS_INCOMPATIBLE' }),
    );
    expect(vwapReport.sourceStrategy).toBe(vwapStrategy);

    const participationStrategy: StrategyRuleCompatibilityInput = {
      ...makeStrategy(),
      entry: { type: 'volumeParticipation', sourceId: 'execution', maximumRate: '0.1' },
    };
    const participationReport = checkBacktestRuleCompatibility(
      participationStrategy,
      makeContext(),
    );
    expect(participationReport.compatible).toBe(false);
    expect(participationReport.issues).toContainEqual(
      expect.objectContaining({ code: 'VOLUME_PARTICIPATION_UNSUPPORTED' }),
    );
    expect(participationReport.sourceStrategy).toBe(participationStrategy);
    expect(participationReport.sourceStrategy.entry).toEqual(participationStrategy.entry);
  });

  it('同一统一缩放下相对比较稳定，非比例或跨序列缩放不作安全推断', () => {
    const uniformStrategy = makeStrategy({ entry: relativeTrend() });
    const uniformReport = checkBacktestRuleCompatibility(uniformStrategy, makeContext());
    expect(uniformReport.compatible).toBe(true);
    expect(uniformReport.scaleInvariance).toBe('proven');

    const nonProportional = coordinate('execution-price', normalizedProtocol, {
      scaleTransform: { kind: 'non-proportional', evidenceRef: 'fixture:time-varying-adjustment' },
    });
    const changedCoordinateReport = checkBacktestRuleCompatibility(
      uniformStrategy,
      makeContext({
        executionCoordinate: nonProportional,
        sourceCoordinates: {
          execution: nonProportional,
          benchmark: coordinate('benchmark-price'),
        },
      }),
    );
    expect(changedCoordinateReport.compatible).toBe(true);
    expect(changedCoordinateReport.scaleInvariance).toBe('coordinate-dependent');

    const crossSequenceStrategy = makeStrategy({
      entry: {
        type: 'compare',
        operator: 'gt',
        left: priceSeries('execution'),
        right: priceSeries('benchmark'),
      },
    });
    const differentlyScaledBenchmark = coordinate('benchmark-price', normalizedProtocol, {
      scaleTransform: {
        kind: 'uniform-multiplicative',
        factor: '3',
        evidenceRef: 'fixture:different-benchmark-factor',
      },
    });
    const crossReport = checkBacktestRuleCompatibility(
      crossSequenceStrategy,
      makeContext({
        sourceCoordinates: {
          execution: coordinate('execution-price'),
          benchmark: differentlyScaledBenchmark,
        },
      }),
    );
    expect(crossReport.compatible).toBe(false);
    expect(crossReport.issues).toContainEqual(
      expect.objectContaining({ code: 'CROSS_SEQUENCE_PRICE_COORDINATE_MISMATCH' }),
    );

    const aboveAverage = (values: number[]) =>
      values.at(-1)! > values.reduce((total, value) => total + value, 0) / values.length;
    const original = [10, 12, 11];
    expect(aboveAverage(original)).toBe(false);
    expect(aboveAverage(original.map((value) => value * 2))).toBe(false);
    expect(aboveAverage([10, 12, 22])).toBe(true);

    const crossComparison = (left: number, right: number) => left > right;
    expect(crossComparison(10, 9)).toBe(true);
    expect(crossComparison(20, 18)).toBe(true);
    expect(crossComparison(10, 27)).toBe(false);
  });

  it('holding period和百分比离场不依赖价格尺度', () => {
    const strategy = makeStrategy({
      entry: relativeTrend(),
      exit: {
        type: 'compare',
        operator: 'gte',
        left: { type: 'positionState', field: 'holdingPeriods' },
        right: { type: 'constant', value: '10' },
      },
      risk: [{ type: 'fixedStop', percent: '0.05' }],
    });
    const report = checkBacktestRuleCompatibility(strategy, makeContext());
    expect(report.compatible).toBe(true);
    expect(report.issues).toEqual([]);
  });
});
