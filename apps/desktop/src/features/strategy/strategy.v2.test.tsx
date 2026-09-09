import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { runConfigForV2 } from './strategy.actions.js';
import { StrategyV2Summary } from './StrategyV2Summary.js';
import { formatBacktestMetric, completenessLabel } from './StrategySections.js';
import { queueBacktest, cancelBacktestV2, retryBacktestV2 } from './strategy.api.js';
import type { DesktopRequestClient } from '../shared/request.js';

const schema = {
  schemaVersion: '2',
  name: 'V2 fixture',
  executionInstrument: { symbol: '600519.SH', market: 'CN', assetType: 'stock' },
  primaryTimeframe: '1d',
  signalSources: [
    {
      id: 'close',
      asset: { symbol: '600519.SH', market: 'CN', assetType: 'stock' },
      timeframe: '1d',
      series: ['close'],
    },
  ],
  sizing: { type: 'fixedAmount', amount: '10000' },
  risk: [{ type: 'fixedStop', percent: '0.1' }],
  execution: {
    mode: 'exchange',
    orderType: 'market',
    timeInForce: 'DAY',
    timing: 'nextEligibleBarOpen',
  },
  cost: { commissionRate: '0.0003', slippageRate: '0.001' },
};

const makeClient = (response: unknown) => {
  const request = vi.fn((...args: [string, RequestInit?]) => {
    void args;
    return Promise.resolve(response);
  });
  return { client: { request } as unknown as DesktopRequestClient, request };
};

describe('Strategy Lab V2 desktop contract', () => {
  it('将 dataAsOf 规范化为带时区时间并生成仅含策略配置的运行配置', () => {
    const config = runConfigForV2(schema, {
      period: { start: '2026-01-01', end: '2026-01-31' },
      initialCash: 100000,
      dataAsOf: '2026-01-15',
    });

    expect(config.dataAsOf).toMatch(/^2026-01-15T00:00:00\.000Z$/);
    expect(config.initialCash).toEqual({ CNY: '100000' });
    expect(config).not.toHaveProperty('bars');
  });

  it('V2 queue body contains only strategy version, run config and stable idempotency key', async () => {
    const { client, request } = makeClient({ id: 'run-1' });
    await queueBacktest(
      {
        strategyVersionId: 'version-1',
        runConfig: runConfigForV2(schema, {
          period: { start: '2026-01-01', end: '2026-01-31' },
          initialCash: 100000,
        }),
        idempotencyKey: 'submit-1',
      },
      client,
    );

    expect(request).toHaveBeenCalledWith(
      '/backtests/runs',
      expect.objectContaining({ method: 'POST', headers: { 'content-type': 'application/json' } }),
    );
    const init = request.mock.calls[0]?.[1];
    const rawBody = typeof init?.body === 'string' ? init.body : '{}';
    const body = JSON.parse(rawBody) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['idempotencyKey', 'runConfig', 'strategyVersionId']);
    expect(body.idempotencyKey).toBe('submit-1');
  });

  it('V2 result renders status/reason metrics and completeness without converting unavailable to zero', () => {
    expect(formatBacktestMetric({ status: 'available', value: '0.125' })).toBe('12.50%');
    expect(formatBacktestMetric({ status: 'warning', reason: '数据缺口' })).toBe(
      '不可用：数据缺口',
    );
    expect(completenessLabel('partial')).toBe('部分完整');
    expect(completenessLabel('unavailable')).toBe('不可用');
  });

  it('V2 summary exposes the user-facing strategy sections and controls', () => {
    const html = renderToStaticMarkup(
      <StrategyV2Summary schema={schema} editable onChange={vi.fn()} />,
    );
    expect(html).toContain('信号来源');
    expect(html).toContain('固定投入金额');
    expect(html).toContain('固定止损');
    expect(html).toContain('下一可执行 K 线开盘');
    expect(html).not.toContain('Signal Sources');
    expect(html).not.toContain('>fixedAmount<');
    expect(html).not.toContain('>fixedStop<');
    expect(html).not.toContain('nextEligibleBarOpen');
    expect(html).toContain('strategy-v2-timeframe');
  });

  it('V2 cancel/retry remain separate idempotent lifecycle endpoints', async () => {
    const cancel = makeClient({});
    await cancelBacktestV2('run/1', cancel.client);
    expect(cancel.request).toHaveBeenCalledWith('/backtests/runs/run%2F1/cancel', {
      method: 'POST',
    });
    const retry = makeClient({});
    await retryBacktestV2('run/1', retry.client);
    expect(retry.request).toHaveBeenCalledWith('/backtests/runs/run%2F1/retry', { method: 'POST' });
  });
});
