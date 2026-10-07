import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  backtestNavRunConfigV3Schema,
  strategySchema,
  type BacktestExecutionModelV3,
  type BacktestStrategy,
} from '@thesis-ledger/schemas';
import { planNavSnapshotInputsV3 } from '../../src/backtest/backtest-nav-input-plan.js';
import type { NavPlanningCalendar } from '../../src/backtest/backtest-nav-planning-calendar.js';
import { validateNavPlanningCalendar } from '../../src/backtest/backtest-nav-planning-calendar.js';

const symbol = '110011.OF';
const nav = { type: 'series', sourceId: 'nav', field: 'nav' };
const ma = (period: number, input: unknown = nav) => ({
  type: 'indicator',
  name: 'MA',
  input,
  params: { period },
});
const compare = (left: unknown) => ({
  type: 'compare',
  operator: 'gt',
  left,
  right: { type: 'constant', value: '1' },
});
const strategy = (overrides: Record<string, unknown> = {}): BacktestStrategy =>
  strategySchema.parse({
    schemaVersion: '2',
    name: '净值依赖范围测试',
    signalSources: [
      {
        id: 'nav',
        asset: { symbol, market: 'CN', assetType: 'fund' },
        timeframe: '1d',
        series: ['nav'],
      },
    ],
    executionInstrument: { symbol, market: 'CN', assetType: 'fund' },
    primaryTimeframe: '1d',
    entry: compare(ma(3)),
    exit: compare(ma(4)),
    sizing: { type: 'fixedQuantity', quantity: '1' },
    risk: [],
    execution: { mode: 'nav', requestTypes: ['subscribe', 'redeem'], timing: 'nextAvailableNav' },
    cost: { commissionRate: '0', slippageRate: '0' },
    ...overrides,
  }) as BacktestStrategy;

const config = () => {
  const model = JSON.parse(
    readFileSync(
      new URL(
        '../../../../packages/schemas/fixtures/backtest-execution-model.nav-fund.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ) as BacktestExecutionModelV3;
  model.scope.symbol = symbol;
  return backtestNavRunConfigV3Schema.parse({
    schemaVersion: '3',
    startDate: '2026-09-08',
    endDate: '2026-09-15',
    dataAsOf: '2026-09-30T00:00:00.000001Z',
    baseCurrency: 'CNY',
    initialCash: { CNY: '10000' },
    valuationPolicy: {
      baseTimezone: 'Asia/Shanghai',
      dailyValuationTime: '20:00',
      pricePolicy: 'latestAvailable',
      fxPolicy: 'latestAvailable',
    },
    navInput: { kind: 'nav', symbol },
    navVisibility: { mode: 'strict-publication' },
    executionModel: model,
  });
};

const valuationDates = [
  '2026-09-01',
  '2026-09-02',
  '2026-09-03',
  '2026-09-04',
  '2026-09-07',
  '2026-09-08',
  '2026-09-09',
  '2026-09-10',
  '2026-09-11',
  '2026-09-14',
  '2026-09-15',
];
const calendar = (): NavPlanningCalendar => ({
  symbol,
  market: 'CN',
  timezone: 'Asia/Shanghai',
  version: 'fixture-calendar-1',
  contentHash: 'a'.repeat(64),
  evidenceRef: 'fixture://independent-nav-calendar',
  availableAt: '2026-09-01T00:00:00Z',
  coverage: { startDate: '2026-09-01', endDate: '2026-09-22', complete: true },
  valuationDates: [...valuationDates],
  disclosureWorkDates: [
    ...valuationDates,
    '2026-09-16',
    '2026-09-17',
    '2026-09-18',
    '2026-09-21',
    '2026-09-22',
  ],
  tradingDates: [
    ...valuationDates,
    '2026-09-16',
    '2026-09-17',
    '2026-09-18',
    '2026-09-21',
    '2026-09-22',
  ],
});
const input = () => ({ strategy: strategy(), runConfig: config(), calendar: calendar() });

describe('来源日期研究口径', () => {
  const researchCalendar = () => ({
    ...calendar(),
    version: `nav-research-calendar-v1:${'b'.repeat(64)}`,
    evidenceRef: `research-config://nav-calendar/${'b'.repeat(64)}`,
  });

  it('现行计划拒绝严格模式使用来源日期研究假设', () => {
    expect(() => planNavSnapshotInputsV3({ ...input(), calendar: researchCalendar() })).toThrow(
      '只允许显式研究模式',
    );
  });

  it('研究引用不能以独立日历版本进入严格模式', () => {
    expect(() =>
      planNavSnapshotInputsV3({
        ...input(),
        calendar: { ...researchCalendar(), version: 'fixture-calendar-1' },
      }),
    ).toThrow('只允许显式研究模式');
  });

  it('显式研究模式接受绑定一致的日期证据', () => {
    expect(
      validateNavPlanningCalendar(
        researchCalendar(),
        symbol,
        config().dataAsOf,
        'research-assumption',
      ).version,
    ).toMatch(/^nav-research-calendar-v1:/);
  });

  it.each([
    'fixture://independent-nav-calendar',
    `research-config://nav-calendar/${'c'.repeat(64)}`,
  ])('拒绝假设摘要与引用不一致：%s', (evidenceRef) => {
    expect(() =>
      validateNavPlanningCalendar(
        { ...researchCalendar(), evidenceRef },
        symbol,
        config().dataAsOf,
        'research-assumption',
      ),
    ).toThrow('假设证据引用');
  });
});

describe('NAV 独立依赖范围', () => {
  it('按实际估值日期倒推预热，并将基准范围与净值物理范围分开', () => {
    const plan = planNavSnapshotInputsV3(input());
    expect(plan.warmup).toMatchObject({
      lookbackPeriods: 4,
      entry: 3,
      exit: 4,
      startDate: '2026-09-02',
    });
    expect(plan.warmup.expectedValuationDates).toEqual([
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
      '2026-09-07',
    ]);
    expect(plan.executionDates).toEqual(valuationDates.slice(5));
    expect(plan.navRange).toEqual({ startDate: '2026-09-02', endDate: '2026-09-15' });
    expect(plan.benchmark.range).toEqual(plan.runWindow);
    expect(plan.priceInputs.map((p) => p.purpose)).toEqual(['execution', 'signal', 'benchmark']);
    expect(plan.priceInputs.every((p) => p.artifactKey === 'execution/nav.parquet')).toBe(true);
    expect(plan.routeKey).toEqual({
      kind: 'data',
      market: 'CN',
      assetType: 'MUTUAL_FUND',
      capability: 'FUND_NAV_HISTORY',
    });
    expect(plan.calendarEvidence.evidenceRef).toBe('fixture://independent-nav-calendar');
  });

  it('嵌套指标预热由既有 AST 规则累计，未使用来源不产生依赖', () => {
    const i = input();
    i.strategy = strategy({
      entry: compare(ma(3, ma(3))),
      signalSources: [
        ...i.strategy.signalSources,
        {
          id: 'unused',
          asset: { symbol: '161725.OF', market: 'CN', assetType: 'fund' },
          timeframe: '1d',
          series: ['nav'],
        },
      ],
    });
    const plan = planNavSnapshotInputsV3(i);
    expect(plan.warmup.lookbackPeriods).toBe(5);
    expect(plan.warmup.startDate).toBe('2026-09-01');
    expect(plan.signalSources.map((s) => s.id)).toEqual(['nav']);
  });

  it('对没有价格引用的策略仍保留初始估值所需历史净值', () => {
    const i = input();
    i.strategy = strategy({
      entry: { type: 'positionState', field: 'isOpen' },
      exit: { type: 'positionState', field: 'isOpen' },
    });
    const plan = planNavSnapshotInputsV3(i);
    expect(plan.signalSources).toEqual([]);
    expect(plan.warmup.lookbackPeriods).toBe(1);
    expect(plan.warmup.startDate).toBe('2026-09-07');
  });

  it('尾部按模型延迟和交易日历计算，不延长结果或要求结束日后的净值', () => {
    const plan = planNavSnapshotInputsV3(input());
    expect(plan.periodEnd).toEqual({
      behavior: 'retain-pending',
      resultEndDate: '2026-09-15',
      confirmation: 1,
      afterConfirmation: 2,
      tailTradingDays: 4,
    });
    expect(plan.calendarRange.endDate).toBe('2026-09-21');
    expect(plan.expectedValuationDates.at(-1)).toBe('2026-09-15');
  });

  it('多段费用模型保守采用各延迟上界，申赎日历与估值日期相互独立', () => {
    const i = input();
    const first = i.runConfig.executionModel.segments[0]!;
    first.range.end = '2026-09-10';
    const second = structuredClone(first);
    second.id = 'second';
    second.range = { start: '2026-09-11', end: '2026-09-15' };
    if (second.execution.mode !== 'nav') throw new Error('测试模型错误');
    second.execution.confirmationAfterTradingDays = 2;
    i.runConfig.executionModel.segments.push(second);
    i.calendar.valuationDates = i.calendar.valuationDates.filter((day) => day !== '2026-09-10');
    const plan = planNavSnapshotInputsV3(i);
    expect(plan.periodEnd.tailTradingDays).toBe(5);
    expect(plan.calendarRange.endDate).toBe('2026-09-22');
    expect(plan.executionDates).not.toContain('2026-09-10');
    expect(plan.processingDates).toContain('2026-09-10');
  });

  it.each([
    [
      '预热不足',
      (c: NavPlanningCalendar) => {
        c.valuationDates = c.valuationDates.slice(3);
      },
    ],
    [
      '尾部不足',
      (c: NavPlanningCalendar) => {
        c.tradingDates = c.tradingDates.filter((day) => day <= '2026-09-18');
      },
    ],
    [
      '执行范围为空',
      (c: NavPlanningCalendar) => {
        c.valuationDates = c.valuationDates.filter((day) => day < '2026-09-08');
      },
    ],
    [
      '日期乱序',
      (c: NavPlanningCalendar) => {
        c.valuationDates.reverse();
      },
    ],
    [
      '日期重复',
      (c: NavPlanningCalendar) => {
        c.tradingDates.push('2026-09-22');
      },
    ],
    [
      '覆盖范围不符',
      (c: NavPlanningCalendar) => {
        c.coverage.startDate = '2026-09-09';
      },
    ],
    [
      '基金身份不符',
      (c: NavPlanningCalendar) => {
        c.symbol = '161725.OF';
      },
    ],
    [
      '未来日历',
      (c: NavPlanningCalendar) => {
        c.availableAt = '2026-09-30T00:00:00.000002Z';
      },
    ],
  ] as const)('拒绝%s', (_label, change) => {
    const i = input();
    change(i.calendar);
    expect(() => planNavSnapshotInputsV3(i)).toThrowError(
      expect.objectContaining({ code: 'DATA_UNAVAILABLE' }),
    );
  });

  it('拒绝不同信号基金、不同基准及旧策略费用', () => {
    const i = input();
    i.strategy.signalSources[0]!.asset.symbol = '161725.OF';
    expect(() => planNavSnapshotInputsV3(i)).toThrow('信号');
    const other = input();
    other.strategy.benchmark = { symbol: '161725.OF', market: 'CN', assetType: 'fund' };
    expect(() => planNavSnapshotInputsV3(other)).toThrow('基准');
    const charged = input();
    charged.strategy.cost.commissionRate = '0.01';
    expect(() => planNavSnapshotInputsV3(charged)).toThrow('费用');
    const wrong = input();
    wrong.runConfig.navInput.symbol = '161725.OF';
    expect(() => planNavSnapshotInputsV3(wrong)).toThrow();
  });

  it('拒绝事件信号与非法周期，并接受同基金显式基准', () => {
    const i = input();
    i.strategy.entry = { type: 'corporateActionEvent', eventType: 'SPLIT' };
    expect(() => planNavSnapshotInputsV3(i)).toThrow('事件信号');
    const explicit = input();
    explicit.strategy.benchmark = { ...explicit.strategy.executionInstrument };
    expect(planNavSnapshotInputsV3(explicit).benchmark.explicit).toBe(true);
    const invalid = input();
    invalid.strategy.primaryTimeframe = '1m';
    expect(() => planNavSnapshotInputsV3(invalid)).toThrow();
  });

  it('拒绝没有完整覆盖声明的独立日历', () => {
    const i = input();
    Reflect.deleteProperty(i.calendar.coverage, 'complete');
    expect(() => planNavSnapshotInputsV3(i)).toThrow('日历格式');
  });
});
