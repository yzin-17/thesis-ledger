// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { backtestBenchmarkCompatibilitySchemaV3 } from '@thesis-ledger/schemas';
import { describe, expect, it } from 'vitest';
import * as model from '../src/features/strategy/strategy-backtest-detail.model';
import { backtestResultSummary } from '../src/features/strategy/strategy-list-presentation';
import {
  backtestBenchmarkDisplayMetrics,
  backtestPartialResultSummary,
} from '../src/features/strategy/strategy-backtest-result-availability.model';
import { StrategyBacktestResultTabs } from '../src/features/strategy/StrategyBacktestDetailSections';
import { unifiedRatioCases, unifiedRatioJob } from './unified-backtest-ratio-samples';

const percentage = (value: unknown, magnitude = false) => {
  const format = (
    model as unknown as Record<string, (value: unknown, magnitude: boolean) => string | null>
  ).backtestMetricPercent;
  expect(format).toBeTypeOf('function');
  return format!(value, magnitude);
};
const markupMetric = (host: HTMLElement, label: string) => {
  const node = [...host.querySelectorAll('p,dt')].find((node) => node.textContent === label);
  expect(node, label).toBeTruthy();
  return node!.parentElement!.querySelector('strong')!.textContent;
};

describe('统一回测比例读取', () => {
  it.each(unifiedRatioCases)('$name 的文本与 number 保留原值', ({ value, expected, magnitude }) => {
    for (const input of [
      value,
      { status: 'available', value },
      { amount: value },
      { status: 'available', value: { amount: value } },
    ]) {
      expect(percentage(input)).toBe(expected);
      expect(percentage(input, true)).toBe(magnitude);
    }
  });
  it.each([
    null,
    undefined,
    '',
    'bad',
    Infinity,
    NaN,
    { status: 'unavailable', value: '0.1', reason: '样本不足' },
    { status: 'unknown', value: '0.1' },
    [],
    {},
  ])('无效值与真实零区分 %j', (value) => expect(percentage(value)).toBeNull());
  it('数值读取保留既有 amount 与状态行为', () => {
    expect(model.backtestMetricNumber({ status: 'available', value: { amount: '1.234' } })).toBe(
      1.234,
    );
    expect(model.backtestMetricNumber({ status: 'unavailable', value: '1' })).toBeNull();
  });
});

describe('列表和实际详情', () => {
  it.each(unifiedRatioCases)(
    '$name 使用相同收益与回撤幅度',
    ({ value, expected, magnitude, chart }) => {
      const job = unifiedRatioJob(value, chart),
        before = JSON.stringify(job);
      const summary = backtestResultSummary({ ...job, resultMetrics: job.result!.metrics });
      expect(summary).toBe('收益 ' + expected + ' · 回撤 ' + magnitude + ' · 夏普 1.23');
      const host = document.createElement('div');
      host.innerHTML = renderToStaticMarkup(<StrategyBacktestResultTabs job={job} />);
      expect(markupMetric(host, '策略净收益')).toBe(expected);
      expect(markupMetric(host, '最大回撤')).toBe(magnitude);
      expect(host.textContent).toContain('夏普比率1.23');
      expect(host.textContent).toContain('不可用：缺少有效估值');
      expect(host.textContent).toContain('基准净收益' + expected);
      expect(host.textContent).toContain('净收益差' + expected);
      expect(JSON.stringify(job)).toBe(before);
    },
  );
  it('部分结果只列真正不可用的项目', () => {
    const job = unifiedRatioJob('1' + '0'.repeat(400));
    const summary = backtestPartialResultSummary(job.result!);
    expect(summary).toContain('波动率（缺少有效估值）');
    expect(summary).not.toContain('策略净收益（');
    expect(summary).not.toContain('净收益差（');
  });
  it.each([
    [
      { status: 'incompatible', differentFields: ['priceProtocol'] },
      'BENCHMARK_COMPARISON_INCOMPATIBLE',
    ],
    [{ status: 'unverified', missingFields: ['priceProtocol'] }, 'BENCHMARK_COMPARISON_UNVERIFIED'],
    [
      { costAssumption: { kind: 'unsupported', version: 'legacy', fingerprint: 'a'.repeat(16) } },
      'BENCHMARK_COST_MODEL_UNSUPPORTED',
    ],
  ])('有效超大文本仍受基准限制 %j', (restriction, reason) => {
    const job = unifiedRatioJob('1' + '0'.repeat(400));
    job.result!.benchmarkCompatibility = backtestBenchmarkCompatibilitySchemaV3.parse({
      ...(job.result!.benchmarkCompatibility as Record<string, unknown>),
      ...restriction,
    });
    expect(backtestBenchmarkDisplayMetrics(job.result!)!.excessReturn).toEqual({
      status: 'unavailable',
      reason,
    });
  });
  it('状态与不可用原文保持', () => {
    expect(
      backtestResultSummary({
        ...unifiedRatioJob(0),
        status: 'failed',
        errorSummary: '冻结失败说明',
      }),
    ).toBe('冻结失败说明');
    const job = unifiedRatioJob(0);
    job.result!.metrics = { totalReturn: { status: 'unavailable', reason: '样本不足' } };
    expect(backtestResultSummary({ ...job, resultMetrics: job.result!.metrics })).toBe(
      '结果已生成',
    );
    const host = document.createElement('div');
    host.innerHTML = renderToStaticMarkup(<StrategyBacktestResultTabs job={job} />);
    expect(markupMetric(host, '策略净收益')).toBe('不可用：样本不足');
  });
});
