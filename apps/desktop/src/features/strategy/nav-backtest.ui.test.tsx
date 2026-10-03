import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BacktestNavRunSummaryV3 } from '@thesis-ledger/schemas';
import { NavBacktestDetailPage } from './NavBacktestDetailPage.js';
import { NavBacktestJobsTable } from './NavBacktestJobs.js';
import { NavBacktestModel } from './NavBacktestModel.js';
import { ResearchDecisionCard } from './NavBacktestSetupSections.js';
import {
  navFundSymbolForStrategyVersion,
  strategyCenterPath,
  strategyCenterTabForPath,
} from './strategy-center.navigation.js';

const navQueryMocks = vi.hoisted(() => ({
  run: vi.fn(),
  cancel: vi.fn(),
  retry: vi.fn(),
}));

vi.mock('./strategy.nav.queries.js', () => ({
  useNavBacktestRunQuery: navQueryMocks.run,
  useCancelNavBacktestMutation: navQueryMocks.cancel,
  useRetryNavBacktestMutation: navQueryMocks.retry,
}));

describe('基金净值回测 UI 契约', () => {
  it('国内披露假设明确输入预热适用日期，并与申赎确认区分', () => {
    const html = renderToStaticMarkup(
      <ResearchDecisionCard
        fundType="domestic"
        calendarDecision=""
        calendarDecisionConfirmed={false}
        domesticRuleDecision=""
        domesticRuleDecisionConfirmed={false}
        domesticRuleRange={{ startDate: '', endDate: '' }}
        onCalendarDecisionChange={() => undefined}
        onCalendarDecisionConfirmation={() => undefined}
        onDomesticRuleDecisionChange={() => undefined}
        onDomesticRuleDecisionConfirmation={() => undefined}
        onDomesticRuleRangeChange={() => undefined}
      />,
    );
    expect(html).toContain('研究规则开始日期（含预热）');
    expect(html).toContain('研究规则结束日期');
    expect(html).toContain('延迟披露净值');
    expect(html).not.toContain('申购确认作为研究假设');
  });
  beforeEach(() => {
    navQueryMocks.run.mockReturnValue({
      isPending: false,
      error: new Error('服务暂不可用'),
      isFetching: false,
      refetch: vi.fn(),
      data: undefined,
    });
    navQueryMocks.cancel.mockReturnValue({ isPending: false, error: null, mutate: vi.fn() });
    navQueryMocks.retry.mockReturnValue({ isPending: false, error: null, mutate: vi.fn() });
  });

  it('费用和结算模型不会代填渠道默认费率', () => {
    const html = renderToStaticMarkup(
      <NavBacktestModel
        text=""
        symbol="510300.OF"
        startDate="2026-01-01"
        endDate="2026-01-31"
        confirmed={false}
        onChange={() => undefined}
        onConfirm={() => undefined}
      />,
    );

    expect(html).toContain('基金净值执行模型需要明确配置');
    expect(html).toContain('不会自动套用基金渠道默认费率');
    expect(html).toContain('基金净值执行模型配置（JSON）');
    expect(html).not.toContain('默认费率已应用');
  });

  it('NAV 入口要求明确的 CN 基金 NAV 策略版本并落入任务详情路由', () => {
    expect(
      navFundSymbolForStrategyVersion({
        id: 'version-1',
        version: 1,
        schema: {
          executionInstrument: { symbol: '510300.OF', market: 'CN', assetType: 'fund' },
          execution: { mode: 'nav' },
        },
      }),
    ).toBe('510300.OF');
    expect(
      navFundSymbolForStrategyVersion({
        id: 'version-2',
        version: 2,
        schema: {
          executionInstrument: { symbol: '510300.OF', market: 'CN', assetType: 'fund' },
          execution: { mode: 'nav' },
        },
      }),
    ).toBe('510300.OF');
    expect(
      navFundSymbolForStrategyVersion({
        id: 'version-3',
        version: 3,
        schema: {
          executionInstrument: { symbol: '510300.OF', market: 'CN', assetType: 'fund' },
          execution: { mode: 'exchange' },
        },
      }),
    ).toBeNull();
    expect(strategyCenterPath.navBacktestSetup('strategy/1', 'version/2')).toBe(
      '/strategy/jobs/nav/setup/strategy%2F1/version%2F2',
    );
    expect(strategyCenterPath.navBacktestRun('run/3')).toBe('/strategy/jobs/nav/runs/run%2F3');
    expect(strategyCenterTabForPath('/strategy/jobs/nav/runs/run-3')).toBe('jobs');
  });

  it('NAV 任务历史保留可重新打开的独立详情入口', () => {
    const run: BacktestNavRunSummaryV3 = {
      contractVersion: 3,
      inputKind: 'nav',
      id: '00000000-0000-4000-8000-000000000001',
      strategyVersionId: '00000000-0000-4000-8000-000000000002',
      symbol: '510300.OF',
      status: 'succeeded',
      stage: 'completed',
      progress: 100,
      periodStart: '2026-01-01T00:00:00.000Z',
      periodEnd: '2026-01-31T00:00:00.000Z',
      errorCode: null,
      errorSummary: null,
      createdAt: '2026-02-01T00:00:00.000Z',
      updatedAt: '2026-02-01T00:00:30.000Z',
    };
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <NavBacktestJobsTable runs={[run]} />
      </MemoryRouter>,
    );

    expect(html).toContain('NAV 任务');
    expect(html).toContain('510300.OF');
    expect(html).toContain('已完成');
    expect(html).toContain('/strategy/jobs/nav/runs/00000000-0000-4000-8000-000000000001');
    expect(html).toContain('打开任务');
  });

  it('任务详情读取失败时显示可恢复的重新读取操作', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <NavBacktestDetailPage strategies={[]} />
      </MemoryRouter>,
    );

    expect(html).toContain('无法读取基金净值回测任务');
    expect(html).toContain('服务暂不可用');
    expect(html).toContain('重新读取');
  });
});
