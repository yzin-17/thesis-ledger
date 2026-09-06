import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import {
  PerformanceAccountSelector,
  PerformanceAllocationSection,
  PerformanceMetrics,
  PerformanceSnapshotTable,
} from '../src/features/performance/PerformanceSections.js';
import { PortfolioModeSwitch } from '../src/features/shared/PortfolioModeSwitch.js';
import { captureCloseSnapshots, fetchPerformanceHistory } from '../src/features/performance/performance.api.js';
import type { DesktopRequestClient } from '../src/features/shared/request.js';

describe('收益分析交互契约', () => {
  it('混合币种时提示选择单账户并保留模式账户列表', () => {
    const markup = renderToStaticMarkup(
      <PerformanceAccountSelector
        accounts={[
          { id: 'cny', name: '人民币账户', type: 'securities', mode: 'actual', currency: 'CNY' },
          { id: 'hkd', name: '港币账户', type: 'securities', mode: 'actual', currency: 'HKD' },
          { id: 'shadow', name: '影子账户', type: 'securities', mode: 'shadow', currency: 'CNY' },
        ]}
        mode="actual"
        accountId="cny"
        mixedCurrencies
        latestSnapshotAt={undefined}
        valuedAt={undefined}
        onAccountChange={vi.fn()}
      />,
    );
    expect(markup).toContain('当前模式包含多个币种');
    expect(markup).toContain('人民币账户');
    expect(markup).not.toContain('影子账户');
  });

  it('组合模式使用实际/模拟 Switch', () => {
    const markup = renderToStaticMarkup(
      <PortfolioModeSwitch mode="actual" onModeChange={vi.fn()} ariaLabel="收益范围" />,
    );
    expect(markup).toContain('收益范围');
    expect(markup).toContain('data-slot="switch"');
    expect(markup).toContain('data-mode="actual"');
    expect(markup).toContain('h-7');
    expect(markup).toContain('w-[70px]');
    expect(markup).toContain('bg-[color:var(--color-mode-switch-track)]');
    expect(markup).toContain('text-[color:var(--color-mode-switch-text)]');
    expect(markup).toContain('border-[color:var(--color-mode-switch-border)]');
    expect(markup).toContain('border-[color:var(--color-mode-switch-thumb-border)]');
    expect(markup).not.toContain('shadow-[var(--color-mode-switch-thumb-shadow)]');
    expect(markup).toContain('data-checked:translate-x-[40px]');
    expect(markup).not.toContain('data-checked:bg-');
    expect(markup).toContain('实际');
    expect(markup).toContain('模拟');
    expect(markup).not.toContain('data-slot="toggle-group"');
  });

  it('混合币种默认关闭汇率合并并显示分币种提示', () => {
    const markup = renderToStaticMarkup(
      <PerformanceAccountSelector
        accounts={[
          { id: 'cny', name: '人民币账户', type: 'securities', mode: 'actual', currency: 'CNY' },
          { id: 'hkd', name: '港币账户', type: 'securities', mode: 'actual', currency: 'HKD' },
        ]}
        mode="actual"
        accountId=""
        mixedCurrencies
        latestSnapshotAt={undefined}
        valuedAt={undefined}
        onAccountChange={vi.fn()}
      />,
    );
    expect(markup).toContain('汇率合并');
    expect(markup).toContain('data-unchecked');
    expect(markup).toContain('按币种分组展示');
  });

  it('汇率陈旧与阻断状态不伪装成普通收益值', () => {
    const staleMarkup = renderToStaticMarkup(
      <PerformanceMetrics
        latest={undefined}
        summary={{
          ttwror: null,
          xirr: null,
          fx: {
            enabled: true,
            status: 'stale',
            baseCurrency: 'CNY',
            estimated: true,
            conversionMode: 'current-rate',
            fxAsOf: '2026-08-24',
            fxStale: true,
            missingCurrencies: [],
            rates: [],
          },
        }}
        snapshotCount={2}
      />,
    );
    expect(staleMarkup).toContain('按当前汇率回算 · 估算 · 使用陈旧汇率');
    expect(staleMarkup).toContain('>—<');
  });

  it('快照不足或 partial 时使用破折号和明确原因', () => {
    const markup = renderToStaticMarkup(
      <PerformanceMetrics
        latest={{
          id: 'snapshot-1',
          capturedAt: '2026-08-24T00:00:00.000Z',
          marketValue: 100,
          costValue: 100,
          cashValue: 20,
          partial: true,
          missingSymbols: ['600519.SH'],
        }}
        summary={null}
        snapshotCount={1}
        summaryError="收益摘要包含部分快照，请补齐行情"
      />,
    );
    expect(markup).toContain('>—<');
    expect(markup).toContain('收益摘要包含部分快照，请补齐行情');
    expect(markup).toContain('行情不完整，尚无完整估值');
  });

  it('partial 配置保留金额、隐藏权重并暂停建议，包含无持仓指数目标', () => {
    const markup = renderToStaticMarkup(
      <PerformanceAllocationSection
        loadState="ready"
        allocationRows={[{ category: 'stock', value: 100, weight: null }]}
        rebalanceRows={[]}
        targets={{ stock: 0.6, index: 0.4 }}
        dataQuality={{ partial: true, missingSymbols: ['600519.SH'] }}
        valuedAt="2026-08-24T00:00:00.000Z"
        onSaveTargets={vi.fn(async () => true)}
      />,
    );
    expect(markup).toContain('行情不完整');
    expect(markup).toContain('暂停');
    expect(markup).toContain('指数');
    expect(markup).toContain('¥100.00');
    expect(markup).not.toContain('60.00%');
  });

  it('目标为零时仍保留分类并展示零目标行', () => {
    const markup = renderToStaticMarkup(
      <PerformanceAllocationSection
        loadState="ready"
        allocationRows={[{ category: 'stock', value: 100, weight: 1 }]}
        rebalanceRows={[]}
        targets={{ stock: 0, etf: 1 }}
        dataQuality={{ partial: false, missingSymbols: [] }}
        valuedAt="2026-08-24T00:00:00.000Z"
        onSaveTargets={vi.fn(async () => true)}
      />,
    );
    expect(markup).toContain('股票');
    expect(markup).toContain('ETF');
    expect(markup).toContain('0.00%');
  });

  it('目标读取失败时保留当前配置但标记目标不可用', () => {
    const markup = renderToStaticMarkup(
      <PerformanceAllocationSection
        loadState="ready"
        allocationRows={[{ category: 'stock', value: 100, weight: 1 }]}
        rebalanceRows={[]}
        targets={{}}
        dataQuality={{ partial: false, missingSymbols: [] }}
        targetsUnavailable
        portfolioScope
        valuedAt="2026-08-24T00:00:00.000Z"
        editDisabled
        onSaveTargets={vi.fn(async () => true)}
      />,
    );
    expect(markup).toContain('组合目标暂时无法读取');
    expect(markup).toContain('不可用');
    expect(markup).toContain('¥100.00');
    expect(markup).toContain('100.00%');
    expect(markup).not.toContain('数据可能陈旧');
  });

  it('没有快照时使用紧凑空状态而不是空表格', () => {
    const markup = renderToStaticMarkup(
      <PerformanceSnapshotTable loadState="empty" snapshots={[]} onCompleteDataSetup={vi.fn()} />,
    );
    expect(markup).toContain('暂无收益历史');
    expect(markup).toContain('完成数据配置');
    expect(markup).not.toContain('<table');
  });

  it('没有快照时仍显示当前持仓估值和成本差', () => {
    const markup = renderToStaticMarkup(
      <PerformanceMetrics
        latest={undefined}
        summary={null}
        snapshotCount={0}
        currentValue={1084.5}
        currentPnl={32.4}
        currentPnlRate={0.0308}
      />,
    );
    expect(markup).toContain('¥1,084.50');
    expect(markup).toContain('+¥32.40');
    expect(markup).toContain('+3.08%');
    expect(markup).toContain('需要 ≥ 2 个快照');
  });

  it('快照适配层保留服务端 partial 与 missingSymbols', async () => {
    const request = vi.fn(
      async <T,>() =>
        [
          {
            id: 'snapshot-1',
            capturedAt: '2026-08-24T00:00:00.000Z',
            marketValue: '100',
            costValue: '80',
            cashValue: '20',
            payload: { dataQuality: { partial: true, missingSymbols: ['600519.SH'] } },
          },
        ] as T,
    );
    const result = await fetchPerformanceHistory('actual', undefined, {
      request,
    } as unknown as DesktopRequestClient);
    expect(result[0]).toMatchObject({
      marketValue: 100,
      partial: true,
      missingSymbols: ['600519.SH'],
    });
  });
});

describe('一键估值快照契约', () => {
  const emptyTable = (props: {
    onCaptureSnapshot?: () => void;
    capturingSnapshot?: boolean;
    captureDisabled?: boolean;
    onCompleteDataSetup?: () => void;
  }) =>
    renderToStaticMarkup(
      <PerformanceSnapshotTable
        loadState="empty"
        snapshots={[]}
        {...props}
      />,
    );

  it('空状态提供一键快照按钮，保留完成数据配置入口', () => {
    const markup = emptyTable({
      onCaptureSnapshot: () => {},
      onCompleteDataSetup: () => {},
    });
    expect(markup).toContain('立即拍一个估值快照');
    expect(markup).toContain('完成数据配置');
    expect(markup).not.toContain('disabled=""');
  });

  it('拍摄中显示忙碌态，无账户时禁用并提示', () => {
    const capturing = emptyTable({ onCaptureSnapshot: () => {}, capturingSnapshot: true });
    expect(capturing).toContain('拍摄中…');
    expect(capturing).toContain('aria-busy="true"');
    expect(capturing).toContain('disabled=""');

    const disabled = emptyTable({
      onCaptureSnapshot: () => {},
      captureDisabled: true,
    });
    expect(disabled).toContain('disabled=""');
    expect(disabled).toContain('当前模式暂无可拍摄账户');

    expect(emptyTable({})).not.toContain('立即拍一个估值快照');
  });

  it('一键快照调用收盘快照工作流并携带当前模式账户与时间', async () => {
    const request = vi.fn(async <T,>(path: string, init?: RequestInit) => {
      expect(path).toBe('/automations/workflows/close-snapshots');
      expect(init?.method).toBe('POST');
      expect(JSON.parse(String(init?.body))).toMatchObject({
        accountIds: ['acc-1', 'acc-2'],
      });
      expect(typeof JSON.parse(String(init?.body)).capturedAt).toBe('string');
      return { capturedAt: '2026-09-06T08:00:00.000Z', snapshots: [] } as T;
    });
    await captureCloseSnapshots(
      { accountIds: ['acc-1', 'acc-2'], capturedAt: new Date().toISOString() },
      { request } as unknown as DesktopRequestClient,
    );
    expect(request).toHaveBeenCalledOnce();
  });
});
