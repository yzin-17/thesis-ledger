import { describe, expect, it } from 'vitest';
import {
  strategyStatusLabel,
  strategyVersionDisplayLabel,
  strategyVersionSummary,
} from '../src/features/strategy/strategy-version-summary.model.js';
import type { StrategyVersion } from '../src/features/strategy/strategy.types.js';

const completeSchema = {
  schemaVersion: 'strategy-definition-v1',
  name: '均线突破',
  description: '趋势确认后入场。',
  signalSources: [
    {
      id: 'daily',
      priceCoordinate: 'run',
      asset: { symbol: '510300.SH', market: 'CN', assetType: 'etf' },
      timeframe: '1d',
      series: ['close'],
    },
  ],
  executionInstrument: { symbol: '510300.SH', market: 'CN', assetType: 'etf' },
  primaryTimeframe: '1d',
  entry: {
    type: 'cross',
    direction: 'above',
    left: { type: 'series', sourceId: 'daily', field: 'close' },
    right: {
      type: 'indicator',
      name: 'MA',
      input: { type: 'series', sourceId: 'daily', field: 'close' },
      params: { period: 20 },
    },
  },
  exit: {
    type: 'cross',
    direction: 'below',
    left: { type: 'series', sourceId: 'daily', field: 'close' },
    right: {
      type: 'indicator',
      name: 'MA',
      input: { type: 'series', sourceId: 'daily', field: 'close' },
      params: { period: 20 },
    },
  },
  sizing: { type: 'percentOfEquity', percent: '0.25' },
  risk: [
    { type: 'fixedStop', percent: '0.08' },
    { type: 'maxHoldingPeriod', periods: 30 },
  ],
  execution: {
    mode: 'exchange',
    orderType: 'market',
    timeInForce: 'DAY',
    timing: 'nextEligibleBarOpen',
  },
  cost: { commissionRate: '0.0003', slippageRate: '0.001' },
};

const version = (schema: Record<string, unknown>): StrategyVersion => ({
  id: 'internal-version-uuid',
  version: 3,
  schemaVersion: 1,
  schema,
});

describe('策略版本默认摘要', () => {
  it('日线委托摘要显示实际价格、有效期和父单激活，不写成统一市价', () => {
    const result = strategyVersionSummary(version({ ...completeSchema,
      tradePlan: { version: 1, evaluation: 'barClose', stages: [], cooldown: { bars: 1, stopBars: 1 } },
      execution: { mode: 'exchange', timing: 'dailyBarOrders', orders: [
        { id: 'buy', action: { kind: 'entry' }, order: { kind: 'limit', price: { type: 'constant', value: '10' } }, validity: { kind: 'bars', bars: 2 } },
        { id: 'exit', action: { kind: 'exit' }, order: { kind: 'market' }, validity: { kind: 'DAY' } },
        { id: 'stop', action: { kind: 'stopLoss' }, order: { kind: 'stopMarket', price: { type: 'constant', value: '9' } }, validity: { kind: 'position' }, parent: { templateId: 'buy', activation: 'fullFill' } },
      ] },
    }));
    expect(result.kind).toBe('ready');
    if (result.kind !== 'ready') throw new Error('日线委托无法解析');
    const orders = result.sections.find(s => s.label === '委托计划')!.value;
    expect(orders).toContain('限价为下单时冻结的10');
    expect(orders).toContain('2 根交易日线有效');
    expect(orders).toContain('全部成交后才启用');
    expect(orders).toContain('本轮持仓结束或回测结束时终止，可跨夜');
    expect(result.sections.find(s => s.label === '执行假设')!.value).not.toContain('以当日有效市价单');
    expect(result.sections.find(s => s.label === '交易计划')!.value).toContain('采用各自配置的委托');
  });
  it('会话累计、滚动均价及时间限制从配置读出，版本详情与差异都能辨认', () => {
    for (const cumulative of [true, false]) {
      const source = { ...completeSchema.signalSources[0]!, timeframe: '1m', series: ['close', 'volume'] };
      const result = strategyVersionSummary(version({ ...completeSchema, primaryTimeframe: '1m',
        signalSources: [source], entry: { type: 'all', conditions: [
          { type: 'compare', operator: 'gt', left: { type: 'series', sourceId: 'daily', field: 'close' },
            right: cumulative ? { type: 'sessionValue', sourceId: 'daily', field: 'vwap' }
              : { type: 'indicator', name: 'VWAP', input: { type: 'series', sourceId: 'daily', field: 'close' }, params: { period: 20 } } },
          { type: 'compare', operator: 'lte', left: { type: 'sessionValue', sourceId: 'daily', field: 'elapsedMinutes' },
            right: { type: 'constant', value: '60' } },
        ] } }));
      expect(result.kind).toBe('ready');
      if (result.kind !== 'ready') return;
      const entry = result.sections.find(section => section.label === '入场逻辑')!.value;
      expect(entry).toContain(cumulative ? '当日累计均价' : '滚动成交量加权均价');
      expect(entry).toContain('午休不重置');
      const clock = result.sections.find(section => section.label === '会话与成交时点')!.value;
      expect(clock).toContain('严格晚于信号');
      expect(clock).toContain('缺量');
      expect(entry).not.toContain('无法识别');
    }
  });
  it('月末计划主行不再显示普通25%投入，并直接说明30%目标及3个百分点', () => {
    const result = strategyVersionSummary(
      version({
        ...completeSchema,
        tradePlan: {
          version: 1,
          evaluation: 'barClose',
          stages: [],
          monthlyRebalance: {
            targetEquityFraction: '0.3',
            deviationThreshold: '0.03',
            evaluation: 'lastTradingDayClose',
          },
        },
      }),
    );
    expect(result.kind).toBe('ready');
    if (result.kind !== 'ready') return;
    const allocation = result.sections.find((section) => section.label === '仓位管理')?.value;
    expect(allocation).toContain('最后交易日收盘');
    expect(allocation).not.toContain('25%');
    const plan = result.sections.find((section) => section.label === '交易计划')?.value;
    expect(plan).toContain('权益的 30%');
    expect(plan).toContain('达到 3 个百分点');
    expect(plan).toContain('随后首个可交易开盘');
  });
  it('仓位主行区分固定比例和每日目标，日线计划直接展示计算及执行限制', () => {
    const research = {
      ...completeSchema,
      signalSources: completeSchema.signalSources.map((source) => ({
        ...source,
        priceCoordinate: 'research',
      })),
    };
    const fixed = strategyVersionSummary(version(research));
    expect(fixed.kind).toBe('ready');
    if (fixed.kind !== 'ready') return;
    expect(fixed.sections.find((section) => section.label === '仓位管理')?.value).toContain('25%');
    const daily = strategyVersionSummary(
      version({
        ...research,
        tradePlan: {
          version: 1,
          evaluation: 'barClose',
          stages: [],
          volatilityTarget: {
            returnPeriods: 20,
            targetAnnualVolatility: '0.1',
            maxEquityFraction: '0.5',
            annualizationPeriods: 252,
            returnKind: 'simple',
            variance: 'sample',
            update: 'dailyClose',
          },
        },
      }),
    );
    expect(daily.kind).toBe('ready');
    if (daily.kind !== 'ready') return;
    expect(daily.sections.find((section) => section.label === '仓位管理')?.value).toContain(
      '每日收盘按目标波动率主动调仓',
    );
    const plan = daily.sections.find((section) => section.label === '交易计划')?.value;
    for (const value of [
      '最近 21 个有效收盘',
      '样本标准差',
      '10%÷年化波动率',
      '最高 50%',
      '零波动不新增投入',
      '仅日线',
      '不能与按止损距离定仓或一次性分批计划组合',
    ])
      expect(plan).toContain(value);
  });
  it('把现行策略定义转换为可读的交易、仓位、风险和执行摘要', () => {
    const result = strategyVersionSummary(version(completeSchema));
    expect(result.kind).toBe('ready');
    if (result.kind !== 'ready') return;
    expect(result.sections.map((section) => section.label)).toEqual([
      '策略说明',
      '适用范围',
      '入场逻辑',
      '退出逻辑',
      '仓位管理',
      '风险约束',
      '执行假设',
    ]);
    const scope = result.sections.find((section) => section.label === '适用范围')?.value;
    const entry = result.sections.find((section) => section.label === '入场逻辑')?.value;
    expect(scope).toBe('510300.SH · 中国内地 · ETF · 日线');
    expect(entry).toContain('510300.SH（日线 · 本次运行价格）的收盘价');
    expect(entry).toContain('移动平均线（20）');
    expect(entry).toContain('上穿');
    expect(entry).not.toMatch(/\b(?:daily|close|MA)\b/);
    expect(result.sections.find((section) => section.label === '仓位管理')?.value).toContain('25%');
    expect(result.sections.find((section) => section.label === '风险约束')?.value).toContain(
      '固定止损 8%',
    );
  });

  it('区分真实缺失与字段存在但无法解析', () => {
    const missing = strategyVersionSummary(version({ ...completeSchema, entry: undefined }));
    expect(missing).toEqual({ kind: 'missing', missing: ['入场条件'] });

    const invalid = strategyVersionSummary(
      version({ ...completeSchema, entry: { type: 'unsupported' } }),
    );
    expect(invalid.kind).toBe('invalid');
  });

  it('规则摘要不显示内部信号源和行情字段英文值', () => {
    const schema = {
      ...completeSchema,
      signalSources: [{ ...completeSchema.signalSources[0], id: 'price' }],
      entry: {
        type: 'compare',
        operator: 'gt',
        left: { type: 'series', sourceId: 'price', field: 'close' },
        right: { type: 'constant', value: '0' },
      },
      exit: {
        type: 'compare',
        operator: 'lt',
        left: { type: 'series', sourceId: 'price', field: 'close' },
        right: { type: 'constant', value: '999999' },
      },
    };
    const result = strategyVersionSummary(version(schema));
    expect(result.kind).toBe('ready');
    if (result.kind !== 'ready') return;
    expect(result.sections.find((section) => section.label === '入场逻辑')?.value).toBe(
      '510300.SH（日线 · 本次运行价格）的收盘价大于0',
    );
    expect(result.sections.find((section) => section.label === '退出逻辑')?.value).toBe(
      '510300.SH（日线 · 本次运行价格）的收盘价小于999999',
    );
  });

  it('版本主标签不包含内部标识，业务状态单独映射', () => {
    expect(strategyVersionDisplayLabel(version(completeSchema))).toBe('v3');
    expect(strategyStatusLabel('active')).toBe('使用中');
    expect(strategyStatusLabel('archived')).toBe('已归档');
  });
});
