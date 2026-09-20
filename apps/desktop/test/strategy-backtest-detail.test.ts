import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import {
  backtestBaseCurrency,
  backtestIdentity,
  backtestMetricNumber,
  deriveBacktestRerun,
  readableBacktestResult,
} from '../src/features/strategy/strategy-backtest-detail.model.js';
import { fetchStrategyBacktestGroups } from '../src/features/strategy/strategy-optimization.api.js';
import {
  jobDetailFallbackInterval,
  jobFallbackInterval,
} from '../src/features/strategy/strategy.queries.js';
import type { DesktopRequestClient } from '../src/features/shared/request.js';
import type { BacktestJob, StrategyRecord } from '../src/features/strategy/strategy.types.js';
import { StrategyBacktestResultTabs } from '../src/features/strategy/StrategyBacktestDetailSections.js';

const strategies: StrategyRecord[] = [
  {
    id: 'strategy-1',
    name: '均线趋势策略',
    versions: [{ id: 'version-2', version: 2, schema: { universe: { symbols: ['510300.SH'] } } }],
  },
];

const job = (overrides: Partial<BacktestJob> = {}): BacktestJob => ({
  id: 'job-1',
  strategyVersionId: 'version-2',
  status: 'succeeded',
  period: { start: '2025-01-01', end: '2025-12-31' },
  input: {
    runConfig: {
      startDate: '2025-01-01',
      endDate: '2025-12-31',
      dataAsOf: '2026-01-01T00:00:00.000Z',
      baseCurrency: 'HKD',
      initialCash: { HKD: '250000' },
      valuationPolicy: { missingPrice: 'fail' },
    },
  },
  result: { metrics: { totalReturn: { status: 'available', value: '0' } } },
  ...overrides,
});

describe('回测独立详情模型', () => {
  it('只按精确版本解析身份，不回退当前最新版本', () => {
    expect(backtestIdentity(job(), strategies, null).title).toBe('均线趋势策略 · v2');
    expect(backtestIdentity(job({ strategyVersionId: 'missing' }), strategies, null).title).toBe(
      '来源信息未记录',
    );
  });

  it('AI 候选身份保留实验、候选编号和阶段', () => {
    const group = {
      id: 'experiment-1',
      kind: 'experiment' as const,
      name: '低波动实验',
      experimentId: 'experiment-1',
      experimentStage: 'test',
      source: null,
      jobs: [job()],
      members: [
        {
          jobId: 'job-1',
          relation: 'candidate' as const,
          split: 'test',
          candidateSource: {
            kind: 'candidate' as const,
            experimentId: 'experiment-1',
            candidateId: 'candidate-1',
            candidateStrategyVersionId: 'version-2',
            candidateNumber: 3,
            stage: 'test',
          },
        },
      ],
    };
    expect(backtestIdentity(job(), strategies, group)).toMatchObject({
      title: '低波动实验 · 候选 3',
      subtitle: '实验阶段 test',
      sourceKind: 'experiment',
    });
  });

  it('区分真实零值、缺失指标和受限结果', () => {
    expect(backtestMetricNumber({ status: 'available', value: '0' })).toBe(0);
    expect(backtestMetricNumber({ status: 'unavailable', reason: '样本不足' })).toBeNull();
    expect(
      readableBacktestResult(
        job({
          readEligibility: {
            state: 'restricted',
            code: 'TEST_NOT_REVEALED',
            scope: 'test',
            accessedAt: null,
            revealedAt: null,
          },
        }),
      ),
    ).toBeNull();
  });

  it('再次运行固定原区间、币种和资金，但不复用旧数据冻结时点', () => {
    const derived = deriveBacktestRerun(job());
    expect(derived.missing).toEqual([]);
    expect(derived.setup).toEqual({
      period: { start: '2025-01-01', end: '2025-12-31' },
      initialCash: 250000,
      baseCurrency: 'HKD',
    });
    expect(backtestBaseCurrency(job(), readableBacktestResult(job()))).toBe('HKD');
  });

  it('原配置缺失或封存未揭示时不提供配置克隆旁路', () => {
    expect(deriveBacktestRerun(job({ input: null, initialCash: null })).missing).toEqual([
      '初始资金',
    ]);
    expect(
      deriveBacktestRerun(
        job({
          readEligibility: {
            state: 'restricted',
            code: 'TEST_NOT_REVEALED',
            scope: 'test',
            accessedAt: null,
            revealedAt: null,
          },
        }),
      ).missing,
    ).toContain('封存测试任务未揭示，不能克隆配置');
  });

  it('分组接口支持按精确任务 ID 定位来源', async () => {
    const request = vi.fn().mockResolvedValue({ items: [] });
    const client = { request } as unknown as DesktopRequestClient;
    await fetchStrategyBacktestGroups({ limit: 1, jobId: 'job/id' }, client);
    expect(request).toHaveBeenCalledWith(
      '/strategy-optimization/backtests/groups?limit=1&jobId=job%2Fid',
      { cache: 'no-store' },
    );
  });

  it('结果页固定四个内容页签并区分成交与已平仓交易口径', () => {
    const markup = renderToStaticMarkup(
      createElement(StrategyBacktestResultTabs, {
        job: job({
          result: {
            schemaVersion: '2',
            metrics: {
              totalReturn: { status: 'available', value: '0.1' },
              maxDrawdown: { status: 'available', value: '-0.03' },
            },
            equityCurve: [
              {
                occurredAt: '2025-12-31T00:00:00.000Z',
                value: { amount: '1100', currency: 'HKD' },
              },
            ],
            simulationFills: [{ id: 'fill-1' }, { id: 'fill-2' }],
            trades: [{ id: 'trade-1' }],
            rejectedOrders: [],
          },
        }),
      }),
    );

    for (const label of ['结果概览', '交易与订单', '数据与假设', '诊断与复现']) {
      expect(markup).toContain(label);
    }
    expect(markup).toContain('已平仓交易数');
    expect(markup).toContain('1');
    expect(markup).toContain('1,100.00');
    expect(markup).toContain('权益与回撤联动图表');
    expect(markup).toContain('查看权益明细（1 个时点）');
    expect(markup).toContain('导出当前筛选区间');
    expect(markup).toContain('每页权益时点数量');
  });

  it('列表仍只在存在非终态任务时启用兜底轮询', () => {
    expect(jobFallbackInterval([{ status: 'running' }])).toBe(30_000);
    expect(jobFallbackInterval([{ status: 'cancelled' }])).toBe(false);
  });

  it('独立详情在运行态主动读取完整结果，终态后停止兜底轮询', () => {
    expect(jobDetailFallbackInterval({ status: 'running' })).toBe(5_000);
    expect(jobDetailFallbackInterval({ status: 'succeeded' })).toBe(false);
    expect(jobDetailFallbackInterval({ status: 'failed' })).toBe(false);
  });
});
