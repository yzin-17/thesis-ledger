import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { calculateExecutionModelFees, resolveExecutionModelSegment } from '@thesis-ledger/domain';
import { backtestExecutionModelSchema } from '../src/backtest-execution-model.js';
import {
  backtestInstrumentFactsRequestSchema,
  executionRuleSnapshotSchema,
} from '../src/backtest-data.js';
import {
  runConfigSchemaV2,
  validateStrategyRunConfig,
  type StrategySchemaV2,
} from '../src/backtest-v2.js';

const fixture = () =>
  JSON.parse(
    readFileSync(
      new URL('../fixtures/backtest-execution-model.cn-2024q1.json', import.meta.url),
      'utf8',
    ),
  );
const navFixture = () =>
  JSON.parse(
    readFileSync(
      new URL('../fixtures/backtest-execution-model.nav-fund.json', import.meta.url),
      'utf8',
    ),
  );
const event = {
  expectedVersion: '1',
  symbol: '600519.SH',
  market: 'CN',
  instrumentType: 'STOCK',
  currency: 'CNY' as const,
  evaluatedAt: '2024-01-02T01:30:00Z',
  dataAsOf: '2024-03-29T16:00:00Z',
};

describe('研究模型共享契约与真实 Domain 计算', () => {
  it('事实请求分开预热与执行范围，缺失或倒置区间拒绝', () => {
    const request = {
      symbol: '600519.SH',
      market: 'CN',
      instrumentType: 'STOCK',
      start: '2023-12-17',
      end: '2024-03-29',
      executionStart: '2024-01-02',
      executionEnd: '2024-03-29',
      dataAsOf: event.dataAsOf,
    };
    expect(backtestInstrumentFactsRequestSchema.parse(request)).toEqual(request);
    expect(
      backtestInstrumentFactsRequestSchema.safeParse({ ...request, dataAsOf: 'invalid' }).success,
    ).toBe(false);
    expect(
      backtestInstrumentFactsRequestSchema.safeParse({
        ...request,
        dataAsOf: '2024-03-29T00:00:00+08:00',
      }).success,
    ).toBe(false);
    expect(
      backtestInstrumentFactsRequestSchema.safeParse({ ...request, start: undefined }).success,
    ).toBe(false);
    expect(
      backtestInstrumentFactsRequestSchema.safeParse({ ...request, executionStart: '2023-12-01' })
        .success,
    ).toBe(false);
    expect(
      backtestInstrumentFactsRequestSchema.safeParse({ ...request, executionEnd: '2024-01-01' })
        .success,
    ).toBe(false);
  });
  it('事后配置可用于历史研究，按含规费模型计算非零买卖费用', () => {
    const model = backtestExecutionModelSchema.parse(fixture());
    const segment = resolveExecutionModelSegment(model, event);
    expect(segment.source.kind).toBe('researchPreset');
    const fees = calculateExecutionModelFees(segment.fees!, {
      side: 'buy',
      turnover: '1000',
      currency: 'CNY',
    });
    expect(fees).toEqual({
      charges: [
        { code: 'commission', amount: '5', currency: 'CNY' },
        { code: 'transferFee', amount: '0.01', currency: 'CNY' },
      ],
      total: '5.01',
      currency: 'CNY',
    });
    expect(
      calculateExecutionModelFees(segment.fees!, {
        side: 'sell',
        turnover: '1000',
        currency: 'CNY',
      }).total,
    ).toBe('5.51');
    expect(
      calculateExecutionModelFees(segment.fees!, {
        side: 'sell',
        turnover: '1000',
        currency: 'CNY',
      }),
    ).toEqual(
      calculateExecutionModelFees(segment.fees!, {
        side: 'sell',
        turnover: '1000',
        currency: 'CNY',
      }),
    );
  });

  it.each([
    [
      '最低额缺失',
      (model: ReturnType<typeof fixture>) => {
        delete model.segments[0].fees.commission.minimum;
      },
    ],
    [
      '最低额未知',
      (model: ReturnType<typeof fixture>) => {
        model.segments[0].fees.commission.minimum = null;
      },
    ],
    [
      '费用币种错误',
      (model: ReturnType<typeof fixture>) => {
        model.segments[0].fees.transferFee.currency = 'USD';
      },
    ],
    [
      '来源混入knownAt',
      (model: ReturnType<typeof fixture>) => {
        model.segments[0].source.knownAt = event.evaluatedAt;
      },
    ],
    [
      '无研究假设',
      (model: ReturnType<typeof fixture>) => {
        model.segments[0].assumptions = [];
      },
    ],
    [
      '资产适用性错误',
      (model: ReturnType<typeof fixture>) => {
        model.scope.instrumentType = 'NAV_FUND';
      },
    ],
    [
      '未知版本',
      (model: ReturnType<typeof fixture>) => {
        model.schemaVersion = 'execution-model-v2';
      },
    ],
    [
      '日历不匹配',
      (model: ReturnType<typeof fixture>) => {
        model.segments[0].execution.calendarMarket = 'HK';
      },
    ],
    [
      '缺市场费用',
      (model: ReturnType<typeof fixture>) => {
        delete model.segments[0].fees.stampDuty;
      },
    ],
    [
      '佣金侧不覆盖包含费',
      (model: ReturnType<typeof fixture>) => {
        model.segments[0].fees.commission.side = 'buy';
      },
    ],
  ])('拒绝%s', (_label, mutate) => {
    const model = fixture();
    mutate(model);
    expect(backtestExecutionModelSchema.safeParse(model).success).toBe(false);
  });

  it('分段以包含端点且连续的日期范围表示，变更日仅命中一段', () => {
    const raw = fixture();
    raw.scope.range.start = '2023-08-25';
    const before = structuredClone(raw.segments[0]);
    before.id = 'before';
    before.range = { start: '2023-08-25', end: '2023-08-27' };
    before.fees.stampDuty.rate = '0.001';
    raw.segments[0].range.start = '2023-08-28';
    raw.segments.unshift(before);
    const model = backtestExecutionModelSchema.parse(raw);
    const selected = resolveExecutionModelSegment(model, {
      ...event,
      evaluatedAt: '2023-08-28T01:30:00Z',
    });
    expect(selected.id).toBe('2024q1');
    expect(
      calculateExecutionModelFees(selected.fees!, {
        side: 'sell',
        turnover: '1000',
        currency: 'CNY',
      }).total,
    ).toBe('5.51');
    const old = resolveExecutionModelSegment(model, {
      ...event,
      evaluatedAt: '2023-08-25T01:30:00Z',
    });
    expect(
      calculateExecutionModelFees(old.fees!, { side: 'sell', turnover: '1000', currency: 'CNY' })
        .total,
    ).toBe('6.01');
    for (const start of ['2023-08-27', '2023-08-29']) {
      raw.segments[1].range.start = start;
      expect(backtestExecutionModelSchema.safeParse(raw).success).toBe(false);
    }
  });

  it('历史事实仍拒绝未来knownAt，规则副本不被后续模型编辑改写', () => {
    const raw = fixture();
    raw.segments[0].source = {
      kind: 'historicalFact',
      revision: 'test-only',
      references: ['controlled-input'],
      description: '受控的未来事实拒绝测试',
      knownAt: '2024-01-02T02:00:00Z',
    };
    const model = backtestExecutionModelSchema.parse(raw);
    expect(() => resolveExecutionModelSegment(model, event)).toThrow('尚不可知');
    model.segments[0]!.source = {
      ...raw.segments[0].source,
      knownAt: '2024-01-02T09:00:00+08:00',
    };
    const selected = resolveExecutionModelSegment(model, event);
    model.segments[0]!.id = 'changed';
    expect(selected.id).toBe('2024q1');
    expect(() => resolveExecutionModelSegment(model, { ...event, expectedVersion: '2' })).toThrow(
      '版本',
    );
    expect(() => resolveExecutionModelSegment(model, { ...event, currency: 'USD' })).toThrow(
      '适用性',
    );
    expect(() =>
      resolveExecutionModelSegment(model, { ...event, dataAsOf: '2024-01-01T00:00:00Z' }),
    ).toThrow('dataAsOf');
  });

  it('NAV 必须显式提供生命周期字段和费用，股票模型不能代用', () => {
    const raw = navFixture();
    expect(backtestExecutionModelSchema.safeParse(raw).success).toBe(true);
    const noSubscriptionFee = structuredClone(raw);
    noSubscriptionFee.segments[0].execution.subscriptionFee = {
      treatment: 'notApplicable',
      side: 'buy',
      basis: 'subscriptionApplicationAmount',
      currency: 'CNY',
      collection: 'perApplication',
      collectedAt: 'confirmation',
      reason: '该受控产品配置不收申购费',
    };
    expect(backtestExecutionModelSchema.safeParse(noSubscriptionFee).success).toBe(true);
    const invalidNavFees: Array<[string, (model: ReturnType<typeof navFixture>) => void]> = [
      ['申购侧', (model) => (model.segments[0].execution.subscriptionFee.side = 'sell')],
      ['申购基数', (model) => (model.segments[0].execution.subscriptionFee.basis = 'turnover')],
      ['赎回侧', (model) => (model.segments[0].execution.redemptionFee.side = 'buy')],
      ['赎回基数', (model) => (model.segments[0].execution.redemptionFee.basis = 'turnover')],
      ['费用币种', (model) => (model.segments[0].execution.subscriptionFee.currency = 'USD')],
      [
        'NAV 模型币种',
        (model) => {
          model.scope.currency = 'USD';
          model.segments[0].execution.subscriptionFee.currency = 'USD';
          model.segments[0].execution.redemptionFee.currency = 'USD';
        },
      ],
      ['舍入模式', (model) => (model.segments[0].execution.subscriptionFee.rounding.mode = 'down')],
      [
        '币种小数位',
        (model) => (model.segments[0].execution.redemptionFee.rounding.decimalPlaces = 3),
      ],
      [
        '计费粒度',
        (model) => (model.segments[0].execution.subscriptionFee.collection = 'perFillPerCharge'),
      ],
      ['扣收时点', (model) => (model.segments[0].execution.redemptionFee.collectedAt = 'request')],
      [
        '最低额缺失',
        (model) => {
          delete model.segments[0].execution.redemptionFee.minimum;
        },
      ],
    ];
    for (const [label, mutate] of invalidNavFees) {
      const invalid = structuredClone(raw);
      mutate(invalid);
      expect(backtestExecutionModelSchema.safeParse(invalid).success, label).toBe(false);
    }
    delete raw.segments[0].execution.navAvailability;
    expect(backtestExecutionModelSchema.safeParse(raw).success).toBe(false);
  });

  it('旧冻结规则与旧配置保持原结构，新配置显式携带模型并校验适用性', () => {
    const legacy = {
      status: 'supported',
      version: 'market-rules-v1',
      range: { start: '2024-01-01', end: '2024-12-31' },
      price: { reference: 'previousClose', maxUpRatio: '0.1', maxDownRatio: '0.1' },
      positionSettlement: { sellableAfterTradingDays: 1 },
      cashSettlement: { buyDebitAfterTradingDays: 0, sellCreditAfterTradingDays: 0 },
      statutoryCharges: [{ code: 'STAMP_DUTY', side: 'sell', rate: '0.0005', minimum: null }],
    };
    expect(executionRuleSnapshotSchema.parse(legacy)).toEqual(legacy);
    const config = {
      startDate: '2024-01-02',
      endDate: '2024-03-29',
      dataAsOf: event.dataAsOf,
      baseCurrency: 'CNY',
      initialCash: { CNY: '1000000' },
      valuationPolicy: {
        baseTimezone: 'Asia/Shanghai',
        dailyValuationTime: '15:00',
        pricePolicy: 'latestAvailable',
        fxPolicy: 'latestAvailable',
      },
    };
    expect(runConfigSchemaV2.parse(config)).toEqual(config);
    const selected = runConfigSchemaV2.parse({ ...config, executionModel: fixture() });
    const strategy = JSON.parse(
      readFileSync(new URL('../fixtures/backtest-v2.exchange.json', import.meta.url), 'utf8'),
    ) as StrategySchemaV2;
    expect(validateStrategyRunConfig(strategy, selected).valid).toBe(true);
    for (const executionInstrument of [
      { ...strategy.executionInstrument, symbol: '000001.SZ' },
      { ...strategy.executionInstrument, market: 'HK' as const },
      { ...strategy.executionInstrument, assetType: 'etf' as const },
    ]) {
      expect(validateStrategyRunConfig({ ...strategy, executionInstrument }, selected).valid).toBe(
        false,
      );
    }
    expect(runConfigSchemaV2.safeParse({ ...selected, endDate: '2024-04-01' }).success).toBe(false);
    const historical = fixture();
    historical.segments[0].source = {
      kind: 'historicalFact',
      description: '受控历史来源',
      references: ['controlled'],
      revision: '1',
      knownAt: '2024-01-02T00:00:00+08:00',
    };
    expect(runConfigSchemaV2.safeParse({ ...config, executionModel: historical }).success).toBe(
      false,
    );
    historical.segments[0].source.knownAt = '2024-01-01T23:59:59+08:00';
    expect(runConfigSchemaV2.safeParse({ ...config, executionModel: historical }).success).toBe(
      true,
    );
  });
});
