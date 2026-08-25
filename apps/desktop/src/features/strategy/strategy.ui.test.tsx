import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  benchmarkOptions,
  directoryInstrumentOptions,
  filterBenchmarkOptions,
  normalizeSingleSymbol,
  signalIndicatorOptions,
} from './StrategyEditorSheet.js';
import { StrategyJobs, StrategyLibrary, jobStatusLabel } from './StrategySections.js';
import {
  createDefaultStrategySchema,
  schemaFromVersion,
  schemaSymbols,
} from './strategy.schema.js';
import { validateBacktestSetup } from './strategy.actions.js';
import type { BacktestJob, StrategyRecord } from './strategy.types.js';

const schema = createDefaultStrategySchema('可复现策略');
const version = { id: 'version-1', version: 1, schema, createdAt: '2026-08-25T00:00:00.000Z' };
const strategy: StrategyRecord = {
  id: 'strategy-1',
  name: '可复现策略',
  status: 'active',
  updatedAt: '2026-08-25T00:00:00.000Z',
  versions: [version],
};
const job: BacktestJob = {
  id: 'job-1',
  strategyVersionId: 'version-1',
  status: 'running',
  progress: 45,
  period: { start: '2026-01-01', end: '2026-01-31' },
  createdAt: '2026-08-25T00:00:00.000Z',
  input: { initialCash: 100_000 },
  warnings: [],
};

describe('策略实验工作台 UI 契约', () => {
  it('策略库空态提供创建 CTA，非空态展示版本、状态和最近任务', () => {
    const emptyHtml = renderToStaticMarkup(
      <StrategyLibrary
        strategies={[]}
        jobs={[]}
        loadState="ready"
        busyAction={null}
        onCreate={vi.fn()}
        onEdit={vi.fn()}
        onBacktest={vi.fn()}
      />,
    );
    expect(emptyHtml).toContain('创建第一条策略');

    const readyHtml = renderToStaticMarkup(
      <StrategyLibrary
        strategies={[strategy]}
        jobs={[{ ...job, status: 'succeeded', progress: 100 }]}
        loadState="ready"
        busyAction={null}
        onCreate={vi.fn()}
        onEdit={vi.fn()}
        onBacktest={vi.fn()}
      />,
    );
    expect(readyHtml).toContain('可复现策略');
    expect(readyHtml).toContain('v1');
    expect(readyHtml).toContain('已完成');
    expect(readyHtml).toContain('开始回测');
  });

  it('任务表使用中文状态、运行进度和可重试操作', () => {
    expect(jobStatusLabel('queued')).toBe('排队中');
    expect(jobStatusLabel('unknown')).toBe('未知状态');
    const html = renderToStaticMarkup(
      <StrategyJobs
        jobs={[job]}
        strategies={[strategy]}
        loadState="ready"
        busyAction={null}
        onRun={vi.fn()}
        onCancel={vi.fn()}
        onViewResult={vi.fn()}
      />,
    );
    expect(html).toContain('运行中');
    expect(html).toContain('45%');
    expect(html).toContain('取消');
  });

  it('编辑 Schema 会同步父策略名称，回测 Dialog 使用精确版本的首个标的', () => {
    const editedSchema = schemaFromVersion(version, strategy.name);
    expect(editedSchema.name).toBe(strategy.name);
    const multiSymbolSchema = {
      ...schema,
      universe: { symbols: ['600519.SH', '000300.SH'] },
    };
    const multiSymbolVersion = {
      ...version,
      schema: multiSymbolSchema,
    };
    expect(schemaSymbols(multiSymbolVersion.schema)).toEqual(['600519.SH', '000300.SH']);
  });

  it('基准下拉提供默认指数列表，标的支持搜索且只保留一个', () => {
    expect(benchmarkOptions).toHaveLength(7);
    expect(benchmarkOptions[0]).toEqual({ value: '000300.SH', label: '沪深 300' });
    expect(benchmarkOptions).toContainEqual({ value: '000688.SH', label: '科创 50' });
    const csi500 = benchmarkOptions[4];
    if (!csi500) throw new Error('默认基准列表缺少中证 500');
    expect(filterBenchmarkOptions(csi500, '500')).toBe(true);
    expect(filterBenchmarkOptions(csi500, '中证')).toBe(true);
    expect(filterBenchmarkOptions(csi500, '创业板')).toBe(false);
    expect(
      directoryInstrumentOptions([
        {
          symbol: '600519.SH',
          canonicalCode: '600519',
          market: 'SH',
          displayName: '贵州茅台',
        },
        {
          symbol: '600519.SH',
          canonicalCode: '600519',
          market: 'SH',
          displayName: '贵州茅台（重复结果）',
        },
      ]),
    ).toEqual([{ value: '600519.SH', label: '贵州茅台' }]);
    expect(
      normalizeSingleSymbol({ universe: { symbols: ['600519.SH', '000300.SH'] } }).universe,
    ).toEqual({ symbols: ['600519.SH'] });
  });

  it('信号指标使用回测引擎支持的下拉枚举', () => {
    expect(signalIndicatorOptions).toEqual([
      { value: 'close', label: '收盘价（close）' },
      { value: 'price', label: '收盘价（price）' },
      { value: 'open', label: '开盘价（open）' },
      { value: 'high', label: '最高价（high）' },
      { value: 'low', label: '最低价（low）' },
      { value: 'volume', label: '成交量（volume）' },
    ]);
  });

  it('结果任务保留引擎、数据时点和结果校验和字段', () => {
    const resultJob: BacktestJob = {
      ...job,
      status: 'succeeded',
      result: {
        finalValue: 101_000,
        metrics: { cumulativeReturn: 0.01 },
        equityCurve: [{ date: '2026-01-01', value: 100_000 }],
        trades: [],
      },
      engineVersion: 'engine-v1',
      resultChecksum: 'checksum',
    };
    expect(resultJob.engineVersion).toBe('engine-v1');
    expect(resultJob.resultChecksum).toBe('checksum');
    expect(resultJob.result).toMatchObject({ finalValue: 101_000 });
  });

  it('回测配置拒绝反向日期和非正资金', () => {
    expect(
      validateBacktestSetup({
        period: { start: '2026-02-01', end: '2026-01-01' },
        initialCash: 100,
      }),
    ).toContain('开始日期');
    expect(
      validateBacktestSetup({ period: { start: '2026-01-01', end: '2026-01-31' }, initialCash: 0 }),
    ).toContain('初始资金');
  });
});
