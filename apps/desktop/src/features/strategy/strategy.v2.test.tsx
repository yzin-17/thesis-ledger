import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { StrategyV2Summary } from './StrategyV2Summary.js';
import { completenessLabel } from './BacktestModelDisclosure.js';
import { cancelBacktest, retryBacktest } from './strategy.api.js';
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

describe('策略工作台当前合同', () => {
  it('结果完整性状态显示为中文', () => {
    expect(completenessLabel('partial')).toBe('部分完整');
    expect(completenessLabel('unavailable')).toBe('不可用');
  });

  it('策略摘要展示中文业务字段和控件', () => {
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

  it('回测弹窗使用紧凑策略摘要并隐藏次要执行细节', () => {
    const html = renderToStaticMarkup(
      <StrategyV2Summary schema={schema} variant="compact" strategyName="测试策略" version={1} />,
    );

    expect(html).toContain('测试策略');
    expect(html).toContain('策略 v1');
    expect(html).toContain('固定投入金额');
    expect(html).toContain('固定止损');
    expect(html).not.toContain('能力边界');
    expect(html).not.toContain('下一可执行 K 线开盘');
  });

  it('取消与重试使用独立的现行 Run 入口', async () => {
    const cancel = makeClient({});
    await cancelBacktest('run/1', cancel.client);
    expect(cancel.request).toHaveBeenCalledWith('/backtests/runs/run%2F1/cancel', {
      method: 'POST',
    });
    const retry = makeClient({});
    await retryBacktest('run/1', retry.client);
    expect(retry.request).toHaveBeenCalledWith('/backtests/runs/run%2F1/retry', { method: 'POST' });
  });
});
