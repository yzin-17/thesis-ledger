import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { optimizationRunPreparationRequestSchema } from '@thesis-ledger/schemas';
import { OptimizationPricePreparation } from '../src/features/strategy/OptimizationPricePreparation.js';
import {
  prepareOptimizationConfiguration,
  requirePreparedOptimizationConfiguration,
} from '../src/features/strategy/optimization.preparation.js';
import type { DesktopRequestClient } from '../src/features/shared/request.js';

const target = {
  sourceMode: 'existing' as const,
  strategyVersionId: '11111111-1111-4111-8111-111111111111',
};
const request = () =>
  optimizationRunPreparationRequestSchema.parse({
    target,
    intent: {
      contractVersion: 1,
      requestId: 'prepare-experiment',
      warmupBudgetSessions: 60,
      adjustment: 'none',
      accountingBasis: 'raw-events',
      history: { basis: 'fixed-provider-snapshot' },
      runConfig: {
        startDate: '2024-01-02',
        endDate: '2024-03-29',
        dataAsOf: '2026-09-11T00:00:00Z',
        baseCurrency: 'CNY',
        initialCash: { CNY: '10000' },
        valuationPolicy: {
          baseTimezone: 'Asia/Shanghai',
          dailyValuationTime: '15:00',
          pricePolicy: 'latestAvailable',
          fxPolicy: 'latestAvailable',
        },
        executionModel: JSON.parse(
          readFileSync(
            new URL(
              '../../../packages/schemas/fixtures/backtest-execution-model.cn-2024q1.json',
              import.meta.url,
            ),
            'utf8',
          ),
        ),
      },
    },
  });
const blocked = {
  contractVersion: 1,
  requestId: 'prepare-experiment',
  checkedAt: '2026-09-11T00:00:00Z',
  scope: 'baseline-window',
  status: 'blocked',
  diagnostics: [
    {
      severity: 'error',
      category: 'data-unavailable',
      code: 'DATA_UNAVAILABLE',
      message: '来源不可用',
      symbol: null,
      capability: null,
      purpose: null,
      dateRange: null,
      routeKey: null,
      missingFields: [],
      incompatibleRules: [],
      targetSources: [],
      suggestedActions: [{ action: 'retry-preflight', description: '恢复来源后重试' }],
    },
  ],
};

describe('实验配置准备消费', () => {
  it('只发送显式意图，保留阻断结果并关联请求', async () => {
    const send = vi.fn().mockResolvedValue(blocked);
    const signal = new AbortController().signal;
    expect(
      await prepareOptimizationConfiguration(request(), signal, {
        request: send,
      } as DesktopRequestClient),
    ).toEqual(blocked);
    expect(send).toHaveBeenCalledWith(
      '/strategy-optimization/run-config/prepare',
      expect.objectContaining({ signal, body: JSON.stringify(request()) }),
    );
    send.mockResolvedValue({ ...blocked, requestId: 'old' });
    await expect(
      prepareOptimizationConfiguration(request(), signal, {
        request: send,
      } as DesktopRequestClient),
    ).rejects.toThrow('当前请求不一致');
  });
  it('提交时重新比较目标、区间和资金，不复用旧准备', () => {
    const runConfig = { ...request().intent.runConfig,
      priceResearch: { protocolVersion: 'price-research-v1', actualPriceWindow: { version: 'market-frozen-window-v1', identityFingerprint: 'a'.repeat(64), responseHash: 'b'.repeat(64) } },
      executionPriceProtocol: { priceBasis: { adjustment: 'hfq' } },
    };
    const prepared = { target, result: { runConfig } } as never;
    expect(
      requirePreparedOptimizationConfiguration(
        prepared,
        target,
        '2024-01-02',
        '2024-03-29',
        'CNY',
        '10000',
      ),
    ).toEqual(runConfig);
    expect(() =>
      requirePreparedOptimizationConfiguration(
        null,
        target,
        '2024-01-02',
        '2024-03-29',
        'CNY',
        '10000',
      ),
    ).toThrow();
    expect(() =>
      requirePreparedOptimizationConfiguration(
        prepared,
        { ...target, strategyVersionId: 'other' },
        '2024-01-02',
        '2024-03-29',
        'CNY',
        '10000',
      ),
    ).toThrow();
    expect(() =>
      requirePreparedOptimizationConfiguration(
        prepared,
        target,
        '2024-01-03',
        '2024-03-29',
        'CNY',
        '10000',
      ),
    ).toThrow();
    expect(() =>
      requirePreparedOptimizationConfiguration(
        prepared,
        target,
        '2024-01-02',
        '2024-03-29',
        'USD',
        '10000',
      ),
    ).toThrow();
    expect(() =>
      requirePreparedOptimizationConfiguration(
        prepared,
        target,
        '2024-01-02',
        '2024-03-29',
        'CNY',
        '20000',
      ),
    ).toThrow();
  });
  it('自动设置尚未取得时禁用准备，历史选择说明数据可见性', () => {
    const client = new QueryClient();
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <OptimizationPricePreparation
          target={target}
          startDate="2024-01-02"
          endDate="2024-03-29"
          currency="CNY"
          initialCash="10000"
          onPrepared={vi.fn()}
        />
      </QueryClientProvider>,
    );
    for (const label of [
      '后复权计算指标与模拟收益',
      '使用本次取得的历史行情',
      '不代表当时可见的数据版本',
      '模拟成交设置',
      '准备实验配置',
    ])
      expect(html).toContain(label);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>准备实验配置<\/button>/);
    expect(html).not.toContain('<textarea');
    expect(html).not.toContain('实验价格口径');
    client.clear();
  });
});
