import { type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialogProvider } from '../src/components/ui/confirm-dialog.js';
import { PerformanceSnapshotTable } from '../src/features/performance/PerformanceTrendSection.js';
import { PerformanceAllocationSection } from '../src/features/performance/PerformanceSections.js';
import type { LoadState } from '../src/features/shared/types.js';

const render = (
  loadState: LoadState,
  groupedByCurrency = false,
  series?: ComponentProps<typeof PerformanceSnapshotTable>['series'],
) =>
  renderToStaticMarkup(
    <ConfirmDialogProvider>
      <PerformanceSnapshotTable
        loadState={loadState}
        snapshots={[]}
        series={series}
        range="1Y"
        interval="1d"
        groupedByCurrency={groupedByCurrency}
        onRangeChange={vi.fn()}
        onIntervalChange={vi.fn()}
        onRetry={vi.fn()}
        onCompleteDataSetup={vi.fn()}
      />
    </ConfirmDialogProvider>,
  );

describe('资产走势读取状态', () => {
  it.each(['error', 'stale', 'loading', 'empty', 'ready'] as const)('目标缺失引导只用于已确认的空状态（%s）', (loadState) => {
    const markup = renderToStaticMarkup(<ConfirmDialogProvider><PerformanceAllocationSection
      loadState={loadState} allocationRows={[]} rebalanceRows={[]} targets={{}}
      dataQuality={{ partial: false, missingSymbols: [] }} onSaveTargets={vi.fn()}
    /></ConfirmDialogProvider>);
    expect(markup.includes('先设置目标配置')).toBe(loadState === 'empty' || loadState === 'ready');
  });
  it('首次失败只显示失败和重试，不提示完成配置', () => {
    const markup = render('error');
    expect(markup).toContain('重新加载');
    expect(markup).not.toContain('暂无收益历史');
    expect(markup).not.toContain('完成数据配置');
  });

  it('成功空集才显示配置引导', () => {
    expect(render('empty')).toContain('完成数据配置');
  });

  it.each([false, true])('加载中不提前显示空态，分币种=%s', (grouped) => {
    const markup = render('loading', grouped);
    expect(markup).toContain('资产走势加载中');
    expect(markup).not.toContain('完成数据配置');
  });

  it('缓存空集刷新失败不再建议配置，恢复后重新显示有效空态', () => {
    expect(render('stale')).not.toContain('完成数据配置');
    expect(render('empty')).toContain('完成数据配置');
  });

  it('刷新失败仍呈现已有估值点，不退为空配置引导', () => {
    const markup = render('stale', false, {
      range: '1Y',
      interval: '1d',
      currency: 'CNY',
      availableIntervals: ['1d'],
      defaultInterval: '1d',
      dataQuality: 'COMPLETE',
      historyStart: '2026-10-20T00:00:00.000Z',
      points: [
        {
          at: '2026-10-20T00:00:00.000Z',
          value: 123456.78,
          currency: 'CNY',
          valuationBasis: 'OFFICIAL',
          disclosureCoverage: 1,
          pricedCoverage: 1,
          dataQuality: 'COMPLETE',
          sourceSnapshotId: null,
        },
      ],
    });
    expect(markup).toContain('123,456.78');
    expect(markup).toContain('刷新失败');
    expect(markup).not.toContain('完成数据配置');
  });
});
