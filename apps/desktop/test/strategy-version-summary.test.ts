import { describe, expect, it } from 'vitest';
import {
  strategyStatusLabel,
  strategyVersionDisplayLabel,
  strategyVersionSummary,
} from '../src/features/strategy/strategy-version-summary.model.js';
import type { StrategyVersion } from '../src/features/strategy/strategy.types.js';

const completeSchema = {
  schemaVersion: '2',
  name: '均线突破',
  description: '趋势确认后入场。',
  signalSources: [
    {
      id: 'daily',
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
  schemaVersion: 2,
  schema,
});

describe('策略版本默认摘要', () => {
  it('把完整 V2 定义转换为可读的交易、仓位、风险和执行摘要', () => {
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
    expect(entry).toContain('510300.SH（日线）的收盘价');
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
      '510300.SH（日线）的收盘价大于0',
    );
    expect(result.sections.find((section) => section.label === '退出逻辑')?.value).toBe(
      '510300.SH（日线）的收盘价小于999999',
    );
  });

  it('版本主标签不包含内部标识，业务状态单独映射', () => {
    expect(strategyVersionDisplayLabel(version(completeSchema))).toBe('v3');
    expect(strategyStatusLabel('active')).toBe('使用中');
    expect(strategyStatusLabel('archived')).toBe('已归档');
  });
});
