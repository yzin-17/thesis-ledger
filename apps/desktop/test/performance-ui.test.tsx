import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import {
  PerformanceAccountSelector,
  PerformanceAllocationSection,
  PerformanceMetrics,
} from '../src/features/performance/PerformanceSections.js';
import { fetchPerformanceHistory } from '../src/features/performance/performance.api.js';
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
        onModeChange={vi.fn()}
        onAccountChange={vi.fn()}
      />,
    );
    expect(markup).toContain('当前模式包含多个币种');
    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('人民币账户');
    expect(markup).not.toContain('影子账户');
  });

  it('Snapshot 不足或 partial 时使用破折号和明确原因', () => {
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
        summaryError="收益摘要包含 partial Snapshot，请补齐行情"
      />,
    );
    expect(markup).toContain('>—<');
    expect(markup).toContain('收益摘要包含 partial Snapshot，请补齐行情');
    expect(markup).toContain('行情不完整，暂不显示总资产');
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
        onEditTargets={vi.fn()}
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
        onEditTargets={vi.fn()}
      />,
    );
    expect(markup).toContain('股票');
    expect(markup).toContain('ETF');
    expect(markup).toContain('0.00%');
  });

  it('目标读取失败时保留当前配置但标记目标不可用', () => {
    const markup = renderToStaticMarkup(
      <PerformanceAllocationSection
        loadState="stale"
        allocationRows={[{ category: 'stock', value: 100, weight: 1 }]}
        rebalanceRows={[]}
        targets={{}}
        dataQuality={{ partial: false, missingSymbols: [] }}
        targetsUnavailable
        valuedAt="2026-08-24T00:00:00.000Z"
        editDisabled
        onEditTargets={vi.fn()}
      />,
    );
    expect(markup).toContain('目标配置不可用');
    expect(markup).toContain('不可用');
    expect(markup).toContain('¥100.00');
  });

  it('Snapshot 适配层保留服务端 partial 与 missingSymbols', async () => {
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
