import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { StrategyRecord } from '../src/features/strategy/strategy.types.js';

const { StrategyEditorPage } = await import('../src/features/strategy/StrategyEditorPage.js');
const { StrategyExperimentCreatePage } =
  await import('../src/features/strategy/StrategyExperimentCreatePage.js');

const schema = {
  schemaVersion: '2',
  name: '路由夹具',
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
  entry: { type: 'positionState', field: 'isOpen' },
  exit: { type: 'positionState', field: 'isOpen' },
  sizing: { type: 'fixedAmount', amount: '10000' },
  risk: [],
  execution: {
    mode: 'exchange',
    orderType: 'market',
    timeInForce: 'DAY',
    timing: 'nextEligibleBarOpen',
  },
  cost: { commissionRate: '0.0003', slippageRate: '0.001' },
};

const strategies: StrategyRecord[] = [
  {
    id: 'strategy-1',
    name: '路由夹具',
    status: 'draft',
    versions: [{ id: 'version-1', version: 1, schemaVersion: 2, schema }],
  },
];

const renderDataRoute = (path: string, routePattern: string, element: React.ReactNode) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter([{ path: routePattern, element }], { initialEntries: [path] });
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
};

describe('策略中心生产路由兼容性', () => {
  it('在 Data Router 根上下文中直接打开编辑页不会因 useBlocker 白屏', () => {
    const html = renderDataRoute(
      '/strategy/library/strategy-1/versions/version-1/edit',
      '/strategy/library/:strategyId/versions/:versionId/edit',
      <StrategyEditorPage strategies={strategies} loading={false} mode="edit" />,
    );
    expect(html).toContain('编辑当前版本');
    expect(html).toContain('基于 v1 编辑');
    expect(html).toContain('编辑 路由夹具 的新版本');
    expect(html).toContain('统一回测 V2 策略');
  });

  it('在 Data Router 根上下文中直接打开实验创建页可以渲染第一步', () => {
    const html = renderDataRoute(
      '/strategy/experiments/new?strategyVersionId=version-1',
      '/strategy/experiments/new',
      <StrategyExperimentCreatePage strategies={strategies} />,
    );
    expect(html).toContain('新建 AI 实验');
    expect(html).toContain('策略与目标');
  });
});
